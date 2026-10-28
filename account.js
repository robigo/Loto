import {accountConfig} from './account-config.js?v=20261028';
import {createAccountStore} from './account-core.js?v=20261028';

const byId = id => document.getElementById(id);
const status = byId('account-status');
const message = byId('account-message');
const login = byId('account-login');
const logout = byId('account-logout');
const save = byId('account-save');
const load = byId('account-load');
const kind = byId('account-kind');
const storage = byId('account-storage');
let busy = false;
let currentUser = null;
const form = value => value === 'regular' ? window.lotoForm : window.lotoSystematic;
const draftKey = 'loto-google-login-draft-v1';
function buttons() {
  login.disabled = busy;
  logout.disabled = busy;
  save.disabled = load.disabled = kind.disabled = busy || !currentUser;
}
function showUser(user) {
  const changed = currentUser && currentUser.id !== user?.id;
  currentUser = user;
  if (changed) {
    window.lotoForm.resetSaved();
    window.lotoSystematic.resetSaved();
    message.textContent = '';
  }
  login.hidden = Boolean(user);
  logout.hidden = !user;
  storage.hidden = !user;
  status.textContent = user ? `מחובר: ${user.email || 'חשבון Google'}` : 'אינך מחובר. אפשר להמשיך להשתמש בטפסים.';
  buttons();
}
async function action(task) {
  if (busy) return;
  busy = true; buttons(); message.textContent = '';
  try { await task(); }
  catch (error) {
    message.textContent = error.message === 'SESSION_CHANGED'
      ? 'החשבון השתנה או שהחיבור פג. יש להתחבר מחדש ולנסות שוב.'
      : 'הפעולה לא הושלמה. בדוק את החיבור ונסה שוב.';
  } finally { busy = false; buttons(); }
}

async function setup() {
  const {supabaseUrl, publishableKey} = accountConfig;
  if (accountConfig.enabled !== true || !supabaseUrl || !publishableKey) {
    status.textContent = 'התחברות Google עדיין אינה פעילה. אפשר להמשיך להשתמש בטפסים ללא התחברות.';
    return;
  }
  // Reject private credentials accidentally pasted into the public configuration.
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl) ||
    publishableKey.startsWith('sb_secret_')) throw new Error('Invalid public configuration');
  if (!publishableKey.startsWith('sb_publishable_')) {
    const claims = JSON.parse(atob(publishableKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (claims.role !== 'anon') throw new Error('Use only a publishable/anon key');
  }
  const {createClient} = await import('https://esm.sh/@supabase/supabase-js@2.118.0');
  const client = createClient(supabaseUrl, publishableKey, {auth: {
    storageKey: 'loto-google-auth-v1', flowType: 'pkce',
    persistSession: true, autoRefreshToken: true, detectSessionInUrl: true
  }});
  const account = createAccountStore(client, showUser);
  await account.init();
  // Remove OAuth query parameters from browser history; never show or log tokens/errors.
  const callback = new URL(window.location.href);
  const oauthError = callback.searchParams.has('error') || callback.hash.includes('error=');
  for (const key of ['code', 'error', 'error_code', 'error_description']) callback.searchParams.delete(key);
  if (callback.hash.includes('access_token=') || callback.hash.includes('error=')) callback.hash = '';
  window.history.replaceState(null, '', callback.pathname + callback.search + callback.hash);
  try {
    const raw = sessionStorage.getItem(draftKey);
    sessionStorage.removeItem(draftKey);
    if (raw) {
      const draft = JSON.parse(raw);
      // A draft is local to this tab and expires after an hour.
      if (Date.now() - draft.at >= 0 && Date.now() - draft.at < 3600000) {
        form('regular').restore(draft.regular);
        form('systematic').restore(draft.systematic);
      }
    }
  } catch { message.textContent = 'לא ניתן לשחזר את הבחירה מלפני ההתחברות. אפשר למלא את הטופס מחדש.'; }
  if (oauthError) message.textContent = 'ההתחברות לא הושלמה. אפשר לנסות שוב.';
  login.addEventListener('click', () => action(async () => {
    // Preserve the on-screen selection across Google's redirect, without cloud writes.
    sessionStorage.setItem(draftKey, JSON.stringify({at: Date.now(),
      regular: form('regular').snapshot(), systematic: form('systematic').snapshot()}));
    await account.signIn(window.location.origin + window.location.pathname);
  }));
  logout.addEventListener('click', () => action(async () => {
    sessionStorage.removeItem(draftKey);
    await account.signOut();
    message.textContent = 'התנתקת. הטפסים השמורים נשארים בחשבון שלך.';
  }));
  save.addEventListener('click', () => action(async () => {
    const selectedKind = kind.value;
    await account.save(selectedKind, form(selectedKind).snapshot());
    message.textContent = 'הטופס נשמר בחשבון. ניתן לטעון אותו במכשיר אחר לאחר התחברות.';
  }));
  load.addEventListener('click', () => action(async () => {
    const selectedKind = kind.value;
    const before = JSON.stringify(form(selectedKind).snapshot());
    const record = await account.load(selectedKind);
    if (!record) { message.textContent = 'עדיין אין טופס שמור מהסוג שבחרת.'; return; }
    if (JSON.stringify(form(selectedKind).snapshot()) !== before) {
      message.textContent = 'הבחירה השתנתה בזמן הטעינה. נסה לטעון שוב אם ברצונך להחליף אותה.';
      return;
    }
    form(selectedKind).restore(record.payload);
    window.lotoNavigation?.showSaved(selectedKind);
    message.textContent = 'הטופס השמור נטען.';
  }));
}
setup().catch(() => {
  login.disabled = true; storage.hidden = true;
  status.textContent = 'ההתחברות אינה זמינה כרגע. הטפסים זמינים ללא התחברות; אפשר לרענן ולנסות שוב.';
});
