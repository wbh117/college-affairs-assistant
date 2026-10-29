# -*- coding: utf-8 -*-
"""从语料库抽取条款级片段，生成 agent/kb.json。

每条片段：{id, file, file_short, version, dept, article, article_no, text, keywords, topic}
"""
import os, re, json

BASE = os.path.dirname(os.path.abspath(__file__)) + "/.."
KB_DIR = os.path.join(BASE, "01_输出", "语料库")
OUT = os.path.join(BASE, "agent", "kb.json")

META = {
    "教学管理制度_2024版_2024-09-01生效.md": ("本科生课程考核与补缓考管理办法（2024 年修订）", "2024 版／2024-09-01"),
    "奖助学金办法_2025版_2025-03-01生效.md": ("本专科学生奖助学金评审与发放办法（2025 年修订）", "2025 版／2025-03-01"),
    "宿舍报修管理办法_2024版_2024-09-01生效.md": ("学生宿舍报修与维修管理办法（2024 版）", "2024 版／2024-09-01"),
    "教室多媒体报修流程_2024版_2024-09-01生效.md": ("教室多媒体设备报修流程（2024 版）", "2024 版／2024-09-01"),
    "教务FAQ_2025-09更新.md": ("教务处高频事务问答（FAQ · 2025-09 更新）", "2025-09／非正式文件"),
}

DEPT = {
    "教学管理制度_2024版_2024-09-01生效.md": "教务处",
    "奖助学金办法_2025版_2025-03-01生效.md": "学生工作处",
    "宿舍报修管理办法_2024版_2024-09-01生效.md": "后勤管理处",
    "教室多媒体报修流程_2024版_2024-09-01生效.md": "后勤管理处、教务处",
    "教务FAQ_2025-09更新.md": "教务处综合科",
}

CN = "一二三四五六七八九十"


def article_no(token):
    """'第四条' -> 4 ; '第十二条' -> 12"""
    m = re.search(r"第([一二三四五六七八九十]+)条", token)
    if not m:
        return None
    s = m.group(1)
    if s == "十":
        return 10
    if s.startswith("十"):
        return 10 + CN.index(s[1]) + 1
    if s.endswith("十"):
        return (CN.index(s[0]) + 1) * 10
    if "十" in s:
        a, b = s.split("十")
        return (CN.index(a) + 1) * 10 + CN.index(b) + 1
    return CN.index(s) + 1


def clean(t):
    t = t.replace("**", "")
    t = re.sub(r"\s+", " ", t).strip()
    return t


def parse_md(path, short_name):
    raw = open(path, encoding="utf-8").read()
    lines = raw.split("\n")
    full_name, version = META[short_name]
    segs = []

    # 正式文件：按 **第X条** 切分，带（一）（二）子项合并进主条
    arts = []
    cur = None
    for ln in lines:
        s = ln.strip()
        m = re.match(r"^\*\*(第[一二三四五六七八九十]+条)\*\*\s*(.*)$", s)
        if m:
            if cur:
                arts.append(cur)
            cur = {"no": m.group(1), "num": article_no(m.group(1)), "text": m.group(2)}
            continue
        # FAQ 条目
        m2 = re.match(r"^\*\*(\d+)\.\s*(.*?)\*\*\s*$", s)
        if m2:
            if cur:
                arts.append(cur)
            cur = {"no": f"FAQ 第 {m2.group(1)} 条", "num": None, "text": m2.group(2)}
            continue
        if cur is not None and s and not s.startswith(">") and not s.startswith("#") and not s.startswith("---"):
            cur["text"] += " " + s
    if cur:
        arts.append(cur)

    # FAQ 的问句在下一行，补进去
    for a in arts:
        a["text"] = clean(a["text"])

    return arts, full_name, version


TOPIC_RULES = [
    ("补考", ["补考", "补考申请", "补考时间", "旷考", "不予补考"]),
    ("缓考", ["缓考", "二级甲等"]),
    ("重修", ["重修"]),
    ("成绩复核", ["复核", "漏评", "错统", "错登"]),
    ("奖助学金", ["奖学金", "助学金", "资助", "公示", "兼得", "评审", "发放"]),
    ("宿舍报修", ["宿舍", "报修", "维修", "漏水", "门锁", "空调", "热水器"]),
    ("教室报修", ["教室", "多媒体", "投影", "音响", "中控", "电子屏", "录播"]),
]


def topic_of(text):
    for t, kws in TOPIC_RULES:
        for k in kws:
            if k in text:
                return t
    return "通用"


def build():
    segs = []
    sid = 0
    for short_name in META:
        arts, full, ver = parse_md(os.path.join(KB_DIR, short_name), short_name)
        for a in arts:
            sid += 1
            text = a["text"]
            if not text or len(text) < 6:
                continue
            # FAQ 特殊：问题行本身作为 text
            segs.append({
                "id": f"S{sid:03d}",
                "file": full,
                "src": short_name,
                "version": ver,
                "dept": DEPT[short_name],
                "article": a["no"],
                "article_no": a["num"],
                "text": text,
                "topic": topic_of(text),
                "tier": 2 if short_name.startswith("教务FAQ") else 1,
            })
    return segs


if __name__ == "__main__":
    segs = build()
    by_file = {}
    for s in segs:
        by_file[s["src"]] = by_file.get(s["src"], 0) + 1
    print("片段总数:", len(segs))
    for k, v in by_file.items():
        print(f"  {k}: {v}")
    json.dump(segs, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("已写入", OUT)
