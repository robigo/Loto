import {readFile, writeFile, mkdir, rm, copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'private-access/dist');
const read = name => readFile(path.join(root, name), 'utf8');
function replaceOnce(source, target, replacement) {
  if (source.split(target).length !== 2) throw Error('Upstream source changed: ' + target.slice(0, 60));
  return source.replace(target, replacement);
}
await rm(out, {recursive: true, force: true});
await mkdir(path.join(out, 'data'), {recursive: true});
// Explicit allowlist. Never upload repository root, SQL, tests, docs, or Worker source.
for (const name of ['frequency.css', 'frequency.js', 'ticket-diversity.js', 'account.css',
  'account-core.js', 'account-config.js', 'data/history.json', 'data/draws.json']) {
  await copyFile(path.join(root, name), path.join(out, name));
}
let html = await read('index.html');
html = replaceOnce(html, '</head>', '<link rel="stylesheet" href="account.css">\n<script src="form-adapter.js" defer></script>\n<script type="module" src="account.js"></script>\n</head>');
html = replaceOnce(html, '<body>', `<body>
<section class="account" aria-label="חשבון אישי">
  <p id="account-status" role="status">הגישה אושרה. טוען חשבון…</p>
  <button id="account-login" type="button">התחברות Google לטפסים השמורים</button>
  <button id="account-logout" type="button" hidden>יציאה מחשבון הטפסים</button>
  <div id="account-storage" hidden>
    <label for="account-kind">סוג הטופס</label>
    <select id="account-kind"><option value="regular">רגיל</option><option value="systematic">שיטתי</option></select>
    <button id="account-save" type="button" disabled>שמירה בחשבון</button>
    <button id="account-load" type="button" disabled>טעינה מהחשבון</button>
  </div>
  <p id="account-message" role="status"></p>
  <a href="/cdn-cgi/access/logout">סיום הרשאת הגישה לאתר</a>
</section>`);
await writeFile(path.join(out, 'index.html'), html);
await copyFile(path.join(root, 'private-access/form-adapter.js'), path.join(out, 'form-adapter.js'));
let systematic = await read('systematic.js');
systematic = replaceOnce(systematic, '  render();\n})();', `  window.lotoSystematic = {
    snapshot() { return {version: 1, size: Number(size.value), numbers: [...selected].sort((a,b) => a-b), strong}; },
    restore(value) {
      if (value?.version !== 1 || !Number.isInteger(value.size) || value.size < 8 || value.size > 12 ||
          !Array.isArray(value.numbers) || value.numbers.length > value.size || new Set(value.numbers).size !== value.numbers.length ||
          value.numbers.some(n => !Number.isInteger(n) || n < 1 || n > 37) ||
          (value.strong !== null && (!Number.isInteger(value.strong) || value.strong < 1 || value.strong > 7))) throw Error('Invalid saved form');
      size.value = String(value.size); selected.clear(); value.numbers.forEach(n => selected.add(n)); strong = value.strong; render();
    },
    resetSaved() { selected.clear(); strong = null; render(); }
  };
  render();
})();`);
await writeFile(path.join(out, 'systematic.js'), systematic);
let generator = await read('draw-generator.js');
generator = replaceOnce(generator, '  returnButton.addEventListener', `  window.lotoNavigation = {showSaved(kind) {
    selectTab(document.getElementById(kind === 'systematic' ? 'systematic-tab' : 'past-tab'), false);
  }};
  returnButton.addEventListener`);
await writeFile(path.join(out, 'draw-generator.js'), generator);
let account = await read('account.js');
account = replaceOnce(account, 'let busy = false;', `const identityResponse = await fetch('/__access/identity', {cache: 'no-store'});
if (!identityResponse.ok) throw Error('Access identity unavailable');
const accessIdentity = await identityResponse.json();
let busy = false;`);
account = replaceOnce(account, 'function showUser(user) {', `function showUser(user) {
  if (user && user.email?.toLowerCase() !== accessIdentity.email) {
    user = null;
    message.textContent = 'יש להתחבר לאותו חשבון Google שאושר לכניסה לאתר.';
  }`);
account = account.replaceAll('אינך מחובר. אפשר להמשיך להשתמש בטפסים.', 'הגישה לאתר אושרה. התחבר ל־Google כדי לשמור ולטעון טפסים.');
account = account.replaceAll('אפשר להמשיך להשתמש בטפסים ללא התחברות.', 'הטפסים השמורים אינם זמינים.');
account = account.replaceAll('הטפסים זמינים ללא התחברות;', 'הטפסים השמורים אינם זמינים;');
await writeFile(path.join(out, 'account.js'), account);
console.log('Built private assets only; no deployment performed.');
