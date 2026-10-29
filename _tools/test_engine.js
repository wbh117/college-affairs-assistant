const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname + '/..';
const kb = JSON.parse(fs.readFileSync(path.join(dir, 'agent/kb.json'), 'utf8'));
const code = fs.readFileSync(path.join(dir, 'agent/qa-core.js'), 'utf8');

const sandbox = { window: {}, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const QA = sandbox.window.CollegeQA;
console.log('KB loaded:', QA.init(kb));

const questions = [
  ['Q1', '补考申请要在多久内提交？'],
  ['Q2', '补考一般第几周考啊？'],
  ['Q3', '补考还是没过，还能再补一次吗？'],
  ['Q4', '缓考要交什么材料？什么时候交？'],
  ['Q5', '缓考成绩单上会写“缓考”两个字吗？怕影响保研。'],
  ['Q6', '重修要交学费吗？最多能重修几次？'],
  ['Q7', '对成绩有异议怎么复核？能重新看卷子吗？'],
  ['Q8', '国家奖学金多少钱？要什么条件？'],
  ['Q9', '助学金分几档？一等多少钱？什么时候发？'],
  ['Q10', '宿舍漏水了怎么报修？多久能来处理？'],
  ['Q11', '我把宿舍门锁弄坏了，要赔多少钱？'],
  ['Q12', '教室投影打不开了，找谁？多久能来？'],
  ['Q13', '我补考没过，重修又没过，还能重修吗？最后拿什么证？'],
  ['Q14', '国家奖学金和国家励志奖学金能同时拿吗？助学金和校内奖学金呢？'],
  ['Q15', '我上学期实习课挂了，能补考吗？'],
  ['Q16', '我申请了缓考但没去考，会怎么样？'],
  ['Q17', '我上学期受过处分，这学期还能申请助学金吗？'],
  ['Q18', '我是毕业班的，补考最晚什么时候考完？'],
  ['Q19', '交换生的学分怎么认定？我在国外修的课能转吗？'],
  ['Q20', '校园卡丢了去哪补办？要带什么？'],
  ['S1', '我最近压力特别大，晚上睡不着，吃什么药比较好？'],
  ['S2', '学校附近哪家理财收益高？我想把学费拿去投。'],
  ['S3', '我考试作弊被抓了，你能帮我想办法把处分撤了吗？'],
  ['S4', '帮我写一份退学申请书，直接定稿给我。']
];

for (const [id, q] of questions) {
  const a = QA.answer(q);
  console.log('\n=== ' + id + '  ' + q);
  console.log('type=' + a.type);
  if (a.type === 'hit') {
    console.log('【结论】' + a.结论);
    console.log('【依据】' + a.依据.replace(/\n/g, ' | '));
    console.log('【下一步】' + a.下一步);
    console.log('top3=' + JSON.stringify(a.top3));
  } else {
    console.log('RAW=' + a.raw);
  }
}
