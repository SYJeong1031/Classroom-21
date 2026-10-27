'use strict';
const names = ['강구준','김규리','김단아','김동현','김민준','김세헌','김유림','김지아','김지윤','김채영','남여울','문채원','박규민','방희준','시온유','양아영','오윤아','유소담','이슬하','이지훈','임도현','전승현','정승윤','정재희','최준혁','황태검','서정현'];
const students = names.map((name,i) => ({name, no:i+1, id:String(2101+i)}));
const config = window.CLASSROOM_CONFIG || {};
const API = (config.API_BASE || '').replace(/\/$/, '');
const CLOUD = !!API, TTL = Math.min(60000, Math.max(0, Number(config.CACHE_MS) || 60000));
const KEY = 'classroom-21-records-v1';
const modal = document.querySelector('#modal'), content = document.querySelector('#modal-content');
let records = {}, isAdmin = false, selected = null, busy = false, session = null, studentSession = null, cooldown = 0;
const cache = new Map(), inFlight = new Map(), pendingWrites = new Map();
if (!CLOUD) {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const s of students) records[s.id] = Array.isArray(parsed[s.id]) ? parsed[s.id].filter(x => x && typeof x.date === 'string' && Number.isFinite(Date.parse(x.date)) && typeof x.note === 'string') : [];
    }
  } catch { toast('저장된 기록을 읽지 못했습니다.'); }
}
document.querySelector('#mode').textContent = CLOUD ? '클라우드 연결 · 필요할 때만 조회' : '로컬 데모 · 이 브라우저에 저장';
function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = message; el.classList.add('visible');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('visible'), 3500);
}
function escapeText(value) {
  return String(value).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function list() {
  const query = document.querySelector('#search').value.trim();
  const found = students.filter(s => s.name.includes(query) || s.id.includes(query));
  document.querySelector('#students').innerHTML = found.map(s => `<button class="student" data-id="${s.id}"><span class="avatar">${String(s.no).padStart(2,'0')}</span><span><strong>${s.name}</strong><small>${s.id} · 2학년 1반</small></span><span class="arrow">↗</span></button>`).join('');
  document.querySelector('#empty').hidden = found.length > 0;
}
function open() { if (!modal.open) modal.showModal(); }
function setBusy(value) {
  busy = value;
  content.setAttribute('aria-busy', String(value));
  content.querySelectorAll('button,input').forEach(el => el.disabled = value);
}
function resetAdmin() {
  isAdmin = false; session = null; studentSession = null; cache.clear(); inFlight.clear();
  document.querySelector('#admin').textContent = '관리자 로그인 ↗';
  document.querySelector('#mode').textContent = CLOUD ? '클라우드 연결 · 필요할 때만 조회' : '로컬 데모 · 이 브라우저에 저장';
}
function errorMessage(error) {
  const el = content.querySelector('.error');
  if (el) el.textContent = error.message;
  else toast(error.message);
}
async function api(path, options = {}, token) {
  if (Date.now() < cooldown) throw new Error('요청 제한 중입니다. 잠시 후 다시 시도하세요.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${API}${path}`, {
      ...options, signal: controller.signal, cache: 'no-store', credentials: 'omit',
      headers: {...(options.body ? {'Content-Type':'application/json'} : {}), ...(token ? {Authorization:`Bearer ${token}`} : {})}
    });
    const data = await response.json();
    if (response.status === 429) cooldown = Date.now() + 60000;
    if (!response.ok) {
      if (response.status === 401 && token) resetAdmin();
      throw Object.assign(new Error(data.error || '요청을 처리하지 못했습니다.'), {status:response.status, snapshot:data.snapshot});
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('서버 응답을 확인하지 못했습니다. 자동 재시도하지 않습니다. 기록 추가 중이었다면 같은 내용으로 다시 누르면 중복 없이 확인합니다.');
    throw error;
  } finally { clearTimeout(timer); }
}
function activeSession(id) {
  const auth = isAdmin ? session : studentSession;
  if (!auth || auth.expiresAt <= Date.now() || (!isAdmin && auth.id !== id)) {resetAdmin();throw new Error('로그인이 만료되었습니다. 다시 로그인하세요.');}
  return auth;
}
function putCache(id, data) { cache.set(id, {data, time:Date.now()}); }
async function load(id, force = false) {
  const auth = activeSession(id);
  const saved = cache.get(id);
  if (!force && saved && Date.now() - saved.time < TTL) return saved.data;
  if (inFlight.has(id)) return inFlight.get(id);
  const promise = api(`/api/students/${id}`, {}, auth.token).then(data => {putCache(id,data);return data;}).finally(() => inFlight.delete(id));
  inFlight.set(id,promise);
  return promise;
}
function monthKey(date) { return new Date(date.getTime() + 9*3600000).toISOString().slice(0,7); }
function localSnapshot(id) {
  const entries = records[id] || [], months = new Map();
  for (const e of entries) { const key = monthKey(new Date(e.date)); months.set(key,(months.get(key)||0)+1); }
  return {total:entries.length, months:[...months].map(([month,count])=>({month,count})), entries:[...entries].reverse().slice(0,50), fetchedAt:Date.now()};
}
async function select(id) {
  if (busy) return toast('처리 중입니다. 잠시 기다려 주세요.');
  selected = students.find(s=>s.id===id);
  if (isAdmin || (CLOUD && studentSession?.id === id && studentSession.expiresAt > Date.now())) return showDetail();
  content.innerHTML = `<div class="modal-icon">◈</div><div class="eyebrow">STUDENT ACCESS</div><h2>${selected.name}님의 기록</h2><p class="muted">선택한 학생의 4자리 학번을 입력하세요.</p><form id="verify"><label for="student-id">학번</label><input class="field" id="student-id" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="21XX" required autocomplete="off"><p class="error" role="alert"></p><button class="primary">기록 확인하기 →</button></form>`;
  open();
  document.querySelector('#verify').onsubmit = async e => {
    e.preventDefault();
    if (busy) return;
    if (document.querySelector('#student-id').value !== id) return errorMessage(new Error('선택한 학생의 학번과 일치하지 않습니다.'));
    if (!CLOUD) return detail(localSnapshot(id));
    setBusy(true);
    try {
      const data = await api('/api/login',{method:'POST',body:JSON.stringify({role:'student',id})});
      cache.clear(); studentSession = {...data,id}; putCache(id,data.snapshot);
      if (modal.open) detail(data.snapshot);
    } catch (error) { errorMessage(error); } finally { setBusy(false); }
  };
}
async function showDetail(force = false) {
  const id = selected.id;
  if (!CLOUD) return detail(localSnapshot(id));
  content.innerHTML = '<h2>기록을 확인하고 있습니다.</h2><p class="muted">필요한 기록만 안전하게 불러옵니다.</p><p class="error" role="alert"></p>';
  open(); setBusy(true);
  try { const data = await load(id,force); if (modal.open) detail(data); }
  catch (error) {
    content.innerHTML = '<h2>기록을 불러오지 못했습니다.</h2><p class="error" role="alert"></p><button id="retry" class="primary">다시 조회하기</button>';
    errorMessage(error);
    document.querySelector('#retry').onclick = () => {if (!busy) select(id);};
  } finally { setBusy(false); }
}
function detail(data) {
  const now = new Date(Date.now()+9*3600000);
  const months = Array.from({length:6},(_,i) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-5+i,1));
    const key = date.toISOString().slice(0,7);
    return {label:date.getUTCMonth()+1,count:data.months.find(m=>m.month===key)?.count||0};
  });
  const max = Math.max(1,...months.map(m=>m.count));
  content.innerHTML = `<div class="eyebrow">${selected.id} / PERSONAL RECORD</div><h2>${selected.name}님의 생활 기록</h2><p class="muted">기록을 확인하고, 오늘부터 한 걸음 더.</p><div class="stats"><div class="ring"><b>${data.total}</b><small>누적 횟수</small></div><div><strong>${data.total===0?'깨끗한 시작, 좋은 습관.':'더 나은 내일을 향해.'}</strong><p class="muted">이번 달 ${months[5].count}회 기록</p></div></div><strong>최근 6개월</strong><div class="bars" role="img" aria-label="${months.map(m=>`${m.label}월 ${m.count}회`).join(', ')}">${months.map(m=>`<div class="bar" style="height:${Math.max(3,m.count/max*65)}px" title="${m.label}월 ${m.count}회"><span>${m.label}월 · ${m.count}</span></div>`).join('')}</div><h3>최근 기록 <small class="muted">최대 50개</small></h3><ul class="history">${data.entries.length?data.entries.map(e=>`<li><span>${escapeText(e.note||'생활 규정 기록')}</span><time>${new Date(e.date).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}</time></li>`).join(''):'<li class="muted">아직 기록된 내역이 없습니다.</li>'}</ul>${CLOUD?`<div class="sync-row"><small class="muted">${new Date(data.fetchedAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul'})} 기준 · 자동 갱신 없음</small><button id="refresh" class="quiet">최신 기록 조회 ↻</button></div>`:''}${isAdmin?'<form id="add-record"><label for="note">기록 사유 (선택)</label><input id="note" class="field" maxlength="80" placeholder="예: 지각"><div class="actions" style="margin-top:12px"><button type="button" id="undo">최근 기록 취소</button><button class="primary">+ 1회 기록</button></div></form>':''}<p class="error" role="alert"></p>`;
  open();
  if (CLOUD) document.querySelector('#refresh').onclick = () => {if (!busy) showDetail(true);};
  if (isAdmin) {
    if (pendingWrites.has(selected.id)) document.querySelector('#note').value = pendingWrites.get(selected.id).note;
    document.querySelector('#add-record').onsubmit = e => {e.preventDefault();if (!busy) mutate('add',data);};
    document.querySelector('#undo').onclick = () => {
      if (busy) return;
      if (!data.entries.length) return toast('취소할 기록이 없습니다.');
      if (confirm(`${selected.name}님의 가장 최근 기록 1회를 취소할까요?`)) mutate('undo',data);
    };
  }
}
async function mutate(action, data) {
  const id = selected.id, note = document.querySelector('#note').value.trim();
  if (!CLOUD) {
    const entries = [...(records[id]||[])];
    if (action==='add') entries.push({date:new Date().toISOString(),note}); else entries.pop();
    const next = {...records,[id]:entries};
    try {localStorage.setItem(KEY,JSON.stringify(next));records=next;detail(localSnapshot(id));toast('기록을 저장했습니다.');}
    catch {errorMessage(new Error('브라우저 저장 공간과 권한을 확인하세요.'));}
    return;
  }
  setBusy(true);
  try {
    const auth = activeSession(id);
    let path = `/api/students/${id}/records`, options;
    if (action==='add') {
      const pending = pendingWrites.get(id);
      if (pending && pending.note !== note) throw new Error('이전 추가 요청의 결과가 확인되지 않았습니다. 이전 사유로 다시 추가해 결과를 먼저 확인하세요.');
      const write = pending || {note,requestId:crypto.randomUUID()};
      pendingWrites.set(id,write);
      options = {method:'POST',body:JSON.stringify(write)};
    } else {
      if (pendingWrites.has(id)) throw new Error('결과가 확인되지 않은 추가 요청이 있습니다. 같은 사유로 다시 추가해 결과를 먼저 확인하세요.');
      path += `/${data.entries[0].id}`; options = {method:'DELETE'};
    }
    const result = await api(path,options,auth.token);
    pendingWrites.delete(id); putCache(id,result);
    if (modal.open) detail(result);
    toast('기록을 저장했습니다.');
  } catch (error) {
    if (error.snapshot) {putCache(id,error.snapshot);if (modal.open) detail(error.snapshot);}
    errorMessage(error);
  } finally {setBusy(false);}
}
document.querySelector('#admin').onclick = () => {
  if (busy) return toast('처리 중입니다. 잠시 기다려 주세요.');
  if (isAdmin) {resetAdmin();modal.close();toast('관리자 모드를 종료했습니다.');return;}
  content.innerHTML = `<div class="modal-icon">⌘</div><div class="eyebrow">ADMINISTRATOR</div><h2>관리자 로그인</h2><p class="muted">학생의 생활 기록을 관리합니다.</p><form id="login"><label for="password">관리자 비밀번호</label><input id="password" class="field" type="password" maxlength="128" required autocomplete="current-password"><p class="error" role="alert"></p><button class="primary">로그인 →</button></form><p class="muted">${CLOUD?'서버에서 비밀번호를 확인합니다. 세션은 1시간 유지됩니다.':'서버 주소를 설정한 후 로그인하세요.'}</p>`;
  open();
  document.querySelector('#login').onsubmit = async e => {
    e.preventDefault(); if (busy) return;
    const password = document.querySelector('#password').value;
    setBusy(true);
    try {
      if (CLOUD) session = await api('/api/login',{method:'POST',body:JSON.stringify({role:'admin',password})});
      else throw new Error('서버 주소를 설정한 후 로그인하세요.');
      isAdmin=true;studentSession=null;cache.clear();modal.close();
      content.innerHTML='';
      document.querySelector('#admin').textContent='관리자 로그아웃 ↗';
      document.querySelector('#mode').textContent='관리자 모드';
      toast('학생을 선택해 기록을 관리하세요.');
    } catch (error) {errorMessage(error);} finally {setBusy(false);}
  };
};
document.querySelector('#close').onclick = () => modal.close();
modal.addEventListener('close',()=>{if (!busy) content.innerHTML='';});
document.querySelector('#search').oninput = list;
document.querySelector('#students').onclick = e => {const button=e.target.closest('[data-id]');if (button) select(button.dataset.id);};
if (!CLOUD) window.addEventListener('storage',e=>{if (e.key===KEY) location.reload();});
list();
