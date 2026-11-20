import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const root = new URL('../../private-access/dist/', import.meta.url);
const read = p => readFile(new URL(p, root), 'utf8');
class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.events={};this.value='8';}
  setAttribute(k,v){this.attrs[k]=v;} getAttribute(k){return this.attrs[k];}
  appendChild(c){this.children.push(c);} append(...c){this.children.push(...c);}
  replaceChildren(...c){this.children=c;} focus(){}
  addEventListener(k,f){(this.events[k] ||= []).push(f);}
  querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tag===tag?[c]:[]),...c.querySelectorAll(tag)]);}
}
const plain = x => JSON.parse(JSON.stringify(x));
test('built forms round-trip old version-1 payloads, strong numbers, reject corruption and survive delayed history', async()=>{
  const html = await read('index.html');
  const els = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
  const tabs=['past-tab','new-tab','analysis-tab','systematic-tab'].map(id=>{els[id].id=id;return els[id];});
  tabs[0].setAttribute('aria-selected','true');
  let finish;
  const history = new Promise(r=>{finish=r;});
  const ctx=vm.createContext({window:{},document:{getElementById:id=>els[id],createElement:tag=>new Element(tag),querySelectorAll:()=>tabs},fetch:()=>history});
  vm.runInContext(await read('ticket-diversity.js'),ctx);
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
  vm.runInContext(await read('systematic.js'),ctx);
  vm.runInContext(await read('form-adapter.js'),ctx);
  const form=ctx.window.lotoForm, sys=ctx.window.lotoSystematic;
  const pending=vm.runInContext(await read('draw-generator.js'),ctx);
  const value=plain(form.snapshot());value.tables[0]={numbers:[1,8,10,12,14,24],strong:5};
  form.restore(value);assert.deepEqual(plain(form.snapshot()),value);
  for(const change of [v=>v.tables[5].numbers=[99],v=>v.tables[2].strong=9,v=>v.tables[3].numbers=[1,1]]){
    const bad=structuredClone(value);change(bad);assert.throws(()=>form.restore(bad));assert.deepEqual(plain(form.snapshot()),value);
  }
  for(const size of [8,12]){
    const saved={version:1,size,numbers:Array.from({length:size},(_,i)=>i+1),strong:7};
    sys.restore(saved);assert.deepEqual(plain(sys.snapshot()),saved);
    assert.equal(els['systematic-combinations'].children.length,size===8?28:924);
    assert.throws(()=>sys.restore({...saved,strong:8}));assert.deepEqual(plain(sys.snapshot()),saved);
  }
  finish({ok:true,json:async()=>[{id:'3981',date:'2026-11-03',numbers:[8,12,21,23,28,35],strong:6}]});
  await pending;assert.deepEqual(plain(form.snapshot()),value);
  ctx.window.lotoNavigation.showSaved('systematic');assert.equal(els['systematic-panel'].hidden,false);
  form.resetSaved();sys.resetSaved();assert(form.snapshot().tables.every(r=>r.numbers.length===0&&r.strong===null));
  assert.equal(sys.snapshot().strong,null);
});
test('existing account store preserves owner UUID and rejects pending response after account switch', async()=>{
  const code=await read('account-core.js');
  const {createAccountStore}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  let user={id:'a'}, change, release;
  const rows=new Map();
  const client={auth:{onAuthStateChange(f){change=f;},async getUser(){return {data:{user}};}},
    from(){let owner,kind;return {
      async upsert(row){rows.set(row.user_id+row.kind,structuredClone(row.payload));return {};},
      select(){return this;},eq(k,v){if(k==='user_id')owner=v;else kind=v;return this;},
      async maybeSingle(){return new Promise(r=>{release=()=>r({data:{payload:rows.get(owner+kind)}});});}
    };}};
  const store=createAccountStore(client,()=>{});await store.init();
  await store.save('regular',{version:1});assert(rows.has('aregular'));
  const loading=store.load('regular');await new Promise(setImmediate);
  user={id:'b'};change('SIGNED_IN',{user});release();await assert.rejects(loading,/SESSION_CHANGED/);
});
