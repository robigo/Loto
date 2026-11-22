# Loto

Static Lotto ticket demo and historical frequency analysis.

## Updating published results

`python scripts/update_results.py` downloads the published Pais Lotto CSV over HTTPS.
For a CSV downloaded from the Pais archive, use:

```sh
python scripts/update_results.py --csv /path/to/pais-results.csv
```

No API key, AI model or payment service is used. The importer validates dates, number ranges,
unique numbers, IDs and continuity, refuses conflicting results, and adds new draws to
both `data/history.json` and the analysis dataset `data/draws.json`.
History is retained on download or validation errors. A filesystem failure during replacement
requires discarding the temporary checkout: only publish both datasets together after success.

The **Fetch and publish Lotto results** workflow runs independently in GitHub
cloud twice daily at 22:53 and 04:53 UTC. It uses a dedicated authenticated
Cloudflare relay to retrieve the exact official archive download URL and
validates both result datasets before committing any new draws. No local PC is
required. Manual dispatch defaults to check-only; use `publish=true` on `main`
for immediate publication. Push-triggered checks are read-only.

The **Deploy public Lotto site** workflow deploys GitHub Pages after successful
main synchronization, including commits made with `GITHUB_TOKEN`, and after
normal main pushes. See [cloud synchronization and rollback](docs/CLOUD_RESULTS_SYNC.md)
for source validation, authentication, schedules, deployment and operation.

The website shows the latest draw in its stored history, rather than a hard-coded date.
Historical frequencies and unseen combinations do not predict future lottery results.

## Tests

```sh
python -m unittest discover -s tests -v
```
