// Local browser integration with fake Google/Supabase. No external account writes.
const {createServer} = require('node:http');
const {readFile} = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../../private-access/dist');
const sdk = `export function createClient() {
  let user = {id:'user-a',email:'approved@example.test'}, change;
  const rows = new Map();
  window.testAuth = {switch(next) {user=next;change('SIGNED_IN', next ? {user:next}:null);}};
  return {auth: {
    onAuthStateChange(fn){change=fn;},
    async getUser(){return {data:{user}};},
    async signInWithOAuth(){return {};},
    async signOut(){user=null;change('SIGNED_OUT',null);return {};}
  }, from(){ let owner,kind;
    return {async upsert(row){rows.set(row.user_id+':'+row.kind, structuredClone(row.payload));return {};},
      select(){return this;}, eq(k,v){if(k==='user_id')owner=v;else kind=v;return this;},
      async maybeSingle(){const payload=rows.get(owner+':'+kind);return {data:payload?{payload:structuredClone(payload)}:null};}
    };
  }};
}`;
const server = createServer(async (req,res) => {
  if(req.url === '/__access/identity') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({email:'approved@example.test'}));return;}
  const filename = new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
  if(filename.includes('..')) {res.writeHead(404).end();return;}
  try {const bytes = await readFile(path.join(root, filename));
    res.setHeader('Content-Type', filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.json')?'application/json':'text/html');
    res.end(bytes);
  }catch{res.writeHead(404).end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true,args:['--no-sandbox'], ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];page.on('pageerror', e=>errors.push(e.message));
    await page.route('https://esm.sh/**', route=>route.fulfill({contentType:'application/javascript',body:sdk}));
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.waitForFunction(()=>document.getElementById('account-status').textContent.includes('approved@example.test'));
    await page.waitForFunction(()=>!document.getElementById('random').disabled);
    const regular = await page.evaluate(()=>{
      const value=window.lotoForm.snapshot();
      value.tables[0]={numbers:[1,8,10,12,14,24],strong:5};window.lotoForm.restore(value);return value;
    });
    await page.click('#account-save');
    await page.waitForFunction(()=>document.getElementById('account-message').textContent.includes('נשמר'));
    await page.evaluate(()=>window.lotoForm.resetSaved());
    await page.click('#account-load');
    await page.waitForFunction(()=>document.getElementById('account-message').textContent.includes('נטען'));
    assert.deepEqual(await page.evaluate(()=>window.lotoForm.snapshot()),regular);
    await page.evaluate(()=>window.lotoSystematic.restore({version:1,size:8,numbers:[1,2,3,4,5,6,7,8],strong:7}));
    await page.selectOption('#account-kind','systematic');
    await page.click('#account-save');
    await page.waitForFunction(()=>document.getElementById('account-message').textContent.includes('נשמר'));
    await page.evaluate(()=>window.lotoSystematic.resetSaved());
    await page.click('#account-load');
    await page.waitForFunction(()=>document.getElementById('account-message').textContent.includes('נטען'));
    assert.equal(await page.locator('#systematic-combinations li').count(),28);
    assert.equal(await page.locator('#systematic-panel').isVisible(),true);
    await page.evaluate(()=>{
      const before=JSON.stringify(window.lotoForm.snapshot());
      const bad=window.lotoForm.snapshot();bad.tables[5].numbers=[99];
      try{window.lotoForm.restore(bad);throw Error('accepted malformed data');}catch(e){if(e.message==='accepted malformed data')throw e;}
      if(JSON.stringify(window.lotoForm.snapshot())!==before)throw Error('partial mutation');
      window.testAuth.switch({id:'user-b',email:'other@example.test'});
    });
    assert.equal(await page.locator('#account-save').isDisabled(),true);
    assert.deepEqual((await page.evaluate(()=>window.lotoForm.snapshot())).tables[0],{numbers:[],strong:null});
    await page.evaluate(()=>window.testAuth.switch({id:'user-a',email:'approved@example.test'}));
    await page.waitForFunction(()=>window.lotoForm.getFixedDraw().strong===5);
    await page.click('#account-logout');
    assert.deepEqual((await page.evaluate(()=>window.lotoForm.snapshot())).tables[0],{numbers:[],strong:null});
    assert.equal(await page.locator('#account-save').isDisabled(),true);
    assert.deepEqual(errors,[]);
    console.log('PASS: mobile Chromium private build, account wiring, regular/systematic save/load, strong numbers, invalid payload atomicity, account mismatch, private auto-load and sign-out. Auth/DB mocked.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
