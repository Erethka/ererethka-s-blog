"""飞书云盘 -> 博客「技术记录」批量导入流水线。

分阶段执行，每阶段产物落盘，便于检查与重跑：

  1) crawl    递归列出云盘文件夹，结果写入 .lark-work/inventory.json
  2) process  逐个导出 docx、转 Markdown、分类，写入 .lark-work/staged/*.md + report.json
  3) upload   把 staged 的 Markdown 写进私有仓库 docs/（经博客 Worker 会话）
  4) verify   读回 docs/ 列表，确认页面能看到这些文档

示例：
    python tools/lark_import.py crawl   --folder <fldcn...> --folder <fldcn...>
    python tools/lark_import.py process --limit 3
    python tools/lark_import.py upload  --password ***
    python tools/lark_import.py verify  --password ***
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from classify import classify, suggest_tags  # noqa: E402
from docx_to_md import docx_to_markdown  # noqa: E402
from lark_api import EXPORTABLE, TYPE_FOLDER, FeishuClient, FeishuError  # noqa: E402

WORK_DIR = ".lark-work"
STAGED_DIR = os.path.join(WORK_DIR, "staged")
DOCX_DIR = os.path.join(WORK_DIR, "docx")
INVENTORY = os.path.join(WORK_DIR, "inventory.json")
REPORT = os.path.join(WORK_DIR, "report.json")
COOKIE_FILE = os.path.join(WORK_DIR, "worker-cookie.txt")

WORKER = "https://ererethka-apex-auth.erethka.workers.dev"
ORIGIN = "https://erethka.github.io"


# --------------------------------------------------------------------------
# 通用
# --------------------------------------------------------------------------


def ensure_dirs():
    for path in (WORK_DIR, STAGED_DIR, DOCX_DIR):
        os.makedirs(path, exist_ok=True)


def slugify(value: str, fallback="untitled") -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^\w\u4e00-\u9fff-]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value[:80] or fallback


def yaml_string(value) -> str:
    text = str(value if value is not None else "")
    text = text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ").strip()
    return f'"{text}"'


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def read_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, payload):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def extract_folder_token(value: str) -> str:
    """从链接或裸 token 里取出文件夹 token。"""
    value = (value or "").strip()
    match = re.search(r"/(?:drive/)?folder/([A-Za-z0-9]+)", value)
    if match:
        return match.group(1)
    match = re.search(r"[?&]folder_token=([A-Za-z0-9]+)", value)
    if match:
        return match.group(1)
    return value


# --------------------------------------------------------------------------
# 阶段 1：爬取云盘目录
# --------------------------------------------------------------------------


def cmd_crawl(args):
    client = FeishuClient()
    ensure_dirs()

    tokens = [extract_folder_token(item) for item in args.folder]
    print(f"目标文件夹：{tokens}")

    all_entries = []
    for folder_token in tokens:
        if folder_token:
            print(f"遍历文件夹 {folder_token} …")
        else:
            print("遍历「我的空间」根目录 …")
        entries = client.walk(folder_token)
        print(f"  -> 找到 {len(entries)} 个项目")
        all_entries.extend(entries)

    # 去重（同一文档可能在多个文件夹里出现）
    unique: dict[str, dict] = {}
    for entry in all_entries:
        token = entry.get("token")
        if not token:
            continue
        if token in unique:
            existing = unique[token]
            paths = existing.setdefault("paths", [existing.get("path", "")])
            if entry.get("path") not in paths:
                paths.append(entry.get("path"))
            continue
        entry["paths"] = [entry.get("path", "")]
        unique[token] = entry

    items = sorted(unique.values(), key=lambda item: item.get("path", ""))
    write_json(INVENTORY, {"crawled_at": now_iso(), "items": items})

    by_type: dict[str, int] = {}
    for item in items:
        by_type[item["type"]] = by_type.get(item["type"], 0) + 1

    print(f"\n共 {len(items)} 个去重后的项目，类型分布：{by_type}")
    exportable = [item for item in items if item["type"] in EXPORTABLE]
    skipped = [item for item in items if item["type"] not in EXPORTABLE]
    print(f"可导出为 Markdown 的文档：{len(exportable)}")
    if skipped:
        print(f"暂不处理（需单独方案）：{len(skipped)}")
        for item in skipped[:15]:
            print(f"    [{item['type']}] {item.get('path')}")
    print(f"\n清单已写入 {INVENTORY}")


# --------------------------------------------------------------------------
# 阶段 2：导出 + 转换 + 分类
# --------------------------------------------------------------------------


def cmd_process(args):
    ensure_dirs()
    inventory = read_json(INVENTORY, None)
    if not inventory:
        print(f"找不到 {INVENTORY}，请先运行 crawl。")
        return 1

    items = [item for item in inventory["items"] if item["type"] in EXPORTABLE]
    if args.only:
        wanted = {extract_folder_token(value) for value in args.only}
        items = [item for item in items if item["token"] in wanted]
    if args.limit:
        items = items[: args.limit]

    client = FeishuClient()
    existing = {entry["token"]: entry for entry in read_json(REPORT, {}).get("items", [])}
    results = []

    for index, item in enumerate(items, start=1):
        token = item["token"]
        name = item.get("name") or token
        path = item.get("path") or name
        label = f"[{index}/{len(items)}] {path}"
        print(f"\n{label}")

        if token in existing and existing[token].get("status") == "ok" and not args.force:
            print("  已处理过，跳过（--force 可重跑）")
            results.append(existing[token])
            continue

        record = {
            "token": token,
            "name": name,
            "path": path,
            "paths": item.get("paths", [path]),
            "type": item["type"],
            "url": item.get("url"),
            "modified": item.get("modified"),
        }

        docx_path = os.path.join(DOCX_DIR, f"{slugify(name)}-{token[:8]}.docx")

        try:
            if not (os.path.exists(docx_path) and os.path.getsize(docx_path) > 0):
                print("  导出 docx …")
                file_token = client.export_docx(token, item["type"])
                blob = client.download(file_token)
                with open(docx_path, "wb") as handle:
                    handle.write(blob)
                print(f"  已下载 {len(blob)} bytes")
            else:
                print("  复用已下载的 docx")

            markdown = docx_to_markdown(docx_path)
            if not markdown.strip():
                raise FeishuError("转换结果为空")

            category, detail = classify(name, markdown, path)
            tags = suggest_tags(name, markdown)
            title = re.sub(r"\.(docx?|markdown?|md)$", "", name, flags=re.I).strip() or name

            record.update(
                {
                    "status": "ok",
                    "title": title,
                    "category": category,
                    "category_detail": detail,
                    "tags": tags,
                    "chars": len(markdown),
                    "docx": docx_path,
                    "markdown_preview": markdown[:400],
                }
            )
            staged_path = os.path.join(STAGED_DIR, f"{slugify(title)}-{token[:8]}.md")
            with open(staged_path, "w", encoding="utf-8") as handle:
                handle.write(markdown)
            record["markdown_file"] = staged_path

            flag = "  ⚠ 分类不确定" if detail.get("ambiguous") else ""
            print(f"  分类: {category}  ({detail.get('top_score')} 分)  标签: {', '.join(tags)}{flag}")

        except Exception as error:  # noqa: BLE001
            record.update({"status": "failed", "error": str(error)[:400]})
            print(f"  失败：{error}")

        results.append(record)
        write_json(
            REPORT,
            {"generated_at": now_iso(), "count": len(results), "items": results},
        )

    ok = sum(1 for item in results if item.get("status") == "ok")
    failed = [item for item in results if item.get("status") != "ok"]
    print(f"\n处理完成：成功 {ok}，失败 {len(failed)}")
    for item in failed:
        print(f"  ✗ {item.get('path')} -> {item.get('error')}")

    categories: dict[str, int] = {}
    for item in results:
        if item.get("status") == "ok":
            categories[item["category"]] = categories.get(item["category"], 0) + 1
    print("\n分类分布：")
    for name, count in sorted(categories.items(), key=lambda kv: -kv[1]):
        print(f"  {count:3}  {name}")
    print(f"\n报告已写入 {REPORT}")
    return 0


# --------------------------------------------------------------------------
# 阶段 3：上传到私有仓库 docs/
# --------------------------------------------------------------------------


class BlogWorker:
    """通过博客 Worker 的会话读写私有仓库 docs/。"""

    def __init__(self, password=None):
        self.cookie = ""
        if password:
            self.login(password)
        elif os.path.exists(COOKIE_FILE):
            with open(COOKIE_FILE, "r", encoding="utf-8") as handle:
                self.cookie = handle.read().strip()

    def _call(self, path, method="GET", body=None):
        headers = {"Origin": ORIGIN, "User-Agent": "ererethka-lark-import"}
        if self.cookie:
            headers["Cookie"] = self.cookie
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = urllib.request.Request(
            f"{WORKER}{path}", data=data, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.status, response.headers, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.headers, error.read()

    def login(self, password):
        status, headers, payload = self._call(
            "/login", "POST", {"password": password}
        )
        if status != 200:
            raise RuntimeError(
                f"Worker 登录失败（HTTP {status}）：{payload.decode('utf-8', 'replace')[:200]}"
            )
        raw = headers.get("Set-Cookie") or ""
        match = re.search(r"apex_session=([^;]+)", raw)
        if not match:
            raise RuntimeError("Worker 登录成功但没有返回会话 Cookie。")
        self.cookie = f"apex_session={match.group(1)}"
        ensure_dirs()
        with open(COOKIE_FILE, "w", encoding="utf-8") as handle:
            handle.write(self.cookie)
        os.chmod(COOKIE_FILE, 0o600)

    def raw_get(self, repo_path):
        """直连 GitHub 原始内容（公开仓库可用）。"""
        url = f"https://raw.githubusercontent.com/Erethka/ererethka-s-blog/main/{repo_path}"
        request = urllib.request.Request(url, headers={"User-Agent": "probe"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read().decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            return ""

    def list_documents(self):
        status, _, payload = self._call("/documents")
        if status != 200:
            raise RuntimeError(
                f"读取文档列表失败（HTTP {status}）：{payload.decode('utf-8', 'replace')[:200]}"
            )
        return json.loads(payload.decode("utf-8")).get("documents", [])

    def put_document(self, path, content, message):
        status, _, payload = self._call(
            "/documents",
            "PUT",
            {"path": path, "content": content, "message": message},
        )
        text = payload.decode("utf-8", "replace")
        if status not in (200, 201):
            raise RuntimeError(f"上传失败（HTTP {status}）：{text[:300]}")
        return json.loads(text)


def build_front_matter(item):
    title = item["title"]
    tags = item.get("tags") or []
    date = item.get("modified") or ""
    if date:
        try:
            stamp = int(date)
            if stamp > 10_000_000_000:
                stamp //= 1000
            date = dt.datetime.fromtimestamp(stamp, dt.timezone.utc).strftime("%Y-%m-%d")
        except Exception:  # noqa: BLE001
            date = dt.datetime.now().strftime("%Y-%m-%d")
    else:
        date = dt.datetime.now().strftime("%Y-%m-%d")

    lines = [
        "---",
        f"title: {yaml_string(title)}",
        f"category: {yaml_string(item['category'])}",
        f"tags: [{', '.join(yaml_string(tag) for tag in tags)}]",
        f"date: {yaml_string(date)}",
        f"updated: {yaml_string(now_iso())}",
        f"status: {yaml_string(item.get('status_field', 'draft'))}",
        f"slug: {yaml_string(slugify(title))}",
        f"source: {yaml_string('feishu:' + str(item.get('token', '')))}",
        f"source_path: {yaml_string(item.get('path', ''))}",
        "---",
        "",
    ]
    return "\n".join(lines)


def cmd_upload(args):
    report = read_json(REPORT, None)
    if not report:
        print(f"找不到 {REPORT}，请先运行 process。")
        return 1

    items = [item for item in report["items"] if item.get("status") == "ok"]
    if args.only:
        wanted = {extract_folder_token(value) for value in args.only}
        items = [item for item in items if item.get("token") in wanted]
    if not items:
        print("没有可上传的文档。")
        return 1

    worker = BlogWorker(args.password)
    remote = {doc["path"]: doc for doc in worker.list_documents()}
    print(f"私有仓库 docs/ 现有 {len(remote)} 个文档")

    if args.dry_run:
        print("\n[DRY RUN] 将要写入的文件：")
        for item in items:
            target = f"docs/{slugify(item['title'])}.md"
            action = "覆盖" if target in remote else "新建"
            print(f"  {action}  {target}   <- {item['path']}  [{item['category']}]")
        return 0

    uploaded = 0
    failures = []

    for index, item in enumerate(items, start=1):
        target = f"docs/{slugify(item['title'])}.md"
        with open(item["markdown_file"], "r", encoding="utf-8") as handle:
            body = handle.read()

        content = build_front_matter(item) + body.rstrip() + "\n"
        action = "更新" if target in remote else "新增"
        message = f"docs: import from feishu ({action}) {item['title']}"

        try:
            worker.put_document(target, content, message)
            uploaded += 1
            print(f"[{index}/{len(items)}] {action} {target}")
        except Exception as error:  # noqa: BLE001
            failures.append((target, str(error)))
            print(f"[{index}/{len(items)}] 失败 {target} -> {error}")

    print(f"\n上传完成：成功 {uploaded}，失败 {len(failures)}")
    for target, error in failures:
        print(f"  ✗ {target} -> {error}")
    return 0 if not failures else 1


# --------------------------------------------------------------------------
# 阶段 4：读回验证
# --------------------------------------------------------------------------


def cmd_verify(args):
    worker = BlogWorker(args.password)
    documents = worker.list_documents()
    print(f"技术记录页可见文档：{len(documents)}\n")

    by_category: dict[str, list[dict]] = {}
    for doc in documents:
        by_category.setdefault(doc.get("category") or "其他", []).append(doc)

    for category in sorted(by_category):
        docs = by_category[category]
        print(f"[{category}]  {len(docs)} 篇")
        for doc in sorted(docs, key=lambda entry: entry.get("path", "")):
            print(f"    {doc.get('status', '?'):9} {doc.get('date') or '----------'}  {doc.get('path')}")
        print()

    print("分类汇总：")
    for category in sorted(by_category, key=lambda key: -len(by_category[key])):
        print(f"  {len(by_category[category]):3}  {category}")
    return 0


# --------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p_crawl = sub.add_parser("crawl", help="递归列出云盘文件夹")
    p_crawl.add_argument("--folder", action="append", required=True,
                         help="文件夹链接或 token，可多次传入")
    p_crawl.set_defaults(func=cmd_crawl)

    p_process = sub.add_parser("process", help="导出并转换 Markdown")
    p_process.add_argument("--limit", type=int, help="只处理前 N 篇（试跑用）")
    p_process.add_argument("--only", action="append", help="只处理指定 token")
    p_process.add_argument("--force", action="store_true", help="重跑已处理的文档")
    p_process.set_defaults(func=cmd_process)

    p_upload = sub.add_parser("upload", help="上传到私有仓库 docs/")
    p_upload.add_argument("--password", help="博客登录密码（换取 Worker 会话）")
    p_upload.add_argument("--only", action="append", help="只上传指定 token")
    p_upload.add_argument("--dry-run", action="store_true", help="只打印将要写入的文件")
    p_upload.set_defaults(func=cmd_upload)

    p_verify = sub.add_parser("verify", help="读回 docs/ 列表验证")
    p_verify.add_argument("--password", help="博客登录密码")
    p_verify.set_defaults(func=cmd_verify)

    args = parser.parse_args()
    return args.func(args) or 0


if __name__ == "__main__":
    raise SystemExit(main())
