"""飞书（中国版）与 Lark（国际版）的端点差异，集中在这里。

两者是**完全独立的域名和账号体系**，凭证不可互用：
  * 中国版飞书 : open.feishu.cn     / accounts.feishu.cn
  * 国际版 Lark : open.larksuite.com / accounts.larksuite.com
"""

from __future__ import annotations

REGIONS = {
    "feishu": {
        "label": "飞书（中国版）",
        "open_api": "https://open.feishu.cn/open-apis",
        "authorize": "https://accounts.feishu.cn/open-apis/authen/v1/authorize",
        "token_url": "https://open.feishu.cn/open-apis/authen/v2/oauth/token",
        # 中国版 v2 token 接口接受表单编码
        "token_body": "form",
        "file_url_prefix": "https://feishu.cn",
    },
    "lark": {
        "label": "Lark（国际版）",
        "open_api": "https://open.larksuite.com/open-apis",
        "authorize": "https://accounts.larksuite.com/open-apis/authen/v1/authorize",
        "token_url": "https://open.larksuite.com/open-apis/authen/v2/oauth/token",
        # 国际版文档明确固定 Content-Type: application/json
        "token_body": "json",
        "file_url_prefix": "https://larksuite.com",
    },
}

DEFAULT_REGION = "lark"


def get_region(name: str) -> dict:
    key = (name or DEFAULT_REGION).strip().lower()
    if key not in REGIONS:
        raise SystemExit(
            f"未知区域 {name!r}，可选值：{', '.join(sorted(REGIONS))}"
        )
    return REGIONS[key]


def region_choices() -> list[str]:
    return sorted(REGIONS)
