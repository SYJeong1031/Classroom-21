import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import worker from '../worker.mjs';
const origin='https://class.example';
function setup(t) {
  const dir=mkdtempSync(join(tmpdir(),'classroom-test-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let queries=0;
  const bridge=input=>{
    const p=spawnSync('python3',[new URL('./sqlite-bridge.py',import.meta.url).pathname,join(dir,'test.sqlite')],{input:JSON.stringify(input),encoding:'utf8'});
    if(p.status!==0)throw new Error(p.stderr);
    return JSON.parse(p.stdout);
  };
  bridge({schema:readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8')});
  const env={ALLOWED_ORIGIN:origin,ADMIN_PASSWORD:'test-admin-password',SESSION_SECRET:'a'.repeat(48),API_LIMITER:{limit:async()=>({success:true})},LOGIN_LIMITER:{limit:async()=>({success:true})},DB:{prepare(sql){return{sql,args:[],bind(...args){return{sql,args};}};},async batch(statements){queries+=statements.length;return bridge({statements});}}};
  const call=async(path,{method='GET',body,token,requestOrigin=origin}={})=>{
    const response=await worker.fetch(new Request(`https://api.example${path}`,{method,headers:{Origin:requestOrigin,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
    return{status:response.status,data:await response.json(),headers:response.headers};
  };
  const login=()=>call('/api/login',{method:'POST',body:{role:'admin',password:env.ADMIN_PASSWORD}});
  return{env,call,login,queries:()=>queries,bridge};
}
test('admin authentication, student token scope, no D1 for invalid requests',async t=>{
  const {call,login,queries}=setup(t);
  assert.equal((await call('/api/students/2101')).status,401);
  assert.equal((await call('/api/login',{method:'POST',body:{role:'admin',password:'bad'}})).status,401);
  assert.equal((await call('/api/students/2101',{requestOrigin:'https://evil.example'})).status,403);
  const admin=await login();assert.equal(admin.status,200);assert.equal(queries(),0);
  const student=await call('/api/login',{method:'POST',body:{role:'student',id:'2101'}});
  assert.equal(student.status,200);assert.equal(student.data.snapshot.total,0);assert.equal(queries(),3);
  assert.equal((await call('/api/students/2102',{token:student.data.token})).status,403);
  assert.equal((await call('/api/students/2101/records',{method:'POST',token:student.data.token,body:{}})).status,403);
  assert.equal((await call('/api/students/2101',{token:admin.data.token+'x'})).status,401);
  assert.equal(queries(),3);
  const second = await call('/api/login',{method:'POST',body:{role:'student',id:'2102'}});
  assert.equal(second.status,200,'any valid student id can obtain a read-only session without a code');
  assert.equal((await call('/api/login',{method:'POST',body:{role:'student',id:'2199'}})).status,400);
});
test('atomic totals, idempotent retries, cancellation and Seoul month',async t=>{
  const {call,login,queries}=setup(t);const {data:{token}}=await login();
  const requestId=crypto.randomUUID();
  const add=()=>call('/api/students/2101/records',{method:'POST',token,body:{requestId,note:'지각'}});
  const first=await add();assert.equal(first.status,200);assert.equal(first.data.total,1);assert.equal(first.data.entries[0].note,'지각');assert.equal(queries(),4);
  assert.equal((await add()).data.total,1);
  const secondId=crypto.randomUUID();
  await call('/api/students/2101/records',{method:'POST',token,body:{requestId:secondId,note:'규정'}});
  const stale=await call(`/api/students/2101/records/${requestId}`,{method:'DELETE',token});
  assert.equal(stale.status,409);assert.equal(stale.data.snapshot.total,2);
  const removed=await call(`/api/students/2101/records/${secondId}`,{method:'DELETE',token});
  assert.equal(removed.data.total,1);assert.equal(removed.data.months.reduce((n,m)=>n+m.count,0),1);
  const retried=await call('/api/students/2101/records',{method:'POST',token,body:{requestId:secondId,note:'규정'}});
  assert.equal(retried.data.total,1,'cancelled idempotency key must not resurrect a record');
  assert.equal((await call('/api/students/2102',{token})).data.total,0);
  assert.equal(first.headers.get('Cache-Control'),'no-store');
});
test('rate limits and payload limits reject before D1',async t=>{
  const {env,call,queries}=setup(t);
  env.API_LIMITER.limit=async()=>({success:false});
  const limited=await call('/api/login',{method:'POST',body:{}});
  assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'60');
  env.API_LIMITER.limit=async()=>({success:true});
  assert.equal((await call('/api/login',{method:'POST',body:{password:'x'.repeat(3000)}})).status,413);
  assert.equal(queries(),0);
});
test('snapshot bounds history to 50, retains all-time totals, uses indexes',async t=>{
  const {bridge,call,login}=setup(t);
  bridge({statements:Array.from({length:80},(_,i)=>({sql:'INSERT INTO records(id,student_id,note,date,month) VALUES(?,?,?,?,?)',args:[crypto.randomUUID(),'2101',String(i),'2026-01-31T16:00:00.000Z','2026-02']}))});
  const {data:{token}}=await login();
  const result=await call('/api/students/2101',{token});
  assert.equal(result.data.total,80);assert.equal(result.data.entries.length,50);assert.equal(result.data.entries[0].note,'79');
  const plans=bridge({statements:[{sql:'EXPLAIN QUERY PLAN SELECT id,note,date FROM records WHERE student_id = ? AND cancelled = 0 ORDER BY seq DESC LIMIT 50',args:['2101']}]});
  assert.match(JSON.stringify(plans),/records_student_seq/);
});
