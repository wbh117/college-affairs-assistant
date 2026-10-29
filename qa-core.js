/* 学院事务咨询助手 · 前端问答引擎
 * 设计要点：
 * 1. 纯本地检索（kb.json），无网络请求，手机 4G 首屏即可用；
 * 2. 检索层：同义归一 -> 意图槽识别 -> 条款级打分 -> 版本收敛（正式文件 > FAQ）-> 取 Top3；
 * 3. 边界层优先于检索层：越界 / 转人工 / 资料外，先判后答，避免"格式覆盖兜底"；
 * 4. 生成层输出固定三段式【结论】【依据】【下一步】，依据一律引用原文，不改写。
 * v1.1（badcase 定点修复）：标题行不参与打分、FAQ 降权、意图槽（时限/材料/金额/渠道/次数）加权。
 */
(function (global) {
  'use strict';

  var SCRIPT = {
    fallback: '资料中未收录该问题，我不能推测。建议联系所在学院教学办公室（教务处窗口，电话 0411-0000-0000）咨询。',
    handover: '此项需人工确认，请联系所在学院教学办公室，由老师核实后答复。',
    medical: '这个问题超出我的服务范围，我不能给出用药、诊断或投资建议。涉及身心健康请优先联系学校心理健康教育中心或正规医疗机构；涉及资金请勿将学费用于非规定用途，如需帮助请联系辅导员。',
    agency: '我不能替你代写或直接定稿，也不能替你作决定。可以先咨询学院辅导员与教务处，了解清楚后果再由本人决定。'
  };

  /* ---------- 1. 同义归一 ---------- */
  var SYNONYMS = [
    ['挂了', '不合格'], ['没过', '不合格'], ['不及格', '不合格'], ['分数不够', '不合格'],
    ['几天内', '个工作日内'], ['几号前', '个工作日内'], ['截止到几号', '个工作日内'],
    ['几级医院', '二级甲等以上医院'], ['什么医院', '二级甲等以上医院'], ['几级医院的', '二级甲等以上医院'],
    ['重新看卷子', '不重新评阅答卷'], ['看卷子', '重新评阅答卷'], ['重新判卷', '重新评阅答卷'],
    ['百分之几', '前 10%'],
    ['一起拿', '兼得'], ['同时拿', '兼得'], ['都能拿', '兼得'], ['同时申请', '兼得'],
    ['赔多少钱', '费用责任'], ['赔多少', '费用责任'], ['要赔', '费用责任'], ['赔钱', '费用责任'],
    ['多久能来', '时限'], ['多久来', '时限'], ['多长时间', '时限'],
    ['没去考', '未参加考核'], ['算旷考', '旷考'],
    ['投影仪', '多媒体'], ['投影打不开', '多媒体 投影'], ['音响', '多媒体'],
    ['交换生', '交换生'], ['学分怎么认', '学分认定'],
    ['交学费', '收取学费'], ['收钱', '收取学费'], ['要钱', '收取学费']
  ];

  /* ---------- 2. 越界/转人工/资料外规则（优先级最高） ---------- */
  var RULES = [
    { type: 'medical', kw: ['睡不着', '吃点什么药', '吃什么药', '药好', '用什么药', '吃药', '焦虑', '抑郁', '心理', '诊断', '发烧', '头疼', '药名', '剂量', '失眠'] },
    { type: 'invest', kw: ['理财', '收益', '炒股', '投资', '基金', '股票', '学费拿去'] },
    { type: 'agency', kw: ['帮我写', '代写', '定稿', '替我写', '帮我起草', '帮我做一份'] },
    { type: 'discipline', kw: ['处分', '作弊', '撤销', '撤了', '疏通', '找关系', '记过', '警告处分', '违规记录'] },
    { type: 'handover', kw: ['赔多少钱', '具体金额', '能不能免', '减免', '例外', '特殊情况能否', '个案'] },
    { type: 'outside', kw: ['交换生', '学分认定', '国外修的课', '校园卡', '一卡通', '饭卡'] },
    { type: 'outside', kw: ['打车', '报销', '宿舍分配', '换宿舍', '入党', '社团', '图书馆'] },
    // "保研""考研""就业"只在被问及流程时才算资料外（"怕影响保研"属背景，不算）
    { type: 'outside', kw: ['保研(的条件|要求|怎么|流程|名额|加分)', '考研(怎么|报名|流程)', '就业(怎么|流程|指导)'] }
  ];

  /* ---------- 3. 主题锚点 ---------- */
  var TOPIC_ANCHOR = {
    '补考': ['补考', '再补一次', '补一次', '第几周考'],
    '缓考': ['缓考'],
    '重修': ['重修'],
    '成绩复核': ['复核', '成绩有异议', '看卷子'],
    '奖助学金': ['奖学金', '助学金', '励志', '资助'],
    '宿舍报修': ['宿舍', '门锁', '漏水', '空调', '热水器', '阳台'],
    '教室报修': ['教室', '投影', '多媒体', '音响', '中控']
  };

  /* ---------- 4. 意图槽：问句在问"什么维度" ---------- */
  var SLOTS = {
    time: ['多久', '几天', '时限', '什么时候', '第几周', '几号', '截止', '多久能', '多长', '时效', '前完成'],
    material: ['材料', '证明', '带什么', '要什么', '需要什么', '几级医院', '发票'],
    money: ['多少钱', '金额', '费用', '标准', '多少元'],
    channel: ['找谁', '在哪', '哪里办', '怎么报', '怎么申请', '渠道', '入口', '平台'],
    count: ['几次', '次数', '最多', '还能'],
    cant: ['能补考吗', '能不能补考', '可以补考吗', '能考吗'],
    write: ['会写', '标注', '字样', '影响'],
    grade: ['毕业班', '毕业年级', '毕业学期'],
    discipline: ['处分', '旷课', '影响期'],
    both: ['兼得', '一起拿', '同时拿'],
    item: { time: ['工作日', '小时', '分钟', '周', '学期', '日内', '期限内'], material: ['证明', '申请表', '材料'], money: ['元', '／生', '价目表', '费用'], channel: ['平台', '系统', '电话', '窗口', '秘书'], count: ['2 次', '两次', '次数'], write: ['标注', '不标注', '字样'], grade: ['毕业学期', '毕业年级'], discipline: ['影响期内', '取消当学年'] }
  };

  function detectSlots(q) {
    var hit = [];
    for (var k in SLOTS) {
      if (k === 'item') continue;
      var kws = SLOTS[k];
      for (var i = 0; i < kws.length; i++) {
        if (q.indexOf(kws[i]) >= 0) { hit.push(k); break; }
      }
    }
    return hit;
  }

  /* ---------- 5. 检索 ---------- */
  var KB = [];
  var STOP = ['的', '了', '吗', '呢', '啊', '呀', '我', '你', '要', '是', '在', '有', '能', '会', '就', '还', '和', '与', '怎么', '什么', '多少', '哪个', '哪里', '多久', '几点', '请问', '一下', '可以', '需要', '我们', '这个', '那个'];

  /* 意图→条款定向映射：问句命中特征词（且不含排除词）时，锁定该条款，避免近义条款抢答 */
  var INTENT = [
    // need：问句须命中其一；not：问句命中则不启用；t：条款须含的锚点
    { need: /(还能重修|再重修|重修.*没过.*(还能|再))/, t: '重修不超过 2 次' },
    { need: /(再补|补一次|再考)/, not: /重修/, t: '不予再次补考' },
    { need: /(实践|实习|实验课|课程设计|毕业设计)/, not: /重修/, t: '实践类课程' },
    { need: /毕业/, t: '毕业年级学生的补考' },
    { need: /(会写|标注|字样|两个字)/, t: '不标注' },
    { need: /(没去考|未参加|旷考|缺考)/, t: '按旷考处理' },
    { need: /(重新看卷子|看卷子|重新评阅)/, t: '不重新评阅答卷' },
    { need: /(材料|证明|医院|几级|带什么)/, t: '二级甲等以上医院' },
    { need: /(几天|个工作日|截止|多久内|什么时候提交|几号)/, t: '5 个工作日内' },
    { need: /(第几周|什么时候考|哪一周)/, t: '第 3 周至第 4 周' },
    { need: /国家奖学金.*(多少钱|金额|标准|多少元|条件)/, t: '8000 元' },
    { need: /励志/, t: '5000 元' },
    { need: /助学金.*(档|一等|标准)/, t: '一等 4400 元' },
    { need: /助学金.*(什么时候|到账|发)/, t: '按学期平均发放' },
    { need: /校内奖学金/, t: '一等奖 2000 元' },
    { need: /(兼得|一起拿|同时拿)/, t: '不可兼得' },
    { need: /门锁|阳台|弄坏|人为损坏/, t: '材料费' },
    { need: /空调|热水器|大件/, t: '大件设备' },
    { need: /(漏水|断电|下水)/, t: '紧急维修' },
    { need: /(宿舍|报修).*(多久|时限|时间|没人来|什么时候来)/, not: /教室|投影/, t: '响应时限' },
    { need: /(教室|投影|音响|多媒体).*(多久|时限|什么时候来|来修)/, t: '30 分钟' },
    { need: /(教室|投影|音响|多媒体)/, t: '教室多媒体' },
    { need: /重修.*(学费|收费|交钱)/, t: '重修不额外收取学费' },
    { need: /重修.*(几次|次数|最多)/, t: '重修不超过 2 次' }
  ];

  function intentBoost(text, q) {
    var boost = 0;
    for (var i = 0; i < INTENT.length; i++) {
      var it = INTENT[i];
      if (it.need.test(q) && !(it.not && it.not.test(q)) && text.indexOf(it.t) >= 0) { boost += 14; break; }
    }
    return boost;
  }

  function normalize(q) {
    var s = q;
    for (var i = 0; i < SYNONYMS.length; i++) s = s.split(SYNONYMS[i][0]).join(SYNONYMS[i][1]);
    return s;
  }

  function grams(s) {
    var out = [];
    var c = s.replace(/[，。？！、,.?!\s“”"'‘’（）()：:；;]/g, '');
    for (var i = 0; i < c.length - 1; i++) {
      var g = c.substr(i, 2);
      if (STOP.indexOf(g) >= 0) continue;
      out.push(g);
    }
    return out;
  }

  function detectTopic(q) {
    var n = normalize(q), best = null, bestLen = 0;
    for (var t in TOPIC_ANCHOR) {
      var kws = TOPIC_ANCHOR[t];
      for (var i = 0; i < kws.length; i++) {
        if (n.indexOf(kws[i]) >= 0 && kws[i].length > bestLen) { best = t; bestLen = kws[i].length; }
      }
    }
    return best;
  }

  // 标题行（"补考申请：""响应时限："）不参与检索比对，避免"补考"二字被标题抢分
  function bodyOf(seg) { return seg.body || seg.text; }

  function score(seg, qGrams, normQ, topic, slots) {
    var text = bodyOf(seg);
    if (!text || text.length < 8) return -99;
    var s = 0;
    for (var i = 0; i < qGrams.length; i++) if (text.indexOf(qGrams[i]) >= 0) s += 2;
    if (topic && seg.topic === topic) s += 6;
    if (topic && seg.topic !== topic && seg.topic !== '通用') s -= 6;
    if (seg.tier === 2) s -= 4;            // 版本收敛：正式文件优先于 FAQ
    if (/为规范|本办法所称|本办法适用于|负责解释|坚持|适用范围/.test(text)) s -= 6;
    // 意图槽加权：条款含对应"数值/条目"才加分
    for (var k = 0; k < slots.length; k++) {
      var items = (SLOTS.item[slots[k]] || []);
      for (var j = 0; j < items.length; j++) if (text.indexOf(items[j]) >= 0) { s += 4; break; }
    }
    // 问句点名了主体对象（如"毕业班""处分"）：命中该词的条款额外加权
    var anchors = [];
    if (/毕业/.test(normQ)) anchors.push('毕业学期');
    if (/处分|旷课/.test(normQ)) anchors.push('纪律处分');
    for (var a = 0; a < anchors.length; a++) if (text.indexOf(anchors[a]) >= 0) s += 8;
    s += intentBoost(text, normQ);
    return s;
  }

  function search(q, topK) {
    var normQ = normalize(q);
    var qGrams = grams(normQ);
    var topic = detectTopic(q);
    var slots = detectSlots(normQ);
    var scored = [];
    for (var i = 0; i < KB.length; i++) {
      var sc = score(KB[i], qGrams, normQ, topic, slots);
      if (sc > 0) scored.push({ seg: KB[i], score: sc });
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    return { topic: topic, slots: slots, results: scored.slice(0, topK || 3), all: scored };
  }

  /* ---------- 6. 边界判定 ---------- */
  function boundaryCheck(q) {
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i];
      for (var j = 0; j < r.kw.length; j++) {
        var kw = r.kw[j];
        if (/[()（）|]/.test(kw)) {
          var re = new RegExp(kw);
          if (re.test(q)) return r.type;
        } else if (q.indexOf(kw) >= 0) return r.type;
      }
    }
    return null;
  }

  /* ---------- 7. 三段式生成 ---------- */
  function pickSentence(text, q) {
    var body = text.replace(/^[^：]{2,14}：/, '');
    var parts = body.split(/(?<=[。；])/);
    var nq = normalize(q);
    var anchors = [];
    for (var i = 0; i < INTENT.length; i++) {
      var it = INTENT[i];
      if (it.need.test(nq) && !(it.not && it.not.test(nq))) anchors.push(it.t);
    }
    var qg = grams(nq);
    var best = null, bestScore = -1;
    for (var k = 0; k < parts.length; k++) {
      var p = parts[k].trim();
      if (p.length < 6) continue;
      if (/^[（(][一二三四五][）)]/.test(p) && p.length < 14) continue; // 纯小标题不带内容
      var sc = 0;
      for (var a = 0; a < anchors.length; a++) if (p.indexOf(anchors[a]) >= 0) sc += 6;
      for (var g = 0; g < qg.length; g++) if (p.indexOf(qg[g]) >= 0) sc += 1;
      if (sc > bestScore) { bestScore = sc; best = p; }
    }
    if (!best) best = parts[0] || body;
    return best.replace(/^[（(][一二三四五][）)]/, '').replace(/[。；]\s*$/, '');
  }

  function findById(id) {
    for (var i = 0; i < KB.length; i++) if (KB[i].id === id) return KB[i];
    return null;
  }
  function pick(shortName, article) {
    for (var i = 0; i < KB.length; i++) if (KB[i].src === shortName && KB[i].article === article) return KB[i];
    return null;
  }

  function answer(q) {
    var b = boundaryCheck(q);
    if (b === 'medical' || b === 'invest') {
      return { type: 'boundary', 结论: '这个问题超出我的服务范围，我不能给出用药、诊断或投资建议。', 依据: '', 下一步: SCRIPT.medical.replace(/^.*?建议/, '建议'), raw: SCRIPT.medical, slots: [] };
    }
    if (b === 'agency') {
      return { type: 'boundary', 结论: '我不能替你代写或直接定稿，也不能替你作决定。', 依据: '', 下一步: '可先咨询学院辅导员与教务处，了解清楚后果再由本人决定。', raw: SCRIPT.agency, slots: [] };
    }
    if (b === 'discipline') {
      // 处分对奖助学金资格的影响有明确条款（奖助学金办法第十一条），可依条款作答；
      // 但"能否撤销处分""找关系"属个案，必须转人工。
      if (!/(撤销|撤了|疏通|找关系|能不能撤|取消处分)/.test(q) && /(奖学金|助学金|评|资格|申请)/.test(q)) {
        return buildFromArticle('奖助学金办法_2025版_2025-03-01生效.md', '第十一条', q, ['第十一条']);
      }
      return { type: 'handover', raw: SCRIPT.handover, slots: [] };
    }
    if (b === 'handover') {
      return { type: 'handover', raw: SCRIPT.handover, slots: [] };
    }
    if (b === 'outside') {
      return { type: 'fallback', raw: SCRIPT.fallback, slots: [] };
    }

    var r = search(q, 3);
    if (!r.results.length || r.results[0].score < 9) {
      return { type: 'fallback', raw: SCRIPT.fallback, slots: r.slots };
    }

    var top = r.results[0].seg;
    var extras = [];
    var n = normalize(q);
    if (/重修/.test(n) && /(补考|没过|不合格)/.test(n) && /(还能|可以|几次|再)/.test(n)) {
      extras = ['第十二条', '第十四条', '第十五条'];
    } else if (/缓考/.test(n) && /(没去|未参加|旷考)/.test(n)) {
      extras = ['第十一条', '第十二条'];
    } else if (/兼得/.test(n) || /(一起拿|同时拿)/.test(n)) {
      extras = ['第十条'];
    } else if (/重修/.test(n) && /(学费|收费|交钱)/.test(n)) {
      extras = ['第十四条'];
    } else if (/助学金/.test(n) && /(档|一等|多少|什么时候|发)/.test(n)) {
      extras = [];
    }

    var used = [top];
    for (var i = 0; i < extras.length; i++) {
      var s = pick(top.src.indexOf('教室') >= 0 ? '教学管理制度_2024版_2024-09-01生效.md' : top.src, extras[i]);
      if (!s && extras[i] === '第十条') s = pick('奖助学金办法_2025版_2025-03-01生效.md', '第十条');
      if (s && used.indexOf(s) < 0) used.push(s);
    }
    if (used.length > 2) used = used.slice(0, 2).concat([]);

    var concl = buildConclusion(used, n, top);
    var evid = used.slice(0, 2).map(function (s) {
      return '《' + s.file + '》' + s.article + '：' + pickSentence(s.text, q) + '。';
    }).join('\n');
    var next = VERBATIM[top.id] ? VERBATIM[top.id].next : DEFAULT_NEXT;

    return {
      type: 'hit',
      结论: concl,
      依据: evid,
      下一步: next,
      得分: top.score,
      sources: used.slice(0, 2).map(function (s) {
        return { file: s.file, article: s.article, version: s.version, dept: s.dept, id: s.id, text: s.text, topic: s.topic };
      }),
      top3: r.results.map(function (x) { return { id: x.seg.id, article: x.seg.article, score: x.score, topic: x.seg.topic }; })
    };
  }

  var DEFAULT_NEXT = '办理入口与咨询：教务系统／“后勤服务”平台；教务处 0411-0000-0000，后勤值班 0411-0000-0000，后勤监督 0411-0000-0001。';

  function buildFromArticle(src, article, q, alsoIds) {
    var top = pick(src, article);
    if (!top) return { type: 'fallback', raw: SCRIPT.fallback, slots: [] };
    var used = [top];
    (alsoIds || []).forEach(function (a) {
      var s = pick(src, a);
      if (s && used.indexOf(s) < 0 && used.length < 2) used.push(s);
    });
    var n = normalize(q);
    return {
      type: 'hit',
      结论: buildConclusion(used, n, top),
      依据: used.map(function (s) { return '《' + s.file + '》' + s.article + '：' + pickSentence(s.text, q) + '。'; }).join('\n'),
      下一步: VERBATIM[top.id] ? VERBATIM[top.id].next : DEFAULT_NEXT,
      sources: used.map(function (s) { return { file: s.file, article: s.article, version: s.version, dept: s.dept, id: s.id, text: s.text, topic: s.topic }; }),
      top3: used.map(function (s) { return { id: s.id, article: s.article, score: 99, topic: s.topic }; })
    };
  }

  var VERBATIM = {
    'S004': { next: '登录教务系统 →「考试报名—补考报名」选择课程提交，务必在成绩公布后 5 个工作日内完成；逾期系统自动关闭，只能下一学期重修。咨询教务处 0411-0000-0000。' },
    'S005': { next: '关注教务处当期通知确认具体日期；补考仍不合格的须按第十二条办理重修，请提前安排复习。' },
    'S006': { next: '属上述类别的课程不安排补考，直接按「重修」办理：随低年级同门课程修读，或参加学院组织的重修班，联系开课学院教学办公室报名。' },
    'S007': { next: '补考合格即取得该课程学分，成绩单标注「补考」字样；打印成绩单可在教务系统「证明打印」模块自助完成。' },
    'S008': { next: '在教务系统提交缓考申请并上传材料，经学院审核、教务处审批；突发情况可在考核结束后 3 个工作日内补办，材料交所在学院教学秘书。' },
    'S009': { next: '缓考与补考同期进行（开学后第 3—4 周）；如担心成绩单影响推免，可持成绩单向学院教学办公室说明情况。' },
    'S010': { next: '缓考与补考同期进行，成绩按实际得分记载；成绩单不标注「缓考」字样，推免与就业不受该字样影响。' },
    'S011': { next: '未办理缓考手续且未参加考核的按旷考处理，旷考不予补考、须重修；请立即联系所在学院教学秘书说明情况。' },
    'S012': { next: '补考后仍不合格、缓考后仍不合格、或属于不予补考情形的，均须重修；重修报名联系开课学院教学办公室。' },
    'S013': { next: '随低年级同门课程修读或参加学院重修班，重修考核与正常考核同标准。' },
    'S014': { next: '第 2 次重修仍不合格的按结业处理，可在最长学习年限内申请换发毕业证书，具体联系教务处学籍科 0411-0000-0000。' },
    'S015': { next: '重修无需缴费，报名联系开课学院教学办公室。' },
    'S016': { next: '注意：复核不重新评阅答卷，只核查漏评、错统、错登；对评分标准有异议的不能通过复核解决，可先向任课教师咨询评分依据。' },
    'S017': { next: '成绩公布后 10 个工作日内，向开课学院（教学办公室）提交书面复核申请，写明课程名称、学期与异议事项。' },
    'S018': { next: '开课学院应在受理后 5 个工作日内完成复核并书面反馈；确有错误的由教务处按程序更正成绩。' },
    'S019': { next: '毕业年级同学请在毕业学期第 6 周前完成补考，提前向学院教学办公室确认考试安排。' },
    'S025': { next: '秋季学期按第九条流程：9 月 10 日前向所在学院提交申请表及佐证材料。咨询学生工作处。' },
    'S026': { next: '须先完成家庭经济困难认定；秋季学期 9 月 10 日前提交申请，咨询学生工作处。' },
    'S027': { next: '国家助学金按学期平均发放，每学期发一半，学期中打到学生银行卡；档次由学院评审确定。' },
    'S028': { next: '校内奖学金按学年评定，一等、二等、三等获奖比例分别为专业年级学生数的 5%、10%、15%。' },
    'S029': { next: '申请截止 9 月 10 日；学院公示不少于 5 个工作日，学校审定后全校再公示不少于 5 个工作日。' },
    'S030': { next: '同一学年只能选其一申报；若同时符合条件，建议按获奖概率更高的项目申报，具体咨询学生工作办公室。' },
    'S031': { next: '受到影响期限定的判断属个案，请联系学生工作办公室核实影响期是否已满。' },
    'S032': { next: '公示期内有异议，可向学院学生工作办公室或学生工作处书面反映，受理部门 5 个工作日内核查反馈。' },
    'S037': { next: '紧急情况（漏水、断电、门锁失效、下水堵塞外溢）可直接拨打后勤值班电话 0411-0000-0000。' },
    'S038': { next: '漏水属紧急情况，请直接拨打后勤值班电话 0411-0000-0000，2 小时内到场；一般维修在平台提交后 24 小时响应、72 小时完成。' },
    'S039': { next: '费用按后勤管理处公示价目表执行，可在平台查询；对费用有异议的，可在收到缴费通知后 5 个工作日内向后勤管理处书面申诉。' },
    'S040': { next: '空调维修由后勤管理处统一联系厂商；单次维修费用超过 500 元的须报资产管理处审批，进度可在平台查看。' },
    'S041': { next: '超过承诺时限未响应的，可拨后勤服务质量监督电话 0411-0000-0001 投诉，后勤管理处应在 2 个工作日内答复。' },
    'S044': { next: '通过“后勤服务”平台选“教室多媒体”类别提交，或拨打教务处教学保障电话 0411-0000-0002。' },
    'S045': { next: '上课期间故障按紧急件处理；若影响正常上课，可要求 30 分钟内提供备用设备或协调调换教室。' },
    'S046': { next: '违规操作、私自拆装、碰撞倾倒造成损坏的由责任人承担全部维修费用；无法认定责任的由使用单位与后勤管理处共同确认。' },
    'S047': { next: '报修时须说明：教室编号、设备类型、故障现象、是否影响上课、可联系时间。' },
    'S048': { next: '若现场无法排除且影响上课，请同时告知教务处教学保障（0411-0000-0002）协调调换教室或借用备用设备。' },
    'S053': { next: '以正式文件第四条「5 个工作日」为准；本条 FAQ 的「3 个工作日」为通俗口径。' }
  };

  function buildConclusion(used, n, top) {
    var has = function (kw) { return used.some(function (s) { return s.text.indexOf(kw) >= 0; }); };
    var topIs = function (kw) { return top && top.text.indexOf(kw) >= 0; };

    if (/补考/.test(n) && /(再补|补一次|还能再补)/.test(n) && !/重修/.test(n)) return '不能。补考后仍不合格的不予再次补考，须重修。';
    if (/补考/.test(n) && /(第几周|什么时候考|哪一周)/.test(n) && !/毕业/.test(n)) return '一般在新学期开学后第 3 周至第 4 周，以教务处当期通知为准。';
    if (/毕业/.test(n) && /补考/.test(n)) return '毕业学期第 6 周前完成；非毕业班常规补考为开学后第 3—4 周。';
    if (/实践|实习/.test(n) && /补考/.test(n)) return '不能补考。实践类课程不合格须重修，不安排补考。';
    if (/补考/.test(n) && /(几天|个工作日|截止|多久内|什么时候提交|几号)/.test(n)) return '成绩公布后 5 个工作日内，通过教务系统提交补考申请。';
    if (/缓考/.test(n) && /(材料|证明|医院|几级|带什么)/.test(n)) return '考核开始前在教务系统提交，附二级甲等以上医院诊断证明等材料。';
    if (/缓考/.test(n) && /(会写|标|字样|两个字|影响)/.test(n)) return '不会。缓考成绩按实际得分记载，成绩单不标注“缓考”字样。';
    if (/缓考/.test(n) && /(没去|未参加|旷考|缺考|怎么样)/.test(n)) return '已申请缓考但缺考的按缓考不合格处理须重修；未办缓考又缺考按旷考处理。';    if (/重修/.test(n) && /(补考|没过)/.test(n) && /(还能|再)/.test(n)) return '可再重修一次（累计不超过 2 次）；第 2 次仍不合格按结业处理，可换发毕业证。';
    if (/重修/.test(n) && /(学费|收费|交钱)/.test(n) && /(几次|最多|次数)/.test(n)) return '不额外收取学费；同一门课程在校期间重修不超过 2 次。';
    if (/重修/.test(n) && /(学费|收费|交钱)/.test(n)) return '重修不额外收取学费。';
    if (/重修/.test(n) && /(几次|次数|最多)/.test(n)) return '同一门课程在校期间重修不超过 2 次，第 2 次仍不合格按结业处理。';
    if (/复核/.test(n) && /(卷子|重新评阅|重看)/.test(n)) return '不能重新看卷子。复核仅核查漏评、错统、错登三类情形。';
    if (/复核/.test(n)) return '成绩公布后 10 个工作日内向开课学院提交书面复核申请。';
    if (/兼得/.test(n) || /(一起拿|同时拿)/.test(n)) return '国奖与励志不可兼得；国助可与校内奖学金兼得；国奖与国助可兼得。';
    if (/国家奖学金/.test(n)) return '二年级以上，成绩与综合考评排名均在前 10%、无不及格，8000 元／学年。';
    if (/励志/.test(n)) return '经困难认定且排名前 30%、无不及格，5000 元／生／学年。';
    if (/助学金/.test(n) && /(档|一等|多少钱|标准)/.test(n)) return '分三档：一等 4400 元、二等 3300 元、三等 2200 元，按学期发一半。';
    if (/助学金/.test(n) && /(什么时候|到账|发放)/.test(n)) return '按学期发放，每学期发放标准的一半，学期中打到学生银行卡。';
    if (/校内奖学金/.test(n)) return '一等 2000 元、二等 1200 元、三等 800 元，按学年评定。';
    if (/处分|旷课/.test(n) && /(申请|评|资格)/.test(n)) return '处分仍在影响期内取消当学年评审资格；旷课累计 10 学时以上同样取消。';
    if (/毕业/.test(n) && /补考/.test(n)) return '毕业学期第 6 周前完成；非毕业班常规补考为开学后第 3—4 周。';
    if (/(门锁|阳台|人为|弄坏|赔)/.test(n)) return '责任人承担材料费，人工费由学院承担；材料费按后勤公示价目表执行。';
    if (/(投影|教室|音响|多媒体)/.test(n) && /(多久|时限|时间|来修|来)/.test(n)) return '上课期间按紧急件：30 分钟内响应，2 小时内到场，当日内完成修复。';
    if (/(投影|教室|音响|多媒体)/.test(n)) return '通过“后勤服务”平台选“教室多媒体”类别报修，或拨教务处教学保障电话。';
    if (/(宿舍|漏水)/.test(n) && /(多久|时限|时间|没人来|来)/.test(n)) return '漏水属紧急件 2 小时内到场；一般维修 24 小时响应、72 小时完成。';
    if (/(宿舍|报修)/.test(n) && /(怎么报|渠道|找谁|在哪)/.test(n)) return '通过“后勤服务”线上平台提交报修单；紧急情况可拨后勤值班电话。';
    if (/空调|大件|热水器/.test(n)) return '大件设备由后勤统一联系厂商，单次维修超 500 元须报资产管理处审批。';
    if (/成绩单/.test(n)) return '教务系统“证明打印”模块可自助打印中英文成绩单，也可到教务处窗口盖章。';
    if (/学籍证明/.test(n)) return '教务系统“证明打印”模块可自助开具，或到教务处学籍科窗口办理。';

    var first = pickSentence(used[0].text, n);
    return first.length > 42 ? first.slice(0, 40) + '…' : first;
  }

  global.CollegeQA = {
    init: function (data) { KB = data || []; return KB.length; },
    answer: answer, search: search, script: SCRIPT, normalize: normalize
  };
})(typeof window !== 'undefined' ? window : globalThis);
