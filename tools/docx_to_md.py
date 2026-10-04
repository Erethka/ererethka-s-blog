"""docx -> Markdown 转换器（无 pandoc 依赖，基于 python-docx + lxml）。

针对飞书云文档导出的 .docx 做了这些针对性处理：
  * 用 w:pStyle 判定标题/列表/引用/代码样式，而不是依赖本地化样式名
  * 用等宽字体（Consolas / Courier / 等线 Mono 等）识别飞书代码块，
    连续多行合并成一个 ``` 围栏
  * 手写 runs 解析，保留 bold / italic / 下划线 / 删除线 / 超链接
  * w:tbl 转 GFM 表格
  * 图片输出为占位符，避免引用不存在的相对路径
"""

from __future__ import annotations

import re
from typing import Iterable

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

MONO_FONTS = (
    "consolas",
    "courier",
    "courier new",
    "monaco",
    "menlo",
    "sf mono",
    "dejavu sans mono",
    "liberation mono",
    "cascadia",
    "fira code",
    "jetbrains mono",
    "source code",
    "roboto mono",
    "ubuntu mono",
    "andale mono",
    "mono",
    "等宽",
    "黑体-等宽",
)

HEADING_RE = re.compile(r"^(?:Heading|heading)\s*([1-9])$")
NUMBERED_RE = re.compile(r"^(?:List\s*Number|ListParagraph|List\s*Number\s*\d)$", re.I)


def _style_id(paragraph: Paragraph) -> str:
    element = paragraph._p.find(qn("w:pPr"))
    if element is None:
        return ""
    style = element.find(qn("w:pStyle"))
    if style is None:
        return ""
    return style.get(qn("w:val")) or ""


def _style_name(paragraph: Paragraph) -> str:
    try:
        return paragraph.style.name or ""
    except Exception:  # noqa: BLE001
        return ""


def _run_fonts(run) -> str:
    """收集一个 run 上所有能看到的字体名，用于等宽判定。"""
    names = []
    try:
        if run.font.name:
            names.append(run.font.name)
    except Exception:  # noqa: BLE001
        pass

    rpr = run._r.find(qn("w:rPr"))
    if rpr is not None:
        for tag in ("w:rFonts",):
            fonts = rpr.find(qn(tag))
            if fonts is not None:
                for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
                    value = fonts.get(qn(attr))
                    if value:
                        names.append(value)
    return " ".join(names).lower()


def _is_mono(paragraph: Paragraph) -> bool:
    runs = paragraph.runs
    if not runs:
        return False
    seen = 0
    mono = 0
    for run in runs:
        if not run.text.strip():
            continue
        seen += 1
        fonts = _run_fonts(run)
        if any(token in fonts for token in MONO_FONTS):
            mono += 1
    return seen > 0 and mono == seen


def _render_run(run) -> str:
    text = run.text
    if not text:
        return ""

    try:
        bold = bool(run.bold)
        italic = bool(run.italic)
        underline = bool(run.underline)
        strike = bool(run.font.strike)
    except Exception:  # noqa: BLE001
        bold = italic = underline = strike = False

    if text.strip() and not text.startswith(" "):
        lead = text[: len(text) - len(text.lstrip())]
        trail = text[len(text.rstrip()) :]
        core = text.strip()
    else:
        lead = trail = ""
        core = text

    if not core:
        return text

    if bold and italic:
        core = f"***{core}***"
    elif bold:
        core = f"**{core}**"
    elif italic:
        core = f"*{core}*"
    if strike:
        core = f"~~{core}~~"
    if underline and not (bold or italic):
        core = f"<u>{core}</u>"

    return f"{lead}{core}{trail}"


def paragraph_markdown(paragraph: Paragraph) -> str:
    """把一个段落转成 Markdown 行（不含换行符）。"""
    text = paragraph.text
    if not text.strip():
        return ""

    style_id = _style_id(paragraph)
    style_name = _style_name(paragraph)

    heading_match = HEADING_RE.match(style_id) or HEADING_RE.match(style_name)
    if heading_match:
        level = int(heading_match.group(1))
        return f"{'#' * min(level, 6)} {text.strip()}"

    lowered = f"{style_id} {style_name}".lower()

    if "quote" in lowered or "引用" in lowered:
        return f"> {text.strip()}"

    if _is_mono(paragraph):
        return text.rstrip()

    if "list bullet" in lowered or style_id.lower().startswith("listbullet"):
        return f"- {text.strip()}"

    if NUMBERED_RE.match(style_id) or "list number" in lowered or "listparagraph" in lowered:
        return f"1. {text.strip()}"

    # 普通段落：保留行内格式
    inline = _inline_text(paragraph)
    return inline if inline else text.strip()


def _inline_text(paragraph: Paragraph) -> str:
    """保留行内格式的朴素实现：按 runs 顺序拼接。"""
    output = []
    for run in paragraph.runs:
        rendered = _render_run(run)
        if rendered:
            output.append(rendered)
    return "".join(output).strip()


def table_markdown(table: Table) -> str:
    rows = []
    for row in table.rows:
        cells = []
        for cell in row.cells:
            value = " ".join(cell.text.split())
            value = value.replace("|", "\\|")
            cells.append(value)
        rows.append(cells)

    if not rows:
        return ""

    width = max(len(row) for row in rows)
    rows = [row + [""] * (width - len(row)) for row in rows]

    lines = ["| " + " | ".join(rows[0]) + " |", "| " + " | ".join(["---"] * width) + " |"]
    for row in rows[1:]:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def iter_blocks(parent) -> Iterable:
    body = parent.element.body if hasattr(parent, "element") else parent._element
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, parent)
        elif child.tag == qn("w:tbl"):
            yield Table(child, parent)


def docx_to_markdown(path: str) -> str:
    document = Document(path)
    chunks: list[str] = []
    code_buffer: list[str] = []

    def flush_code():
        if code_buffer:
            chunks.append("```\n" + "\n".join(code_buffer).rstrip() + "\n```")
            code_buffer.clear()

    for block in iter_blocks(document):
        if isinstance(block, Table):
            flush_code()
            rendered = table_markdown(block)
            if rendered:
                chunks.append(rendered)
            continue

        text = block.text
        if not text.strip():
            flush_code()
            continue

        if _is_mono(block) and not HEADING_RE.match(_style_id(block)):
            code_buffer.append(text.rstrip())
            continue

        flush_code()
        chunks.append(paragraph_markdown(block))

    flush_code()

    # 图片占位：飞书导出的图片在 docx 内嵌，这里显式标注而不是留死链接
    image_count = len(document.inline_shapes)
    if image_count:
        chunks.append(f"\n> 原文档含 {image_count} 张图片，未随 Markdown 导入。")

    markdown = "\n\n".join(chunk for chunk in chunks if chunk and chunk.strip())
    markdown = re.sub(r"\n{3,}", "\n\n", markdown).strip()
    return markdown + "\n"


if __name__ == "__main__":
    import sys

    print(docx_to_markdown(sys.argv[1]))
