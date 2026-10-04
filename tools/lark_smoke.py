"""真实连通性冒烟测试：验证 token、云盘读取、导出与转换。

拿到 user_access_token 后先跑这个，确认国际版 Lark 的实际响应
与离线假定一致，再进入批量导入。

用法：
    python tools/lark_smoke.py                       # 只验证凭证 + 列根目录
    python tools/lark_smoke.py --folder <fldcn...>   # 列指定文件夹并试导一篇
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from docx_to_md import docx_to_markdown  # noqa: E402
from lark_api import EXPORTABLE, FeishuClient, FeishuError  # noqa: E402
from lark_import import extract_folder_token  # noqa: E402
from xlsx_to_md import xlsx_to_markdown  # noqa: E402

WORK = ".lark-work"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--folder", help="文件夹链接或 token")
    parser.add_argument("--export-one", action="store_true", help="试导第一篇可导出文档")
    args = parser.parse_args()

    print("=" * 70)
    print("1) 读取凭证")
    client = FeishuClient()
    print(f"   区域      : {client.region['label']}")
    print(f"   open_api  : {client.open_api}")
    scopes = client.token.get("scope")
    print(f"   scope     : {scopes}")

    print("\n2) 验证身份（调用 /authen/v1/user_info）")
    try:
        info = client.request("GET", "/authen/v1/user_info") or {}
        print(f"   姓名   : {info.get('name')}")
        print(f"   open_id: {info.get('open_id')}")
        print(f"   email  : {info.get('email') or info.get('enterprise_email')}")
    except FeishuError as error:
        print(f"   ⚠ 身份接口失败（不影响云盘读取）：{error}")

    print("\n3) 列出云盘内容")
    # 支持直接粘贴文件夹链接；调用 API 前必须取出其中的 token
    folder = extract_folder_token(args.folder) if args.folder else ""
    if args.folder:
        print(f"   输入 : {args.folder}")
        print(f"   token: {folder} (len {len(folder)})")
    try:
        items = client.list_folder(folder)
    except FeishuError as error:
        print(f"   ✗ 列目录失败：{error}")
        print("\n   常见原因：")
        print("     - 权限未开通 drive:drive:readonly / space:document:retrieve")
        print("     - user_access_token 已过期，需重新授权")
        print("     - folder_token 不正确")
        return 1

    print(f"   共 {len(items)} 项")
    by_type: dict[str, int] = {}
    for item in items:
        by_type[item["type"]] = by_type.get(item["type"], 0) + 1
        marker = ""
        if item.get("via_shortcut"):
            marker = f"  (快捷方式 -> {item['type']})"
        elif item.get("unresolved_shortcut"):
            marker = "  (⚠ 快捷方式无法解析)"
        print(f"     [{item['type']:9}] {item['name']}{marker}")
    print(f"   类型分布：{by_type}")

    exportable = [item for item in items if item["type"] in EXPORTABLE]
    print(f"   可导出：{len(exportable)} 项")

    if args.export_one and exportable:
        target = exportable[0]
        print(f"\n4) 试导一篇：【{target['name']}】({target['type']})")
        extension = client.extension_for(target["type"])
        print(f"   导出扩展名：{extension}")
        try:
            file_token, actual = client.export(target["token"], target["type"])
            print(f"   导出产物 token：{file_token}（.{actual}）")
            blob = client.download(file_token)
            print(f"   下载大小：{len(blob)} bytes")

            os.makedirs(WORK, exist_ok=True)
            path = os.path.join(WORK, f"smoke.{actual}")
            with open(path, "wb") as handle:
                handle.write(blob)

            markdown = (
                docx_to_markdown(path) if actual == "docx" else xlsx_to_markdown(path)
            )
            print(f"   转换后 {len(markdown)} 字符")
            print("   ---- Markdown 前 600 字符 ----")
            print(markdown[:600])
            print("   ------------------------------")
        except FeishuError as error:
            print(f"   ✗ 导出失败：{error}")
            return 1
    elif not args.export_one:
        print("\n   （加 --export-one 可试导一篇，验证导出权限）")

    print("\n冒烟测试通过。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
