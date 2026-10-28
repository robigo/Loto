const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('account.js','utf8')
  .replace(/^import .*;\n/gm, '')
  .replace("await import('https://esm.sh/@supabase/supabase-js@2.118.0')", 'await Promise.resolve({createClient: mockClient})');
const ids = ['account-status','account-message','account-login','account-logout','account-save','account-load','account-kind','account-storage'];
const els = Object.fromEntries(ids.map(id => [id, {textContent:'', events:{}, addEventListener(k,f){this.events[k]=f;}}]));
let observer, resolveLoad;
let active = {id:'user-a',email:'a@example.test'};
const firstA = {numbers:[1,8,10,12,14,23],strong:5};
let screen = {numbers:[],strong:null};
const form = {
  snapshot(){return {version:1,tables:[structuredClone(screen)]};},
  restore(){}, resetSaved(){screen={numbers:[],strong:null};},
  setPrivateFirst(row){screen=structuredClone(row);}
};
const accountStore = {
  init: async()=>observer(active),
  signIn: async()=>{},
  signOut: async()=>{active=null;observer(null);},
  save: async()=>{},
  load: async()=>new Promise(resolve=>{resolveLoad=resolve;})
};
const wait = () => new Promise(resolve=>setTimeout(resolve,20));
const ctx=vm.createContext({
  accountConfig:{enabled:true,supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_example'},
  createAccountStore:(_client,onUser)=>{observer=onUser;return accountStore;},
  mockClient:()=>({}), document:{getElementById:id=>els[id]},
  window:{lotoForm:form,lotoSystematic:form, location:{href:'https://example.com/',origin:'https://example.com',pathname:'/'},history:{replaceState(){}}},
  sessionStorage:{getItem(){return null;},removeItem(){},setItem(){}}, URL, setTimeout
});
(async()=>{
  vm.runInContext(source,ctx);
  await wait();
  assert(resolveLoad,'initial private fetch should start');
  resolveLoad({payload:{tables:[firstA]}});
  await wait();
  assert.deepEqual(screen,firstA,'signed-in account should load its own first table');
  observer(null);
  assert.deepEqual(screen,{numbers:[],strong:null},'sign-out clears the private table immediately');
  active={id:'user-a',email:'a@example.test'};
  observer(active); await wait();
  const stale=resolveLoad;
  active={id:'user-b',email:'b@example.test'};
  observer(active); await wait();
  const current=resolveLoad;
  stale({payload:{tables:[firstA]}}); await wait();
  assert.deepEqual(screen,{numbers:[],strong:null},'stale response cannot expose the previous account');
  current(null); await wait();
  assert.deepEqual(screen,{numbers:[],strong:null},'new account without a saved form starts blank');
  console.log('PASS: private first-row auto-load, sign-out removal, account-switch race, blank new account.');
})().catch(e=>{console.error(e);process.exitCode=1;});
