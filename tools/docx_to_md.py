"""docx -> Markdown 转换器（无 pandoc 依赖，基于 python-docx + lxml）。

针对 Lark / 飞书云文档导出的 .docx 做了这些针对性处理：
  * 用 w:pStyle 判定标题/列表/引用样式，而不是依赖本地化样式名
  * 用等宽字体（Consolas / Courier / 等线 Mono 等）识别代码块，
    连续多行合并成一个 ``` 围栏，保留缩进
  * 在 XML 层解析 runs，保住 bold / italic / 下划线 / 删除线 / 超链接 / 换行
  * w:tbl 转 GFM 表格
  * 图片只做数量标注，不留会失效的相对路径
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
)

HEADING_RE = re.compile(r"^(?:Heading|heading)\s*([1-9])$")
NUMBERED_RE = re.compile(r"^(?:List\s*Number|ListParagraph|List\s*Number\s*\d)$", re.I)

BOLD_TAGS = {qn("w:b"), qn("w:bCs")}
ITALIC_TAGS = {qn("w:i"), qn("w:iCs")}
UNDERLINE_TAGS = {qn("w:u")}
STRIKE_TAGS = {qn("w:strike"), qn("w:dstrike")}

# 代码类样式名（Lark 导出可能用这些样式而不是字体）
CODE_STYLE_HINTS = ("code", "preformatted", "html preformatted", "代码")


# --------------------------------------------------------------------------
# XML 层基础读取
# --------------------------------------------------------------------------


def _style_val(paragraph: Paragraph) -> str:
    properties = paragraph._p.find(qn("w:pPr"))
    if properties is None:
        return ""
    style = properties.find(qn("w:pStyle"))
    if style is None:
        return ""
    return style.get(qn("w:val")) or ""


def _style_name(paragraph: Paragraph) -> str:
    try:
        return paragraph.style.name or ""
    except Exception:  # noqa: BLE001
        return ""


def _runs_in(element) -> list:
    """取元素下所有 w:r，包含超链接内部的。"""
    return [node for node in element.iter(qn("w:r"))]


def _rpr_flag(run_element, tags: set) -> bool:
    properties = run_element.find(qn("w:rPr"))
    if properties is None:
        return False
    for tag in tags:
        node = properties.find(tag)
        if node is not None:
            value = node.get(qn("w:val"))
            # w:val="0"/"false" 表示显式关闭
            if value is None or value.lower() not in ("0", "false", "off"):
                return True
    return False


def _has_break(run_element) -> bool:
    return any(node.tag in (qn("w:br"), qn("w:cr")) for node in run_element)


def _run_font_names(run_element, paragraph: Paragraph) -> str:
    names = []
    properties = run_element.find(qn("w:rPr"))
    if properties is not None:
        fonts = properties.find(qn("w:rFonts"))
        if fonts is not None:
            for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
                value = fonts.get(qn(attr))
                if value:
                    names.append(value)

    if not names:
        # 回退到段落样式与文档默认字体
        try:
            style = paragraph.style
            if style is not None and style.font is not None and style.font.name:
                names.append(style.font.name)
        except Exception:  # noqa: BLE001
            pass
        try:
            normal = paragraph.part.document.styles["Normal"]
            if normal.font is not None and normal.font.name:
                names.append(normal.font.name)
        except Exception:  # noqa: BLE001
            pass

    return " ".join(names).lower()


def _is_mono(paragraph: Paragraph) -> bool:
    style_id = _style_val(paragraph).lower()
    style_name = _style_name(paragraph).lower()
    if any(hint in style_id or hint in style_name for hint in CODE_STYLE_HINTS):
        return True

    runs = _runs_in(paragraph._p)
    checked = 0
    mono = 0

    for run in runs:
        text = "".join(node.text or "" for node in run.iter(qn("w:t")))
        if not text.strip():
            continue
        checked += 1
        if any(token in _run_font_names(run, paragraph) for token in MONO_FONTS):
            mono += 1

    return checked > 0 and mono == checked


# --------------------------------------------------------------------------
# 行内渲染
# --------------------------------------------------------------------------


def _render_run_element(run_element, paragraph: Paragraph) -> str:
    pieces = []
    for node in run_element:
        if node.tag == qn("w:t"):
            pieces.append(node.text or "")
        elif node.tag in (qn("w:br"), qn("w:cr")):
            pieces.append("\n")
        elif node.tag == qn("w:tab"):
            pieces.append("    ")
        # w:drawing 等在这里忽略，图片数量单独统计

    text = "".join(pieces)
    if not text:
        return ""

    bold = _rpr_flag(run_element, BOLD_TAGS)
    italic = _rpr_flag(run_element, ITALIC_TAGS)
    underline = _rpr_flag(run_element, UNDERLINE_TAGS)
    strike = _rpr_flag(run_element, STRIKE_TAGS)

    # 保留首尾空白，但只包裹有内容的核
    if text.strip():
        lead = text[: len(text) - len(text.lstrip())]
        trail = text[len(text.rstrip()) :]
        core = text.strip()
    else:
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


def render_inline(paragraph: Paragraph) -> str:
    """按 XML 文档顺序渲染，保住超链接的位置与格式。"""
    parts: list[str] = []

    for child in paragraph._p:
        if child.tag == qn("w:r"):
            parts.append(_render_run_element(child, paragraph))

        elif child.tag == qn("w:hyperlink"):
            inner = "".join(
                _render_run_element(run, paragraph) for run in _runs_in(child)
            )
            if not inner:
                continue

            rel_id = child.get(qn("r:id"))
            anchor = child.get(qn("w:anchor"))
            target = None

            if rel_id:
                try:
                    relationship = paragraph.part.rels[rel_id]
                    target = relationship.target_ref
                except Exception:  # noqa: BLE001
                    target = None

            if target:
                parts.append(f"[{inner}]({target})")
            elif anchor:
                parts.append(f"[{inner}](#{anchor})")
            else:
                parts.append(inner)

    return "".join(parts).strip()


# --------------------------------------------------------------------------
# 块级渲染
# --------------------------------------------------------------------------


def _plain_text(element) -> str:
    return "".join(node.text or "" for node in element.iter(qn("w:t")))


def paragraph_markdown(paragraph: Paragraph) -> str:
    style_id = _style_val(paragraph)
    style_name = _style_name(paragraph)

    heading_match = HEADING_RE.match(style_id) or HEADING_RE.match(style_name)
    if heading_match:
        level = int(heading_match.group(1))
        return f"{'#' * min(level, 6)} {render_inline(paragraph) or _plain_text(paragraph._p)}"

    lowered = f"{style_id} {style_name}".lower()

    if "quote" in lowered or "引用" in lowered:
        return f"> {render_inline(paragraph) or _plain_text(paragraph._p)}"

    if "list bullet" in lowered or style_id.lower().startswith("listbullet"):
        return f"- {render_inline(paragraph) or _plain_text(paragraph._p)}"

    if (
        NUMBERED_RE.match(style_id)
        or "list number" in lowered
        or "listparagraph" in lowered
    ):
        return f"1. {render_inline(paragraph) or _plain_text(paragraph._p)}"

    return render_inline(paragraph) or _plain_text(paragraph._p)


def table_markdown(table: Table) -> str:
    rows = []
    for row in table.rows:
        cells = []
        for cell in row.cells:
            value = " ".join(cell.text.split()).replace("|", "\\|")
            cells.append(value)
        rows.append(cells)

    if not rows:
        return ""

    width = max(len(row) for row in rows)
    rows = [row + [""] * (width - len(row)) for row in rows]

    lines = [
        "| " + " | ".join(rows[0]) + " |",
        "| " + " | ".join(["---"] * width) + " |",
    ]
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


# --------------------------------------------------------------------------
# 入口
# --------------------------------------------------------------------------


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

        if _is_mono(block):
            # 代码块保留原始缩进，只去掉行尾空白
            code_buffer.append(text.rstrip())
            continue

        flush_code()
        chunks.append(paragraph_markdown(block))

    flush_code()

    image_count = len(document.inline_shapes)
    if image_count:
        chunks.append(f"> 原文档含 {image_count} 张图片，未随 Markdown 导入。")

    markdown = "\n\n".join(chunk for chunk in chunks if chunk and chunk.strip())
    markdown = re.sub(r"\n{3,}", "\n\n", markdown).strip()
    return markdown + "\n"


if __name__ == "__main__":
    import sys

    print(docx_to_markdown(sys.argv[1]))
