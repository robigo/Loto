# Loto: approval-only access — prepared, not deployed

Review date: 2026-11-08. Baseline: main `3573f7cce1af6ec5f6087683179a9678f8d6baba`.
HOLD: no merge, deployment, DNS, Access policy, Supabase SQL, repository visibility,
Pages settings or OAuth changes without explicit owner approval. No hosting-service
configuration has been inspected or changed. Connected GitHub supports repository
preparation; this session has no Cloudflare/Supabase administration connection.

## Findings

- `account.js` explicitly supports guests, including when configuration fails.
- `index.html` does not load account.js or provide account controls. Current regular
  and systematic form APIs also lack the snapshot/restore methods used by account.js.
  A message change cannot secure this site or restore account integration.
- `001_saved_forms.sql` enforces ownership, not membership in an approved group.
  An unapproved authenticated user can still access their own rows directly via REST.
- The repository is public and has Pages enabled (repository metadata); actual Pages
  publishing source, custom domains, caches, CF account, IdP and Supabase deployed
  policies remain UNVERIFIED. Do not infer deployed RLS from SQL in GitHub.
- Results workflow fetches on Sunday/Wednesday 00:15 UTC and commits both JSON views
  to main. It neither needs a browser login nor fetches from the Loto website.
- Draft PR #1 separately prepares download retries. This proposal does not merge it,
  modify its files, or prove that Pais retrieval has recovered.

## Options and recommendation

| Option | Real enforcement | Origin/bypass work | Account impact |
| --- | --- | --- | --- |
| Workers assets + Access + signed-token verification (recommended) | Before every HTML, JS and data response | No public origin; disable workers.dev/previews, exact host; permanently disable Pages | Retain Supabase Google project and UUIDs |
| Pages + Access | Possible, but protection of production/custom host and every preview must be verified separately | Audit pages.dev, aliases and deployment URLs plus old GitHub Pages | Same Supabase redirect work |
| Own server/BFF + Google OAuth + approved-user DB | Possible with secure server sessions on every route | Operate server, sessions, CSRF protection, key rotation and origin firewall | Could consolidate login later; larger migration |
| Custom-domain proxy in front of GitHub Pages | Insufficient while original origin is public | Original github.io endpoint bypasses proxy | Does not solve access requirement |

Access uses Google as IdP and an explicit list of individual approved emails, never
Everyone, email-domain-wide Allow, or Bypass. Worker independently validates RS256
signature, pinned issuer/JWKS, application audience, time claims and user identity;
then requires the email in server-side APPROVED_EMAILS. Empty configuration denies.
`run_worker_first = true` is required for ALL assets. ASSETS is only accessed after
authorization. Production and preview workers.dev URLs are disabled. No routes or
real addresses are configured in the prepared Wrangler file.

Access login and Supabase Google login are separate sessions. Users may see a second
Google redirect; keeping the same existing Supabase project/provider preserves
auth.users.id and saved forms. Private build requires the Supabase email to match
the verified Access email for UI cloud actions. This is a usability check; the DB
approval/ownership policies enforce REST access independently. An approved UUID can
still call its own Supabase REST endpoint without an Access session, by design.
If every DB request must also prove an Access session, use a BFF and revoke direct
browser database access; that is a larger design, not claimed by this proposal.

## Prepared in this branch

1. `private-access/worker.mjs`: server gate, exact host, signed Access identity, email
   allowlist, GET/HEAD only, no-store responses and `/__access/identity`.
   JWKS cache is at most 60 seconds; new unknown signing key fails closed until refresh.
   No cookie-only fallback: missing Access assertion denies. No token/header logging.
2. `wrangler.toml`: assets through Worker first; workers.dev and preview URLs off;
   blank issuer/audience/hostname/emails. No deployment workflow is enabled.
3. `build.mjs` and `form-adapter.js`: allowlist-only asset build, account controls,
   version-1 snapshots/restores for both kinds, strong numbers, validated atomic
   restore, protection against late history fetch overwriting a restored regular form.
   Changes are generated into ignored dist; public app source is unchanged.
   Existing local draft and auth storage keys and payload version are retained.
4. `supabase/002_approved_users.sql`: pending restrictive policy ANDed with existing
   ownership; UUID membership table cannot be written by browser roles. No saved-row
   deletes or UUID migration. Operator must populate verified UUIDs in the transaction
   before committing; as provided, empty membership denies ALL cloud form access.
5. Automated gate/build/form tests and a browser integration test with mocked Auth/DB.
   SQL file checks are structural, NOT a live Postgres authorization test.

## Deployment and migration — requires hosting access and approval

Do not connect the preparation branch to an automatic Cloudflare deployment integration.

### A. Protected pilot (first approval)

Collect target hostname/domain or decide on an Access-protected workers.dev variant,
Cloudflare account/team, application AUD, owner and test-user email list; verify plan
entitlements and any costs before enabling services. Current configuration assumes
an exact custom hostname; workers.dev alternative requires a reviewed config change.
Obtain dashboard access to Cloudflare, Google OAuth and the existing Loto Supabase
project through the supported connection/dashboard, never by posting secrets in chat.

After approval: create Access app and Google IdP FIRST, with policy covering the
entire hostname and every path, owner-only Allow initially, short session (e.g. 1h).
No Bypass or service-token access to browser app. Register Access Google callback
shown in its dashboard; keep the existing Google-to-Supabase callback intact.
Set Worker issuer/AUD/hostname and allowlist; deploy only behind that protected host.
Do not create an unprotected temporary URL. Test denied cases before user invites.

Back up existing saved forms and auth UUID mapping securely. Verify deployed schema
matches 001 and the owner has the expected UUID. Add exact new HTTPS callback to
Supabase redirect URLs; set canonical Site URL when promoting. Do not create a new
Supabase project or change Google identity/provider mappings. First login on a new
origin requires reauthentication; localStorage/sessionStorage do not migrate between
origins. Unsaved drafts must be saved under the existing account or recorded manually
before cutover. Confirm all saved version-1 payload shapes against real rows.

Applying 002 is a SEPARATE approved permission change: dry-run in an isolated copy
first, add verified existing owner/test UUIDs in the SAME transaction, then commit.
Test anonymous, approved A/B and unapproved C direct REST select/insert/upsert/update/
delete; A cannot access B even with forged UUID; C cannot access even its own rows;
no client can approve itself. Revoking membership must deny a still-valid token.
Empty SELECT/DELETE results may be RLS filtering, not an HTTP error: assert DB state.

### B. Production cutover (separate explicit approval after pilot)

1. Verify real Google login, ownership/membership, desktop/mobile, both form kinds,
   strong numbers, account switch, logout and expiry on protected host.
2. Save or export unsaved drafts and confirm backups. Freeze UI edits during cutover.
3. Permanently disable GitHub Pages publishing source/deployment path; unpublish
   current deployment as needed. Unpublish alone is temporary: later source commits
   or deploy workflows can republish it. Keep results-fetch Actions enabled.
4. Audit and remove any other Pages source branch, Pages workflow, old custom domain,
   Cloudflare Pages deployment, alternate Worker route and stale service-worker cache.
   DNS/CNAME or an HTML redirect alone is not enforcement. Confirm github.io/Loto/,
   /index.html, /LOTO1.html, /account.js, /data/history.json and /data/draws.json no
   longer return app content, including query strings and old deployment aliases.
5. Set canonical new URL and remove old OAuth redirect allowlist entries after success.
   Remove stale bookmarks; old link stops serving the application. A brief outage is
   preferable to claiming privacy while a public origin remains accessible.
6. Test after a new results commit that Pages remains off and protected data refreshes.
   Privacy is NOT accepted until this step passes. Keep source visibility decision
   separate: public GitHub/raw/history still lets anyone copy and run the static app.
   For source privacy, separately approve making repo private and check plan/Actions
   implications. Already downloaded copies and historical public caches cannot be recalled.

## Results update continuity

Keep `.github/workflows/fetch-lotto-results.yml`, its schedule, credentials/permissions,
validation and JSON commits unchanged. Serving files from Workers does not require
opening any Access path to the fetch job or to Pais. New commits alone do NOT update
the uploaded Worker asset bundle: a separate protected deployment is required.

`private-access/deploy.yml.example` is a disabled, fail-closed workflow template;
it is outside .github/workflows and its deployment step exits without deploying.
Pin a reviewed Wrangler version, configure exact protected routes, run the browser
test in a permitted runner and review environment approval before activation.
After explicit approval to automate deployment, activate a workflow triggered by
`workflow_run` completion of **Fetch and publish Lotto results** on main and by
manual dispatch, with success/default-repository checks. A plain `push` workflow is
not enough: commits pushed with GITHUB_TOKEN generally do not trigger other workflows.
Checkout the resulting main commit (the updater's head_sha may precede its data commit),
validate both JSON files, run private tests, build, then deploy with a minimally scoped
Cloudflare token kept in GitHub environment secrets. Protect deployment with environment
approval if supported by the plan; never auto-deploy PRs/forks. Review the final workflow
before enabling it; no active deployment workflow or tokens are added by this PR.
Until enabled, use an owner-approved manual build/deployment after data changes.
Keep the last validated bundle if fetching or deployment fails; show existing draw date.
The unresolved source-download outage from PR #1 remains a separate blocker to live freshness.

## Acceptance matrix

| Area | Local result | Must verify live before cutover |
| --- | --- | --- |
| JWT/guest/forged headers/issuer/audience/expiry/allowlist | Passed | Actual Access IdP and policy |
| Direct HTML/JS/JSON and alternative host denial | Passed in Worker tests | Custom host, workers.dev/previews, GitHub Pages aliases |
| Private asset manifest/no source or SQL assets | Passed | Wrangler asset routing and cache behavior |
| Regular/systematic version-1 forms and late history | Passed DOM adapter; mocked account races passed | Existing real rows, two Google users/devices |
| Database approval plus ownership | SQL structural checks only | Isolated Postgres + live REST role matrix |
| Results preservation | 7 existing Python tests passed; exact JSON copies | Fetch source + protected publishing + Pages stays off |
| Browser | Test prepared, BLOCKED locally | Chromium startup failed: socket() Operation not permitted; run in permitted runner |

Existing main tests `check-account.cjs` and `check-latest-draw.cjs` fail before new code
because main's UI lacks snapshot/setPrivateFirst. They remain unmodified and are not
represented as passing. Existing `check-private-account.cjs` and `check-diversity.cjs`
passed. No live login, DB query, fetch/publish job, deployment or permission change ran.

Reproduce local preparation checks:

```sh
node private-access/build.mjs
node --test tests/private-access/*.test.mjs
python -m unittest discover -s tests -v
node tests/check-private-account.cjs
node tests/check-diversity.cjs
# In an environment with Playwright + permitted Chromium:
node tests/private-access/browser.cjs
```

## Revocation and rollback

Approve a user in both Access Allow, Worker server allowlist and DB UUID membership.
Revoke all three and revoke Access sessions. Worker list removal blocks subsequent
asset requests even while an Access token is valid; membership removal blocks REST
even with an existing Supabase JWT. Already loaded offline UI cannot be recalled.
Access logout and Supabase logout are separate; buttons are labelled accordingly.

Rollback to the previous protected Worker bundle; keep Pages OFF. Saved rows and UUIDs
remain intact. Back up and review any reverse SQL separately; do not loosen RLS or
reopen the old public site as an automatic rollback. If Access is misconfigured,
fail closed and repair owner access in the dashboard.

## Official references

- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/
- https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/
- https://docs.github.com/en/pages/getting-started-with-github-pages/unpublishing-a-github-pages-site
- https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/database/postgres/row-level-security
