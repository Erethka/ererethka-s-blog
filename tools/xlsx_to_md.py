"""xlsx -> Markdown 转换器（Lark 电子表格/多维表格走这条路）。

飞书的 sheet / bitable 不能导出 docx，只能导出 xlsx 或 csv。
这里把每个工作表转成 Markdown 表格，保留多 sheet 结构。
"""

from __future__ import annotations

import openpyxl


def _cell_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    text = str(value)
    return " ".join(text.split())


def sheet_to_markdown(worksheet, max_rows: int = 500, max_cols: int = 40) -> str:
    rows = []
    for row in worksheet.iter_rows(
        max_row=min(worksheet.max_row or 0, max_rows),
        max_col=min(worksheet.max_column or 0, max_cols),
        values_only=True,
    ):
        cells = [_cell_text(value) for value in row]
        if any(cells):
            rows.append(cells)

    if not rows:
        return ""

    width = max(len(row) for row in rows)
    rows = [row + [""] * (width - len(row)) for row in rows]

    # 去掉尾部整列为空的行，让表格更紧凑
    while rows and not any(rows[-1]):
        rows.pop()

    lines = [
        "| " + " | ".join(cell.replace("|", "\\|") for cell in rows[0]) + " |",
        "| " + " | ".join(["---"] * width) + " |",
    ]
    for row in rows[1:]:
        lines.append("| " + " | ".join(cell.replace("|", "\\|") for cell in row) + " |")

    return "\n".join(lines)


def xlsx_to_markdown(path: str) -> str:
    workbook = openpyxl.load_workbook(path, data_only=True, read_only=True)
    chunks: list[str] = []

    sheet_names = workbook.sheetnames
    multi = len(sheet_names) > 1

    for name in sheet_names:
        worksheet = workbook[name]
        table = sheet_to_markdown(worksheet)
        if not table:
            continue
        if multi:
            chunks.append(f"## {name}\n\n{table}")
        else:
            chunks.append(table)

    workbook.close()

    if not chunks:
        return ""

    return "\n\n".join(chunks).strip() + "\n"


if __name__ == "__main__":
    import sys

    print(xlsx_to_markdown(sys.argv[1]))
