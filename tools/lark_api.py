"""飞书云盘 API 客户端（含 OAuth token 自动续期、递归列目录、导出并下载 docx）。

只依赖标准库。所有请求自动带 Bearer token，401 时用 refresh_token 续期一次。
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

OPEN_API = "https://open.feishu.cn/open-apis"
SECRET_DIR = ".lark-secrets"
TOKEN_FILE = os.path.join(SECRET_DIR, "feishu-token.json")

# 云盘文件类型码 -> 语义
TYPE_FOLDER = "folder"
TYPE_DOCX = "docx"
TYPE_DOC = "doc"
TYPE_SHEET = "sheet"
TYPE_BITABLE = "bitable"
TYPE_MINDNOTE = "mindnote"
TYPE_FILE = "file"

EXPORTABLE = {TYPE_DOCX, TYPE_DOC, TYPE_SHEET}


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

    def _refresh(self) -> bool:
        refresh_token = self.token.get("refresh_token")
        app_id = self.token.get("_app_id")
        app_secret = self.token.get("_app_secret")
        if not refresh_token or not app_id or not app_secret:
            return False

        payload = urllib.parse.urlencode(
            {
                "grant_type": "refresh_token",
                "client_id": app_id,
                "client_secret": app_secret,
                "refresh_token": refresh_token,
            }
        ).encode()

        request = urllib.request.Request(
            f"{OPEN_API}/authen/v2/oauth/token",
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
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
        fresh["_obtained_at"] = int(time.time())
        self.token = fresh
        self._save_token()
        if self.verbose:
            print("  [token] 已用 refresh_token 自动续期")
        return True

    def request(self, method, path, params=None, body=None, raw=False, _retried=False):
        url = f"{OPEN_API}{path}"
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
        """列出文件夹一层内容，自动翻页。folder_token 为空表示根目录。"""
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
                items.append(
                    {
                        "token": item.get("token"),
                        "name": item.get("name"),
                        "type": item.get("type"),
                        "parent": item.get("parent_token"),
                        "url": item.get("url"),
                        "modified": item.get("modified_time"),
                    }
                )

            if not data.get("has_more"):
                break
            page_token = data.get("next_page_token")
            if not page_token:
                break

        return items

    def walk(self, folder_token: str, path="", max_depth=6, _depth=0):
        """递归遍历文件夹，返回扁平列表，每项带 path 表示其在云盘中的层级。"""
        entries = []
        for item in self.list_folder(folder_token):
            if item["type"] == TYPE_FOLDER:
                label = f"{path}/{item['name']}".strip("/")
                if _depth < max_depth:
                    entries.extend(
                        self.walk(item["token"], label, max_depth, _depth + 1)
                    )
                else:
                    entries.append({**item, "path": label, "truncated": True})
            else:
                entries.append({**item, "path": f"{path}/{item['name']}".strip("/")})
        return entries

    # ---------- 导出 ----------

    def export_docx(self, token: str, file_type: str) -> str:
        """创建导出任务并轮询，返回可下载的 file_token。

        飞书没有 Markdown 导出，docx/sheet 统一走 docx 中转。
        """
        data = self.request(
            "POST",
            "/drive/v1/export_tasks",
            body={"file_extension": "docx", "token": token, "type": file_type},
        ) or {}

        ticket = data.get("ticket")
        if not ticket:
            raise FeishuError(f"导出任务未返回 ticket：{data}")

        deadline = time.time() + 180
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
                return file_token
            if status in (1, 2):
                raise FeishuError(f"导出任务失败 job_status={status}：{result}")

            time.sleep(2)

        raise FeishuError(f"导出任务超时（ticket={ticket}）")

    def download(self, file_token: str) -> bytes:
        return self.request(
            "GET", f"/drive/v1/export_tasks/file/{file_token}/download", raw=True
        )
