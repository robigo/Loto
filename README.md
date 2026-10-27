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
Direct Pais requests from the current Codex environment return HTTP 403, so the first scheduled
GitHub Actions fetch still needs to confirm that the runner can retrieve the CSV.

The website shows the latest draw in its stored history, rather than a hard-coded date.
Historical frequencies and unseen combinations do not predict future lottery results.

## Tests

```sh
python -m unittest discover -s tests -v
```
