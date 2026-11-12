// 리포트 업데이트 알림 보내기 (VOC·도급비·근무 로스터·순회차량·교육 영상)
// 이전 버전(index.html)과 새 버전을 비교해 데이터가 바뀌었을 때만, 바뀐 내용을 알림 문구로 만들어 보낸다.
// 사용: node notify.mjs <이전 index.html> <새 index.html>      (자동 — 배포 후)
//       MESSAGE="문구" node notify.mjs                          (수동 — 직접 쓴 문구)
import fs from 'node:fs';
import webpush from 'web-push';

const SHEET_API = 'https://script.google.com/macros/s/AKfycbwRkoZIIvoJqAN5Tof1eBoS0ghhVLMTp6U0Y417JjG_Cnf12391ijWyScVtm8uRLNunXA/exec';
const SHEET = '알림구독';
const SITE = 'https://tomlee2604.github.io/daily-voc-report/';

// ── HTML 안의 데이터 상수(JSON) 읽기 ──
function readConst(html, name){
  const m = html.match(new RegExp('(?:const|var|let)\\s+' + name + '\\s*=\\s*'));
  if(!m) return null;
  let i = m.index + m[0].length, depth = 0, str = null, start = i;
  for(; i < html.length; i++){
    const c = html[i];
    if(str){ if(c === '\\'){ i++; continue; } if(c === str) str = null; continue; }
    if(c === '"' || c === "'"){ str = c; continue; }
    if(c === '{' || c === '['){ depth++; }
    else if(c === '}' || c === ']'){ depth--; if(depth === 0){ i++; break; } }
  }
  try{ return JSON.parse(html.slice(start, i)); }catch(e){ return null; }
}
const SAT = ['매우만족','만족','보통','불만족','매우불만족'];
function summarize(html){
  const o = {voc:0, vocMax:'', cost:{}, ops:new Set(), rt:new Set()};
  const v = readConst(html, 'csmVocFull') || {};
  for(const k in v) for(const s of SAT) for(const r of (v[k][s] || [])){ o.voc++; if(r.date > o.vocMax) o.vocMax = r.date; }
  const c = readConst(html, 'csmMonthlyCostTotalData') || {};
  for(const code in c) for(const mo in c[code]){ const t = (c[code][mo] || []).reduce((a, x) => a + (x.total || 0), 0); o.cost[mo] = (o.cost[mo] || 0) + t; }
  const ops = readConst(html, 'OPS');
  if(ops && ops.S && ops.D) for(const a of ops.D){ const d = ops.S[a[5]]; if(d) o.ops.add(String(+d.slice(0, 2))); }
  o.edu = new Map(); const eb = html.indexOf('var EDU_VIDEOS'); if(eb >= 0){ const blk = html.slice(eb, html.indexOf('];', eb)); for(const m of blk.matchAll(/\{id:'([^']+)',\s*title:'([^']+)'/g)) o.edu.set(m[1], m[2]); }
  const rt = readConst(html, 'RT_CSM_COST') || {};
  for(const mo in rt) if(rt[mo] && Object.keys(rt[mo]).length) o.rt.add(String(+mo));
  return o;
}
const md = d => d ? (+d.slice(5, 7)) + '/' + (+d.slice(8, 10)) : '';
function buildMessage(prevHtml, nextHtml){
  const a = summarize(prevHtml), b = summarize(nextHtml), parts = [];
  if(b.voc !== a.voc || b.vocMax !== a.vocMax){
    const diff = b.voc - a.voc;
    const cnt = diff ? ' (' + (diff > 0 ? '+' : '') + diff.toLocaleString('ko-KR') + '건, 누적 ' + b.voc.toLocaleString('ko-KR') + '건)' : '';
    if(b.vocMax !== a.vocMax){ const from = a.vocMax ? new Date(Date.parse(a.vocMax) + 864e5).toISOString().slice(0, 10) : ''; parts.push('VOC ' + (from ? md(from) + '~' : '~') + md(b.vocMax) + ' 반영' + cnt); }
    else parts.push('VOC 데이터 정리' + cnt);
  }
  const newCost = Object.keys(b.cost).filter(m => !(m in a.cost) && b.cost[m] > 0).sort((x, y) => x - y);
  const chgCost = Object.keys(b.cost).filter(m => m in a.cost && Math.round(a.cost[m]) !== Math.round(b.cost[m])).sort((x, y) => x - y);
  if(newCost.length) parts.push(newCost.join('·') + '월 도급비');
  else if(chgCost.length) parts.push(chgCost.join('·') + '월 도급비 갱신');
  const newOps = [...b.ops].filter(m => !a.ops.has(m)).sort((x, y) => x - y);
  if(newOps.length) parts.push(newOps.join('·') + '월 근무 로스터·배차내역');
  const newRt = [...b.rt].filter(m => !a.rt.has(m)).sort((x, y) => x - y);
  if(newRt.length && !newCost.length) parts.push(newRt.join('·') + '월 순회차량 도급비');
  const newEdu = [...b.edu].filter(([id]) => !a.edu.has(id)).map(([, title]) => '새 교육 영상 「' + title + '」');
  parts.push(...newEdu);
  return parts.join(' · ');
}

// ── 구독 목록 (구글 시트) ──
async function loadSubs(){
  const r = await fetch(SHEET_API + '?action=read&sheet=' + encodeURIComponent(SHEET) + '&callback=cb', {redirect:'follow'});
  let t = (await r.text()).trim();
  const m = t.match(/^[\w$.]+\(([\s\S]*)\)\s*;?$/); if(m) t = m[1];
  let rows = []; try{ rows = JSON.parse(t); }catch(e){ console.log('구독 목록을 읽지 못함:', t.slice(0, 200)); return []; }
  const byEp = new Map();
  for(const row of rows){ const ep = row && row[1]; if(typeof ep === 'string' && ep.startsWith('https://') && row[2] && row[3]) byEp.set(ep, {endpoint:ep, keys:{p256dh:row[2], auth:row[3]}, who:row[4] || '', dev:row[5] || ''}); }
  return [...byEp.values()];
}

async function main(){
  let body = (process.env.MESSAGE || '').trim();
  if(!body){
    const [prev, next] = process.argv.slice(2);
    if(!prev || !next || !fs.existsSync(prev)){ console.log('비교할 이전 버전이 없어 알림을 보내지 않음'); return; }
    body = buildMessage(fs.readFileSync(prev, 'utf8'), fs.readFileSync(next, 'utf8'));
    if(!body){ console.log('데이터 변경 없음 (디자인·기능 수정) → 알림 안 보냄'); return; }
  }
  console.log('알림 문구:', body);
  if(process.env.DRY_RUN){ console.log('DRY_RUN — 발송 생략'); return; }
  if(!process.env.VAPID_PRIVATE_KEY){ console.log('VAPID_PRIVATE_KEY 시크릿이 없어 발송하지 못함'); process.exitCode = 1; return; }
  webpush.setVapidDetails(SITE, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const subs = await loadSubs();
  console.log('구독 기기', subs.length + '대');
  const payload = JSON.stringify({title:'물류서비스 운영 현황 업데이트', body, url:SITE, tag:'report-update'});
  let ok = 0, gone = 0, fail = 0;
  await Promise.all(subs.map(s => webpush.sendNotification(s, payload, {TTL:86400, urgency:'normal'})
    .then(() => ok++)
    .catch(e => { if(e.statusCode === 404 || e.statusCode === 410) gone++; else { fail++; console.log('실패', s.who, s.dev, e.statusCode || '', (e.body || e.message || '').toString().slice(0, 120)); } })));
  console.log(`보냄 ${ok}대 · 만료 ${gone}대 · 실패 ${fail}대`);
}
export { buildMessage, summarize };
if(import.meta.url === 'file://' + process.argv[1]) main().catch(e => { console.error(e); process.exitCode = 1; });
