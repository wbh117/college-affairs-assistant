# -*- coding: utf-8 -*-
"""脱敏核验：在语料库全文中检索学号、手机号、姓名、旧版关键词。"""
import os, re, glob

BASE = os.path.dirname(os.path.abspath(__file__)) + "/.."
KB = os.path.join(BASE, "01_输出", "语料库")

texts = {}
for p in glob.glob(os.path.join(KB, "*.md")):
    texts[os.path.basename(p)] = open(p, encoding="utf-8").read()

checks = {
    "10 位学号(202开头)": re.compile(r"20\d{8}"),
    "11 位手机号": re.compile(r"1[3-9]\d{9}"),
    "打码手机号": re.compile(r"1[3-9]\d\*{2,4}\d{2,4}"),
    "旧版关键词-48小时响应": re.compile(r"48\s*小时内?响应"),
    "旧版关键词-按原值比例赔偿": re.compile(r"(原值|设备原值)\s*(的)?\s*50"),
    "旧版关键词-2023版在库": re.compile(r"2023 版（.*现行"),
}
names = ["王雨萱","李昊然","张诗琪","陈子豪","刘思远","赵奕菲","孙柏川","周子涵","吴佳宁","郑一鸣",
         "冯雅静","何俊熙","许安琪","邓博文","曹雨桐","彭宇轩","苏梦琪","蒋逸辰","韩佳怡","唐子墨",
         "范书瑶","董皓宇","袁若彤","钟立成","崔欣然","吕承泽","任嘉禾","沈亦菲","钱景明","尹清越"]

print("== 语料库文件清单 ==")
for k in texts:
    print(" -", k, len(texts[k]), "字符")

total = 0
print("\n== 脱敏核验 ==")
for label, pat in checks.items():
    hits = [(f, pat.findall(t)) for f, t in texts.items() if pat.search(t)]
    total += len(hits)
    print(f"{label}: {'0 命中 ✅' if not hits else '命中 ' + str(hits)}")

name_hits = []
for f, t in texts.items():
    for n in names:
        if n in t:
            name_hits.append((f, n))
print(f"真实姓名 30 个: {'0 命中 ✅' if not name_hits else name_hits}")
total += len(name_hits)

print("\n== 归档目录检查 ==")
arch = glob.glob(os.path.join(BASE, "01_输出", "归档", "*.md"))
for a in arch:
    print(" 归档:", os.path.basename(a))
print("旧版在语料库中:", any("2023" in k for k in texts))
print("\n核验结论：", "全部通过，0 处残留" if total == 0 else "存在残留，需处理")
