# -*- coding: utf-8 -*-
"""
重建「测试记录」表：原模板只有 20 题行（第 4—23 行），需容纳 Q1—Q20 + S1—S4 共 24 题。
做法：在标准版表格结构上原位扩展（保留文件内其他工作表不动），
      题块 4—27 行（24 题），指标区 29—34 行，badcase 区 36—39 行。
"""
import json, os
from copy import copy
from openpyxl import load_workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill

BASE = os.path.dirname(os.path.abspath(__file__)) + "/.."
XLSX = os.path.join(BASE, "03_数据", "测试题库与验收记录表.xlsx")

wb = load_workbook(XLSX)
std = wb["测试记录"]

# 取样样式
hdr_font = copy(std["A3"].font)
hdr_fill = copy(std["A3"].fill)
hdr_align = copy(std["A3"].alignment)
body_font = copy(std["A4"].font)
body_align = copy(std["A4"].alignment)
thin = Side(style="thin", color="D0D0D0")
border = Border(left=thin, right=thin, top=thin, bottom=thin)
grey = PatternFill("solid", fgColor="F2F2F2")
hl = PatternFill("solid", fgColor="FFF2CC")
widths = {"A": 7, "B": 9, "C": 40, "D": 11, "E": 11, "F": 10, "G": 13,
          "H": 26, "I": 52, "J": 12, "K": 30}

wb.remove(std)
ws = wb.create_sheet("测试记录", 2)

for col, w in widths.items():
    ws.column_dimensions[col].width = w

def put(r, c, v, font=None, fill=None, align=None, wrap=True):
    cell = ws.cell(row=r, column=c, value=v)
    cell.font = font or body_font
    if fill:
        cell.fill = fill
    cell.border = border
    cell.alignment = align or Alignment(vertical="center", wrap_text=wrap,
                                        horizontal="center" if c in (1, 2, 4, 5, 6, 7, 10) else "left")
    return cell

# 标题
ws.merge_cells("A1:K1")
put(1, 1, "测试记录（逐题填写，指标自动计算）", font=Font(size=14, bold=True), align=Alignment(vertical="center"))
ws.row_dimensions[1].height = 28

ws.merge_cells("A2:K2")
put(2, 1, "灰底三列自动引用“测试题库”，不要手改。你只需填 4 列：是否命中、是否忠实、是否正确拒答、证据摘录；再补 badcase 归类与修法。为“否”的行，badcase 归类必须写清是切分／检索／生成／提示哪一环。",
    font=Font(size=9, color="595959"), align=Alignment(vertical="center", wrap_text=True))
ws.row_dimensions[2].height = 30

heads = ["题号", "类型", "问题（自动）", "是否命中\n(是/否)", "是否忠实\n(是/否/NA)", "应拒答\n(是/否)",
         "是否正确拒答\n(是/否/NA)", "系统回答摘要（20 字内）", "证据摘录（文件名＋条款号＋原文关键句）",
         "badcase 归类", "修法（只改一处）"]
for i, h in enumerate(heads, start=1):
    c = put(3, i, h, font=hdr_font, fill=PatternFill("solid", fgColor="DDEBF7"), align=Alignment(horizontal="center", vertical="center", wrap_text=True))
ws.row_dimensions[3].height = 40

N = 24
start = 4
for i in range(N):
    r = start + i
    qr = 4 + i
    put(r, 1, "='测试题库'!A%d" % qr, fill=grey)
    put(r, 2, "='测试题库'!B%d" % qr, fill=grey)
    put(r, 3, "='测试题库'!C%d" % qr, fill=grey, align=Alignment(vertical="center", wrap_text=True, horizontal="left"))
    put(r, 4, None)
    put(r, 5, '=IF(D%d="否","NA","")' % r, fill=grey)
    put(r, 6, '=IF(B%d="不存在","是","否")' % r, fill=grey)
    put(r, 7, '=IF(F%d="是",IF(D%d="否","是","NA"),"NA")' % (r, r), fill=grey)
    for c in (8, 9, 10, 11):
        put(r, c, None)
    ws.row_dimensions[r].height = 34

last = start + N - 1   # 27

# 指标区
r0 = last + 2   # 29
ws.merge_cells(start_row=r0, start_column=1, end_row=r0, end_column=11)
put(r0, 1, "三项指标自动计算（分母已按课件口径设定，请勿改动公式）", font=Font(bold=True), fill=PatternFill("solid", fgColor="DDEBF7"),
    align=Alignment(vertical="center"))

r1 = r0 + 1
mh = ["指标", "分子（题数）", "分母（题数）", "结果", "合格线", "判定", "分母说明"]
for i, h in enumerate(mh, start=1):
    put(r1, i, h, font=Font(bold=True), fill=PatternFill("solid", fgColor="EDEDED"), align=Alignment(horizontal="center", vertical="center", wrap_text=True))
ws.merge_cells(start_row=r1, start_column=7, end_row=r1, end_column=11)

rngD = "D%d:D%d" % (start, last)
rngB = "B%d:B%d" % (start, last)
rngE = "E%d:E%d" % (start, last)
rngG = "G%d:G%d" % (start, last)

rows_metric = [
    ("命中率", '=COUNTIF(%s,"是")' % rngD, '=COUNTIF(%s,"常见")+COUNTIF(%s,"边界")' % (rngB, rngB), 0.8, "该命中的题数 = 常见＋边界 = 18"),
    ("忠实度", '=COUNTIF(%s,"是")' % rngE, '=COUNTIF(%s,"是")' % rngD, 0.85, "已作答的题数 = 命中且给出答案的题数"),
    ("拒答率", '=COUNTIF(%s,"是")' % rngG, '=COUNTIF(%s,"不存在")' % rngB, 1, "该拒答的题数 = 不存在 = 2"),
]
for k, (name, num, den, line, note) in enumerate(rows_metric):
    r = r1 + 1 + k
    put(r, 1, name, font=Font(bold=True))
    put(r, 2, num)
    put(r, 3, den)
    put(r, 4, "=IFERROR(B%d/C%d,0)" % (r, r), align=Alignment(horizontal="center", vertical="center"))
    ws.cell(row=r, column=4).number_format = "0.0%"
    put(r, 5, line, align=Alignment(horizontal="center", vertical="center"))
    ws.cell(row=r, column=5).number_format = "0%"
    put(r, 6, '=IF(D%d>=E%d,"达标","未达标")' % (r, r), align=Alignment(horizontal="center", vertical="center"))
    put(r, 7, note, align=Alignment(vertical="center", wrap_text=True))
    ws.merge_cells(start_row=r, start_column=7, end_row=r, end_column=11)

rs = r1 + 4   # 综合判定行
put(rs, 1, "质量验收综判", font=Font(bold=True), fill=hl)
ws.merge_cells(start_row=rs, start_column=2, end_row=rs, end_column=3)
put(rs, 2, '=IF(AND(F%d="达标",F%d="达标",F%d="达标"),"通过：三项均达合格线","未通过：仍有指标低于合格线，先修 badcase 再重测")' % (r1 + 1, r1 + 2, r1 + 3), fill=hl)
ws.merge_cells(start_row=rs, start_column=4, end_row=rs, end_column=11)
put(rs, 4, None, fill=hl)

# badcase 归因分布
rb = rs + 2
ws.merge_cells(start_row=rb, start_column=1, end_row=rb, end_column=11)
put(rb, 1, "badcase 归因分布（用于写“下一步怎么改”，不必每个都填）", font=Font(bold=True), fill=PatternFill("solid", fgColor="DDEBF7"),
    align=Alignment(vertical="center"))
rb2 = rb + 1
cats = ["切分", "检索", "生成", "提示", "语料版本"]
for i, c0 in enumerate(cats, start=1):
    put(rb2, i, c0, font=Font(bold=True), fill=PatternFill("solid", fgColor="EDEDED"), align=Alignment(horizontal="center", vertical="center"))
ws.merge_cells(start_row=rb2, start_column=6, end_row=rb2, end_column=11)
put(rb2, 6, "归因原则：只改造成问题的那一环，改完只重测相关题 + 全量回归一遍。", align=Alignment(vertical="center", wrap_text=True))
rb3 = rb2 + 1
for i, c0 in enumerate(cats, start=1):
    put(rb3, i, '=COUNTIF(J%d:J%d,"%s")' % (start, last, c0), align=Alignment(horizontal="center", vertical="center"))
ws.merge_cells(start_row=rb3, start_column=6, end_row=rb3, end_column=11)
put(rb3, 6, None)

wb.save(XLSX)
print("重建完成：题块 4-%d，指标区 %d-%d" % (last, r1, rs))
