const enc = new TextEncoder();
const validId = id => /^21\d{2}$/.test(id) && Number(id) >= 2101 && Number(id) <= 2128;
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const unb64 = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4)), c => c.charCodeAt(0));
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
async function key(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function equal(a, b) {
  // Compare fixed-size hashes; do not log credentials.
  const [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', enc.encode(s))));
  let diff = 0;
  const left = new Uint8Array(x), right = new Uint8Array(y);
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
async function issue(env, role, id) {
  const payload = { role, id, exp: Math.floor(Date.now() / 1000) + (role === 'admin' ? 3600 : 900) };
  const body = b64(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await key(env.SESSION_SECRET), enc.encode(body));
  return { token: `${body}.${b64(sig)}`, expiresAt: payload.exp * 1000 };
}
async function authenticate(request, env) {
  try {
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
    if (token.length > 1024) throw new Error();
    const parts = token.split('.');
    if (parts.length !== 2 || !await crypto.subtle.verify('HMAC', await key(env.SESSION_SECRET), unb64(parts[1]), enc.encode(parts[0]))) throw new Error();
    const auth = JSON.parse(new TextDecoder().decode(unb64(parts[0])));
    if (!Number.isFinite(auth.exp) || auth.exp <= Date.now() / 1000 || !['admin', 'student'].includes(auth.role)) throw new Error();
    if (auth.role === 'student' && !validId(auth.id)) throw new Error();
    return auth;
  } catch { fail(401, '로그인이 만료되었습니다. 다시 로그인하세요.'); }
}
async function body(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail(415, 'JSON 요청이 필요합니다.');
  // Bound actual streamed bytes, including requests with no Content-Length.
  if (Number(request.headers.get('Content-Length')) > 2048) fail(413, '요청이 너무 큽니다.');
  if (!request.body) fail(400, '요청 내용이 없습니다.');
  const reader = request.body.getReader();
  let total = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 2048) { await reader.cancel(); fail(413, '요청이 너무 큽니다.'); }
    chunks.push(value);
  }
  const data = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(data));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { fail(400, '잘못된 JSON입니다.'); }
}
function monthKey(date = new Date()) {
  return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 7); // Asia/Seoul
}
function snapshotQueries(db, id) {
  const seoul = new Date(Date.now() + 9 * 3600000);
  const first = new Date(Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth() - 5, 1)).toISOString().slice(0, 7);
  return [
    db.prepare('SELECT total FROM students WHERE id = ?').bind(id),
    db.prepare('SELECT month, count FROM monthly WHERE student_id = ? AND month >= ? ORDER BY month').bind(id, first),
    db.prepare('SELECT id, note, date FROM records WHERE student_id = ? AND cancelled = 0 ORDER BY seq DESC LIMIT 50').bind(id)
  ];
}
function snapshot(results) {
  return { total: results[0].results[0]?.total || 0, months: results[1].results, entries: results[2].results, fetchedAt: Date.now() };
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowedOrigins = new Set([new URL(request.url).origin, env.ALLOWED_ORIGIN].filter(Boolean));
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff',
      ...(origin && allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {})
    };
    const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...headers, ...extra } });
    try {
      if (origin && !allowedOrigins.has(origin)) fail(403, '허용되지 않은 사이트입니다.');
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' } });
      if (!env.DB || !env.API_LIMITER || !env.LOGIN_LIMITER || !env.ADMIN_PASSWORD || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) fail(503, '서버 설정을 확인해 주세요.');
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      if (!(await env.API_LIMITER.limit({ key: ip })).success) fail(429, '요청이 많습니다. 1분 뒤 다시 시도하세요.');
      const path = new URL(request.url).pathname;
      if (path === '/api/login' && request.method === 'POST') {
        if (!(await env.LOGIN_LIMITER.limit({ key: ip })).success) fail(429, '로그인 시도가 많습니다. 1분 뒤 다시 시도하세요.');
        const input = await body(request);
        if (input.role === 'admin') {
          if (typeof input.password !== 'string' || !await equal(input.password, env.ADMIN_PASSWORD)) fail(401, '비밀번호가 올바르지 않습니다.');
          return json(await issue(env, 'admin', null)); // No D1 query for admin login.
        }
        // 학번만 확인합니다. 이 조회 절차는 본인 인증이 아닙니다.
        if (input.role !== 'student' || typeof input.id !== 'string' || !validId(input.id)) fail(400, '학번이 올바르지 않습니다.');
        const session = await issue(env, 'student', input.id);
        return json({ ...session, snapshot: snapshot(await env.DB.batch(snapshotQueries(env.DB, input.id))) });
      }
      const match = /^\/api\/students\/(21\d{2})(?:\/records(?:\/([0-9a-f-]{36}))?)?$/.exec(path);
      if (!match || !validId(match[1])) fail(404, '찾을 수 없는 경로입니다.');
      const id = match[1], eventId = match[2];
      const auth = await authenticate(request, env);
      if (auth.role !== 'admin' && auth.id !== id) fail(403, '본인의 기록만 조회할 수 있습니다.');
      if (request.method === 'GET' && path === `/api/students/${id}`) return json(snapshot(await env.DB.batch(snapshotQueries(env.DB, id))));
      if (auth.role !== 'admin') fail(403, '관리자만 기록을 변경할 수 있습니다.');
      let mutation;
      if (request.method === 'POST' && path === `/api/students/${id}/records`) {
        const input = await body(request);
        if (typeof input.note !== 'string' || input.note.length > 80 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.requestId || '')) fail(400, '기록 내용이 올바르지 않습니다.');
        const date = new Date();
        mutation = env.DB.prepare('INSERT INTO records(id, student_id, note, date, month) VALUES(?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(input.requestId, id, input.note.trim(), date.toISOString(), monthKey(date));
      } else if (request.method === 'DELETE' && eventId) {
        // Only cancel the exact latest event the administrator saw.
        mutation = env.DB.prepare('UPDATE records SET cancelled = 1 WHERE student_id = ? AND id = ? AND cancelled = 0 AND seq = (SELECT seq FROM records WHERE student_id = ? AND cancelled = 0 ORDER BY seq DESC LIMIT 1)').bind(id, eventId, id);
      } else fail(405, '지원하지 않는 요청입니다.');
      // One transaction: mutation + the updated snapshot. No follow-up fetch.
      const results = await env.DB.batch([mutation, ...snapshotQueries(env.DB, id)]);
      const data = snapshot(results.slice(1));
      if (request.method === 'DELETE' && !results[0].meta.changes) return json({ error: '이미 취소되었거나 최신 기록이 바뀌었습니다. 화면을 갱신했습니다.', snapshot: data }, 409);
      return json(data);
    } catch (error) {
      return json({ error: error.status ? error.message : '일시적으로 처리할 수 없습니다. 잠시 후 다시 시도하세요.' }, error.status || 503, error.status === 429 ? { 'Retry-After': '60' } : {});
    }
  }
};
