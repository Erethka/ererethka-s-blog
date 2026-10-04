"""Lark / 飞书 OAuth 本地回调服务。

用途：用自建应用的 App ID / App Secret 换 user_access_token。
流程：本脚本打印授权链接 -> 浏览器里点「授权」-> 回调到
http://localhost:17890/callback -> 脚本用 code 换 token 并写入
.lark-secrets/feishu-token.json。

注意：飞书（中国版）和 Lark（国际版）是两套独立体系，用 --region 区分，
默认 lark（国际版）。两边的凭证不可互用。

用法：
    python tools/lark_auth.py --region lark --app-id cli_xxx --app-secret xxx
"""

import argparse
import json
import os
import secrets
import sys
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lark_regions import DEFAULT_REGION, get_region, region_choices  # noqa: E402

REDIRECT_URI = "http://localhost:17890/callback"
SECRET_DIR = ".lark-secrets"
TOKEN_FILE = os.path.join(SECRET_DIR, "feishu-token.json")

SCOPES = " ".join(
    [
        "drive:drive:readonly",
        "drive:export:readonly",
        "offline_access",
    ]
)

_result = {"code": None, "state": None, "error": None}


class CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if parsed.path != "/callback":
            self.send_response(404)
            self.end_headers()
            return

        _result["code"] = (params.get("code") or [None])[0]
        _result["state"] = (params.get("state") or [None])[0]
        _result["error"] = (params.get("error") or [None])[0]

        ok = bool(_result["code"]) and not _result["error"]
        body = (
            "<h2>授权成功，可以关闭这个页面了。</h2><p>凭证已经回传给本地脚本。</p>"
            if ok
            else f"<h2>授权失败</h2><pre>{json.dumps(_result, ensure_ascii=False)}</pre>"
        )
        payload = f"<!doctype html><meta charset='utf-8'><body>{body}</body>".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):  # 静默，避免污染输出
        pass


def exchange_code(region, app_id, app_secret, code):
    fields = {
        "grant_type": "authorization_code",
        "client_id": app_id,
        "client_secret": app_secret,
        "code": code,
        "redirect_uri": REDIRECT_URI,
    }

    if region["token_body"] == "json":
        # 国际版 Lark 文档固定 Content-Type: application/json
        data = json.dumps(fields).encode("utf-8")
        content_type = "application/json; charset=utf-8"
    else:
        data = urllib.parse.urlencode(fields).encode()
        content_type = "application/x-www-form-urlencoded"

    request = urllib.request.Request(
        region["token_url"],
        data=data,
        headers={"Content-Type": content_type},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-id", required=True)
    parser.add_argument("--app-secret", required=True)
    parser.add_argument(
        "--region",
        default=DEFAULT_REGION,
        choices=region_choices(),
        help="lark=国际版（默认），feishu=中国版",
    )
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    region = get_region(args.region)
    print(f"区域：{region['label']}")
    print(f"授权端点：{region['authorize']}")

    state = secrets.token_urlsafe(16)
    query = urllib.parse.urlencode(
        {
            "client_id": args.app_id,
            "redirect_uri": REDIRECT_URI,
            "response_type": "code",
            "state": state,
            "scope": SCOPES,
        }
    )
    authorize = f"{region['authorize']}?{query}"

    server = HTTPServer(("127.0.0.1", 17890), CallbackHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    print("=" * 72)
    print("请在浏览器里打开下面这个链接，并点击「授权」：")
    print()
    print(authorize)
    print()
    print("=" * 72)
    sys.stdout.flush()

    if not args.no_browser:
        try:
            webbrowser.open(authorize)
        except Exception:  # noqa: BLE001
            pass

    deadline = time.time() + 300
    while time.time() < deadline and not _result["code"] and not _result["error"]:
        time.sleep(0.5)

    server.shutdown()

    if _result["error"]:
        print(f"授权被拒绝或失败：{_result['error']}")
        return 1

    if not _result["code"]:
        print("等待授权超时（300 秒），请重新运行。")
        return 1

    if _result["state"] != state:
        print("state 校验失败，可能存在 CSRF 风险，已中止。")
        return 1

    print("拿到授权码，正在换取 token…")
    try:
        token = exchange_code(region, args.app_id, args.app_secret, _result["code"])
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:500]
        print(f"换取 token 失败（HTTP {error.code}）：{detail}")
        return 1

    # v2 接口成功时直接返回 access_token；失败时返回 code/error
    if not token.get("access_token"):
        print("换取 token 失败：")
        print(json.dumps(token, ensure_ascii=False, indent=2))
        return 1

    os.makedirs(SECRET_DIR, exist_ok=True)
    token["_obtained_at"] = int(time.time())
    token["_region"] = args.region
    token["_app_id"] = args.app_id
    # 保存 secret 是为了让 lark_api.py 能在 token 过期时用 refresh_token 自动续期。
    # 该文件已被 .gitignore 忽略，权限同样收紧。
    token["_app_secret"] = args.app_secret
    with open(TOKEN_FILE, "w", encoding="utf-8") as handle:
        json.dump(token, handle, ensure_ascii=False, indent=2)
    try:
        os.chmod(TOKEN_FILE, 0o600)
    except OSError:
        pass

    print(f"成功。token 已写入 {TOKEN_FILE}")
    print(f"  scope      : {token.get('scope')}")
    print(f"  有效期(秒) : {token.get('expires_in')}")
    if token.get("refresh_token"):
        print("  已获得 refresh_token，过期后可自动续期。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
