import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
const read = p => readFile(new URL(p, root), 'utf8');
test('all asset requests run Worker; alternate URLs off and config denies until configured', async () => {
  const config = await read('private-access/wrangler.toml');
  for (const value of ['run_worker_first = true','workers_dev = false','preview_urls = false','APPROVED_EMAILS = ""']) assert(config.includes(value));
});
test('private build wires account controls and validated forms; public index unchanged', async () => {
  const html = await read('private-access/dist/index.html');
  const publicHtml = await read('index.html');
  assert(!publicHtml.includes('id="account-login"'));
  for (const s of ['id="account-login"','id="account-save"','id="account-load"','src="account.js"','src="form-adapter.js"']) assert(html.includes(s));
  const files = await readdir(new URL('private-access/dist/',root));
  assert.deepEqual(files.sort(), ['account-config.js','account-core.js','account.css','account.js','data','draw-generator.js','form-adapter.js','frequency.css','frequency.js','index.html','systematic.js','ticket-diversity.js'].sort());
  assert((await read('private-access/dist/account.js')).includes("fetch('/__access/identity'"));
});
test('draw files are copied byte-for-byte', async () => {
  for (const file of ['history.json','draws.json']) assert.equal(await read('data/'+file), await read('private-access/dist/data/'+file));
});
test('approval migration is restrictive, UUID based and clients cannot grant approval', async () => {
  const sql = await read('supabase/002_approved_users.sql');
  assert(sql.includes('as restrictive for all to authenticated'));
  assert(sql.includes('revoke all on public.loto_approved_users from public, anon, authenticated'));
  assert(!sql.includes('grant insert')); assert(!sql.includes('user_metadata'));
  assert(!sql.includes('delete from public.loto_saved_forms'));
});
