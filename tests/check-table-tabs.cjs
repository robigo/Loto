const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
class Element {
  constructor(){this.attrs={};this.events={};this.children=[];}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,f){this.events[k]=f;}
  appendChild(c){this.children.push(c);}
  focus(){this.focused=true;}
}
const html=fs.readFileSync('index.html','utf8');
const panels=Array.from({length:14},()=>new Element());
const tablist=new Element(), label=new Element();
const ctx=vm.createContext({document:{querySelectorAll:()=>panels,createElement:()=>new Element(),getElementById:id=>id==='table-tabs'?tablist:label}});
vm.runInContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1],ctx);
const tabs=tablist.children;
function selected(i){
  assert.equal(panels.filter(p=>!p.hidden).length,1);
  assert.equal(panels[i].hidden,false);
  assert.equal(tabs.filter(t=>t.tabIndex===0).length,1);
  assert.equal(tabs[i].attrs['aria-selected'],'true');
  assert.equal(tabs[i].attrs['aria-controls'],panels[i].id);
}
assert.equal(tabs.length,14);selected(0);
const state={numbers:[1,8,10,12,14,24],strong:5};
panels[0].saved=state;
tabs[13].events.click();selected(13);
let prevented=false;
tabs[13].events.keydown({key:'ArrowLeft',preventDefault(){prevented=true;}});selected(0);
assert(prevented);assert(tabs[0].focused);
for (const [from,key,to] of [[0,'ArrowRight',13],[13,'Home',0],[0,'End',13]]) {
  tabs[from].events.keydown({key,preventDefault(){}});selected(to);
}
tabs[0].events.click();selected(0);assert.strictEqual(panels[0].saved,state);
assert.equal(tablist.hidden,false);assert.equal(label.hidden,false);
assert(html.includes('#tables > .panel[hidden] { display: block !important; }'));
console.log('PASS: 14 tabs, one visible table, RTL keyboard navigation, selection semantics, retained panel state and print-all rule.');
