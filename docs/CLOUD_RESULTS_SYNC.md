# Public Lotto results: cloud operation

The public site at https://robigo.github.io/Loto/ updates without the owner's
Windows computer. Its existing **Fetch and publish Lotto results** workflow now
uses the same cloud design as the private site, with a separate Cloudflare
Worker and independent secret. The private site's Worker, secret, schedules and
saved forms are unchanged.

## Schedule and verification

Daily checks run at **22:53 and 04:53 UTC**, including extra Thursday drawings.
In Israel this is **00:53 and 06:53 in winter**, **01:53 and 07:53 in summer**.
GitHub schedules can be delayed. A manual workflow dispatch defaults to
read-only; select `publish=true` on `main` for immediate publication.
Push checks are read-only, including the preparation branch.

The authenticated `loto-public-pais-relay` Worker fetches only
`https://www.pais.co.il/Lotto/lotto_resultsDownload.aspx`, the exact link in the
official Pais archive. The capital L matters: the lowercase path returned a
server-error HTML page to Cloudflare in the 22 November investigation.
No redirects, arbitrary proxy URLs or browser access are enabled. Response
size and time are bounded; missing/incorrect credentials are rejected.

The original validation layer checks the full CSV against existing history,
rejects conflicting or missing draws and invalid numbers/dates, and verifies
that `history.json` and `draws.json` agree. Both datasets are committed together
only for new results. Invalid data never reaches Git publication. No empty
commit, force push, automatic rebase or generated test draw is used.

## GitHub Pages publication

GitHub does not start a branch-based Pages build for a commit pushed with
`GITHUB_TOKEN`. Therefore Pages uses the explicit **Deploy public Lotto site**
workflow, with Pages/OIDC permissions. It runs on a normal main push and after
a successful main result-sync run via `workflow_run`. It always checks out
trusted, current `main`, including any new result commit, and deploys an
artifact of the tracked static tree using `actions/deploy-pages`.

This also retains deployment after the existing local Windows updater pushes
new data. That updater remains a backup. No application HTML, styling, ticket
content, saved form or public URL is changed by this migration.

## Authentication and operations

Cloudflare uses the existing personal account `goshen.r@gmail.com`. Worker
`RELAY_TOKEN` and the **public** repository's `PAIS_RELAY_TOKEN` are independent
from the private site's keys. The random secret was uploaded without logging
and sealed with GitHub's repository public key. No personal GitHub token is
stored in the Worker or repository; publication uses `GITHUB_TOKEN`.

See the two workflow summaries for download validation and Pages deployment.
Failures stop publication and keep existing results; inspect Actions for error
notifications. No subscription, public URL, custom domain or site access mode
is changed. Existing account quotas still apply.

To stop scheduling, disable **Fetch and publish Lotto results**. To roll back
Pages deployment to the previous branch-based setup, set Pages source to
`main` at `/` (`build_type=legacy`); doing so also restores the need for a
non-`GITHUB_TOKEN` push to trigger a branch-based build. Do not roll back result
history to undo a scheduling change. Cloud worker deployment source lives in
`cloud/pais-relay/`.
