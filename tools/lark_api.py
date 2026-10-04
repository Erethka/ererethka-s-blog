"""Lark / 飞书云盘 API 客户端。

支持国际版 Lark 与中国版飞书（域名不同，见 lark_regions.py）。
功能：OAuth token 自动续期、递归列目录（含快捷方式解析）、按类型导出并下载。

关键约束（决定了这里的实现）：
  * 飞书/Lark **没有 Markdown 导出**，只能 docx / pdf / xlsx / csv
  * docx、doc  -> 可导出 docx
  * sheet、bitable -> **只能导出 xlsx / csv**，导出 docx 会报 1069918
  * mindnote -> 不支持导出
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from lark_regions import DEFAULT_REGION, get_region

SECRET_DIR = ".lark-secrets"
TOKEN_FILE = os.path.join(SECRET_DIR, "feishu-token.json")

TYPE_FOLDER = "folder"
TYPE_DOCX = "docx"
TYPE_DOC = "doc"
TYPE_SHEET = "sheet"
TYPE_BITABLE = "bitable"
TYPE_MINDNOTE = "mindnote"
TYPE_FILE = "file"
TYPE_SHORTCUT = "shortcut"

# 每种云文档类型可用的导出扩展名（顺序即优先级）
EXPORT_EXTENSIONS = {
    TYPE_DOCX: ["docx"],
    TYPE_DOC: ["docx"],
    TYPE_SHEET: ["xlsx", "csv"],
    TYPE_BITABLE: ["xlsx", "csv"],
}

# 可导出为 Markdown 的类型
EXPORTABLE = set(EXPORT_EXTENSIONS)

# 导出任务处于「进行中」的状态码
JOB_PENDING = {1, 2}


class FeishuError(RuntimeError):
    def __init__(self, message, code=None, payload=None):
        super().__init__(message)
        self.code = code
        self.payload = payload


class FeishuClient:
    def __init__(self, token_file: str = TOKEN_FILE, verbose: bool = True):
        if not os.path.exists(token_file):
            raise FeishuError(
                f"找不到 token 文件 {token_file}，请先运行 tools/lark_auth.py 完成授权。"
            )
        self.token_file = token_file
        with open(token_file, "r", encoding="utf-8") as handle:
            self.token = json.load(handle)

        self.region_name = self.token.get("_region") or DEFAULT_REGION
        self.region = get_region(self.region_name)
        self.open_api = self.region["open_api"]
        self.verbose = verbose
        self._last_call = 0.0

    # ---------- 基础设施 ----------

    def _throttle(self, minimum_interval: float = 0.12):
        elapsed = time.time() - self._last_call
        if elapsed < minimum_interval:
            time.sleep(minimum_interval - elapsed)
        self._last_call = time.time()

    def _save_token(self):
        with open(self.token_file, "w", encoding="utf-8") as handle:
            json.dump(self.token, handle, ensure_ascii=False, indent=2)
        try:
            os.chmod(self.token_file, 0o600)
        except OSError:
            pass

    def _refresh(self) -> bool:
        refresh_token = self.token.get("refresh_token")
        app_id = self.token.get("_app_id")
        app_secret = self.token.get("_app_secret")
        if not refresh_token or not app_id or not app_secret:
            return False

        fields = {
            "grant_type": "refresh_token",
            "client_id": app_id,
            "client_secret": app_secret,
            "refresh_token": refresh_token,
        }
        if self.region["token_body"] == "json":
            data = json.dumps(fields).encode("utf-8")
            content_type = "application/json; charset=utf-8"
        else:
            data = urllib.parse.urlencode(fields).encode()
            content_type = "application/x-www-form-urlencoded"

        request = urllib.request.Request(
            self.region["token_url"],
            data=data,
            headers={"Content-Type": content_type},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                fresh = json.loads(response.read().decode("utf-8"))
        except Exception:  # noqa: BLE001
            return False

        if not fresh.get("access_token"):
            return False

        fresh["_app_id"] = app_id
        fresh["_app_secret"] = app_secret
        fresh["_region"] = self.region_name
        fresh["_obtained_at"] = int(time.time())
        self.token = fresh
        self._save_token()
        if self.verbose:
            print("  [token] 已用 refresh_token 自动续期")
        return True

    def request(self, method, path, params=None, body=None, raw=False, _retried=False):
        url = f"{self.open_api}{path}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"

        headers = {
            "Authorization": f"Bearer {self.token['access_token']}",
            "User-Agent": "ererethka-blog-lark-import",
        }
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"

        self._throttle()
        request = urllib.request.Request(url, data=data, headers=headers, method=method)

        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                content = response.read()
        except urllib.error.HTTPError as error:
            content = error.read()
            if error.code == 401 and not _retried and self._refresh():
                return self.request(method, path, params, body, raw, _retried=True)
            if error.code in (429, 500, 502, 503) and not _retried:
                time.sleep(3)
                return self.request(method, path, params, body, raw, _retried=True)
            detail = content.decode("utf-8", "replace")[:400]
            raise FeishuError(
                f"HTTP {error.code} {method} {path} -> {detail}", code=error.code
            ) from error

        if raw:
            return content

        payload = json.loads(content.decode("utf-8"))

        # 99991663 = token 失效
        if payload.get("code") == 99991663 and not _retried and self._refresh():
            return self.request(method, path, params, body, raw, _retried=True)

        if payload.get("code") not in (0, None):
            raise FeishuError(
                f"code={payload.get('code')} msg={payload.get('msg')} ({method} {path})",
                code=payload.get("code"),
                payload=payload,
            )

        return payload.get("data")

    # ---------- 云盘 ----------

    def list_folder(self, folder_token: str):
        """列出文件夹一层内容，自动翻页，并把快捷方式解析为真实文档。"""
        items = []
        page_token = None

        while True:
            params = {"page_size": 200}
            if folder_token:
                params["folder_token"] = folder_token
            if page_token:
                params["page_token"] = page_token

            data = self.request("GET", "/drive/v1/files", params=params) or {}
            for item in data.get("files") or []:
                items.append(self._normalize_item(item))

            if not data.get("has_more"):
                break
            page_token = data.get("next_page_token")
            if not page_token:
                break

        return items

    @staticmethod
    def _normalize_item(item):
        """把快捷方式展开成它指向的真实文档。"""
        entry = {
            "token": item.get("token"),
            "name": item.get("name"),
            "type": item.get("type"),
            "parent": item.get("parent_token"),
            "url": item.get("url"),
            "modified": item.get("modified_time"),
        }

        if item.get("type") == TYPE_SHORTCUT:
            info = item.get("shortcut_info") or {}
            target_token = info.get("target_token")
            target_type = info.get("target_type")
            if target_token and target_type:
                entry["token"] = target_token
                entry["type"] = target_type
                entry["via_shortcut"] = item.get("token")
            else:
                # 解析不出目标就标为不可处理，避免静默丢失
                entry["type"] = TYPE_SHORTCUT
                entry["unresolved_shortcut"] = True

        return entry

    def walk(self, folder_token: str, path="", max_depth=6, _depth=0, seen=None):
        """递归遍历文件夹，返回扁平列表，每项带 path 表示其在云盘中的层级。"""
        if seen is None:
            seen = set()

        entries = []
        for item in self.list_folder(folder_token):
            if item["type"] == TYPE_FOLDER:
                label = f"{path}/{item['name']}".strip("/")
                if item["token"] in seen:
                    if self.verbose:
                        print(f"  [跳过] 检测到循环引用：{label}")
                    continue
                if _depth < max_depth:
                    seen.add(item["token"])
                    entries.extend(
                        self.walk(item["token"], label, max_depth, _depth + 1, seen)
                    )
                else:
                    entries.append({**item, "path": label, "truncated": True})
            else:
                entries.append({**item, "path": f"{path}/{item['name']}".strip("/")})
        return entries

    # ---------- 导出 ----------

    @staticmethod
    def extension_for(file_type: str) -> str | None:
        options = EXPORT_EXTENSIONS.get(file_type)
        return options[0] if options else None

    def export(self, token: str, file_type: str, extension: str | None = None) -> tuple[str, str]:
        """创建导出任务并轮询，返回 (file_token, extension)。

        sheet / bitable 必须用 xlsx，docx 会报 1069918 类型不匹配。
        """
        allowed = EXPORT_EXTENSIONS.get(file_type)
        if not allowed:
            raise FeishuError(f"类型 {file_type!r} 不支持导出")

        extension = extension or allowed[0]
        if extension not in allowed:
            raise FeishuError(
                f"类型 {file_type!r} 不支持导出为 {extension!r}，可选：{allowed}"
            )

        data = self.request(
            "POST",
            "/drive/v1/export_tasks",
            body={"file_extension": extension, "token": token, "type": file_type},
        ) or {}

        ticket = data.get("ticket")
        if not ticket:
            raise FeishuError(f"导出任务未返回 ticket：{data}")

        deadline = time.time() + 240
        while time.time() < deadline:
            result = (
                self.request(
                    "GET",
                    f"/drive/v1/export_tasks/{ticket}",
                    params={"token": token},
                )
                or {}
            )
            job = result.get("result") or {}
            status = job.get("job_status")

            if status == 0:
                file_token = job.get("file_token")
                if not file_token:
                    raise FeishuError(f"导出完成但没有 file_token：{result}")
                return file_token, job.get("file_extension") or extension

            if status in JOB_PENDING:
                time.sleep(2)
                continue

            # 3/107/108/109/110/111/122/123/6000 等全部是失败
            reason = job.get("job_error_msg") or "未知原因"
            raise FeishuError(f"导出任务失败 job_status={status}：{reason}")

        raise FeishuError(f"导出任务超时（ticket={ticket}）")

    # 兼容旧调用名
    def export_docx(self, token: str, file_type: str) -> str:
        file_token, _ = self.export(token, file_type)
        return file_token

    def download(self, file_token: str) -> bytes:
        return self.request(
            "GET", f"/drive/v1/export_tasks/file/{file_token}/download", raw=True
        )
