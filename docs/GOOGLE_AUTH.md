# Google login and saved forms

The static app uses Supabase Auth (Google OAuth with PKCE) and Postgres for one saved
regular form and one saved systematic form per user. Saving and loading are explicit;
there are no automatic cloud writes. Loading validates the entire payload before
changing the form. The fixed first row and its strong number are preserved.

## Activation (not yet configured)

1. Create a **dedicated Loto project** at https://supabase.com/dashboard.
   Do not reuse another app's production database or credentials.
2. Run `supabase/001_saved_forms.sql` in that project's SQL Editor. It creates only
   the Loto table, RLS ownership policy, and timestamp trigger. It runs as one transaction
   and intentionally fails on existing objects instead of modifying another schema.
3. In Supabase Authentication > URL Configuration set the Site URL and an exact
   redirect allow-list entry to `https://robigo.github.io/Loto/`. Avoid wildcard redirects.
4. At https://console.cloud.google.com/auth/overview create/configure a Google Auth project.
   Set the audience to Testing initially, and add the owner's Google email as a test user.
   Request only the identity scopes `openid`, `email`, and `profile`.
5. Create a Web application OAuth client. Use the callback shown by the Supabase
   Google provider, normally `https://PROJECT_REF.supabase.co/auth/v1/callback`, as
   the Authorized redirect URI. Use `https://robigo.github.io` as the JavaScript origin
   if requested. The Google redirect is to Supabase, not directly to GitHub Pages.
6. Enable Google under Supabase Authentication > Sign In / Providers. Paste the
   Google Client ID and Client Secret **there only**. Never commit the secret or paste
   it into chat. Do not request Gmail, Drive, Calendar, or offline Google API access.
7. Put only the Supabase project URL and **publishable key** (or legacy `anon` key)
   in `account-config.js`. Those are public browser settings. Never use a service-role
   key, a secret key, a database password, or the Google Client Secret.
8. Publish and complete the live checks below. Login and cloud saves are not active
   until these steps have been completed. With empty configuration the login button
   stays disabled, no SDK is downloaded, and the existing forms still work.

## Live acceptance checks

- Sign in from desktop and mobile. A denied/cancelled consent must not show success.
- Verify a pre-login selection survives the redirect. Google login saves no form automatically.
- Save a regular form, reload on another device, sign in and explicitly load it.
- Repeat for systematic sizes 8 and 12, including the strong number.
- Confirm loading opens the correct tab without regenerating the saved numbers.
- Sign out: cloud controls disappear and on-screen personal forms are reset.
- Switch Google users: the second user must see no saved forms from the first user.
- Verify direct API requests with no token cannot read/write, and a second user's token
  cannot read, insert, update, or delete the first user's rows, even with forged `user_id`.
- Disconnect the network while saving: no success message; current numbers remain on screen.
- While a cloud load is pending, edit a number or switch accounts: the response must
  not overwrite that edit or populate the other account's screen.

The SDK is pinned to `@supabase/supabase-js@2.118.0` and loaded from esm.sh only when
configured. Auth state lives under the app-specific localStorage key `loto-google-auth-v1`;
pending login drafts use a tab-scoped sessionStorage key and expire after one hour.
Logout clears the local session; other devices remain signed in. No provider tokens are
logged or used to access Google services. RLS, not client-side user labels, enforces ownership.
Cloud storage currently keeps the latest saved form of each type, not historical versions.

## Checks that run without external credentials

```sh
node tests/check-account.cjs
node tests/check-latest-draw.cjs
node tests/check-diversity.cjs
```

These exercise the actual local scripts with DOM/Auth adapters. They do not verify a live
Google consent screen, Supabase configuration, browser behavior, or deployed RLS.

Official references:
- https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/database/postgres/row-level-security
