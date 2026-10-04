"""按关键词给技术文档分类。

规则可随时调整：改 CATEGORY_RULES 里的关键词即可，不必改流水线。
分类结果会先写成报告给你过目，确认后再上传。
"""

from __future__ import annotations

import re

# 分类 -> 关键词权重。命中多个关键词则累加，取最高分。
# 顺序不代表优先级，得分相同按出现顺序取第一个。
CATEGORY_RULES: dict[str, list[tuple[str, int]]] = {
    "Unreal Engine": [
        ("unreal", 5), ("ue4", 5), ("ue5", 6), ("ue5.", 6), ("蓝图", 4),
        ("blueprint", 4), ("gas", 3), ("abilitysystem", 3), ("actor", 2),
        ("pawn", 2), ("材质", 2), ("material", 2), ("sequencer", 3),
        ("nanite", 3), ("lumen", 3), ("chaos", 3), ("enhanced input", 3),
        ("打包", 2), ("character", 2), ("动画", 2), ("animation", 2),
    ],
    "Unity": [
        ("unity", 6), ("monobehaviour", 5), ("prefab", 4), ("shader graph", 4),
        ("scriptableobject", 4), ("urp", 3), ("hdrp", 3), ("cinemachine", 3),
        ("assetbundle", 3), ("addressable", 3),
    ],
    "图形渲染": [
        ("渲染", 4), ("render", 3), ("shader", 4), ("hlsl", 4), ("glsl", 4),
        ("光线追踪", 4), ("raytracing", 4), ("ray tracing", 4), ("pbr", 3),
        ("后处理", 3), ("post process", 3), ("gpu", 2), ("烘焙", 3),
        ("lightmap", 3), ("抗锯齿", 3), ("纹理", 2), ("texture", 2),
    ],
    "图形学与数学": [
        ("矩阵", 3), ("matrix", 3), ("四元数", 4), ("quaternion", 4),
        ("向量", 3), ("vector", 2), ("插值", 3), ("slerp", 3), ("lerp", 3),
        ("噪声", 3), ("noise", 2), ("曲线", 2), ("bezier", 3), ("坐标系", 3),
    ],
    "前端": [
        ("javascript", 4), ("typescript", 4), ("css", 3), ("html", 3),
        ("react", 4), ("vue", 4), ("svelte", 4), ("vite", 4), ("webpack", 4),
        ("npm", 3), ("pnpm", 3), ("dom", 3), ("浏览器", 2), ("前端", 5),
        ("canvas", 3), ("webgl", 4), ("tailwind", 3),
    ],
    "后端与运维": [
        ("docker", 4), ("kubernetes", 4), ("k8s", 4), ("nginx", 4),
        ("linux", 3), ("服务器", 3), ("部署", 3), ("deploy", 3), ("ci/cd", 4),
        ("github actions", 4), ("cloudflare", 4), ("worker", 3), ("api", 2),
        ("数据库", 3), ("mysql", 4), ("postgres", 4), ("redis", 4),
        ("sql", 3), ("运维", 4), ("容器", 3), ("反向代理", 4),
    ],
    "Python": [
        ("python", 6), ("pandas", 5), ("numpy", 5), ("django", 5),
        ("flask", 5), ("fastapi", 5), ("pip", 4), ("conda", 4), ("pytest", 4),
    ],
    "C++与C#": [
        ("c++", 6), ("cpp", 5), ("c#", 6), ("csharp", 5), (".net", 4),
        ("指针", 3), ("内存泄漏", 4), ("stl", 4), ("模板元编程", 4),
    ],
    "工具与效率": [
        ("git", 4), ("vscode", 4), ("编辑器", 3), ("快捷键", 3),
        ("插件", 3), ("工作流", 3), ("脚本", 3), ("自动化", 3),
        ("命令行", 3), ("powershell", 4), ("bash", 3),
    ],
    "AI与机器学习": [
        ("机器学习", 5), ("神经网络", 5), ("深度学习", 5), ("llm", 5),
        ("大模型", 5), ("pytorch", 5), ("tensorflow", 5), ("训练", 3),
        ("推理", 3), ("模型", 2), ("prompt", 3), ("diffusion", 4),
    ],
    "游戏设计": [
        ("玩法", 4), ("数值", 3), ("关卡", 4), ("level design", 4),
        ("game design", 5), ("策划", 4), ("平衡性", 4), ("经济系统", 4),
    ],
}

DEFAULT_CATEGORY = "其他"

# 停用词，避免标题里的通用词造成误判
STOPWORDS = {"记录", "笔记", "总结", "问题", "文档", "教程", "分享"}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").lower()


def classify(title: str, body: str = "", folder_path: str = "") -> tuple[str, dict]:
    """返回 (category, 评分明细)。"""
    haystack = _normalize(f"{title} {folder_path} {body[:4000]}")
    title_norm = _normalize(title)
    folder_norm = _normalize(folder_path)

    scores: dict[str, float] = {}

    for category, rules in CATEGORY_RULES.items():
        score = 0.0
        for keyword, weight in rules:
            key = keyword.lower()
            if key in haystack:
                # 标题和文件夹路径命中给更高权重
                multiplier = 1.0
                if key in title_norm:
                    multiplier = 2.0
                elif key in folder_norm:
                    multiplier = 1.5
                score += weight * multiplier
        if score:
            scores[category] = score

    if not scores:
        return DEFAULT_CATEGORY, {"scores": {}, "matched": [], "confidence": 0.0}

    best = max(scores.values())
    ranked = sorted(scores.items(), key=lambda item: -item[1])
    top_category = ranked[0][0]

    second = ranked[1][1] if len(ranked) > 1 else 0.0
    confidence = 1.0 if best == 0 else min(1.0, (best - second) / best)

    detail = {
        "scores": {name: round(value, 1) for name, value in ranked},
        "top_score": round(best, 1),
        "confidence": round(confidence, 2),
        "ambiguous": confidence < 0.2 and len(ranked) > 1,
    }
    return top_category, detail


def suggest_tags(title: str, body: str, limit: int = 5) -> list[str]:
    """从命中规则里挑出最具体的标签。"""
    haystack = _normalize(f"{title} {body[:4000]}")
    hits: list[tuple[str, int]] = []

    seen = set()
    for rules in CATEGORY_RULES.values():
        for keyword, weight in rules:
            key = keyword.lower()
            if key in STOPWORDS or key in seen:
                continue
            if key in haystack:
                seen.add(key)
                hits.append((keyword, weight))

    hits.sort(key=lambda item: -item[1])
    return [keyword for keyword, _ in hits[:limit]]
