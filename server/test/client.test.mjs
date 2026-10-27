import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('no initial requests; repeat reads cache and concurrent reads deduplicate',async()=>{
  const elements=new Map();
  const element=key=>{if(!elements.has(key))elements.set(key,{value:'',innerHTML:'',textContent:'',classList:{add(){},remove(){}},addEventListener(){},setAttribute(){},querySelectorAll(){return[];}});return elements.get(key);};
  let calls=0,release;
  const context=vm.createContext({window:{CLASSROOM_CONFIG:{API_BASE:'https://api.example',CACHE_MS:60000}},document:{querySelector:element},console,Date,Map,JSON,Number,String,Array,Math,setTimeout,clearTimeout,AbortController,TypeError,fetch:async()=>{calls++;await new Promise(resolve=>release=resolve);return{ok:true,status:200,json:async()=>({total:0,months:[],entries:[],fetchedAt:Date.now()})};}});
  vm.runInContext(readFileSync(new URL('../../app.js',import.meta.url),'utf8'),context);
  assert.equal(calls,0,'initial list and setup must be network-free');
  vm.runInContext('isAdmin=true; session={token:"test",expiresAt:Date.now()+100000};',context);
  const first=vm.runInContext('load("2101")',context);
  const second=vm.runInContext('load("2101")',context);
  assert.equal(calls,1);release();await Promise.all([first,second]);
  await vm.runInContext('load("2101")',context);assert.equal(calls,1);
  const forced=vm.runInContext('load("2101",true)',context);assert.equal(calls,2);release();await forced;
});
