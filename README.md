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

The **Fetch and publish Lotto results** GitHub Actions workflow runs automatically at
00:15 UTC every Wednesday and Sunday, after the usual Tuesday and Saturday drawings. It can
also be started manually. It tests the importer, downloads the Pais CSV, validates new draws,
and updates `data/history.json` and `data/draws.json` together. It creates a commit only when
new contiguous, valid draw results are found; otherwise it leaves the repository unchanged.
The workflow has `contents: write` permission and stages only those two data files for its
results commit. A push to `main` then triggers the GitHub Pages publication.

If Pais blocks the GitHub runner or changes the CSV format, the run fails without publishing.
An operator may download the CSV from https://www.pais.co.il/lotto/archive.aspx and import it.
The downloader makes up to three attempts with a 45-second socket timeout per blocking
operation and 2/4-second backoff. Only timeouts, connection/DNS errors and HTTP
408/429/500/502/503/504 are retried. Numeric Retry-After values up to 30 seconds are
honored; longer or date-form values require a later run. HTTP 403/404, TLS errors,
redirects, oversized/incomplete responses and invalid CSV fail immediately. The existing
five-minute Actions job timeout remains the overall execution limit.

To validate a download and its proposed merge without writing either dataset:

```sh
python scripts/update_results.py --check
python scripts/update_results.py --csv /path/to/pais-results.csv --check
```

`--check` reports `updated: false` and `wouldUpdate`; it still validates agreement
between both existing datasets. It does not publish or commit anything.
See [the download investigation](docs/RESULTS_DOWNLOAD_REVIEW.md) for current limitations
and the approval steps before enabling publication of this change.

The website shows the latest draw in its stored history, rather than a hard-coded date.
Historical frequencies and unseen combinations do not predict future lottery results.

## Tests

```sh
python -m unittest discover -s tests -v
```
