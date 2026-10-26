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

The manual **Fetch published Lotto results** GitHub Actions workflow tests and fetches results
in a temporary checkout. Its only permission is `contents: read`; it cannot commit, deploy or
change repository settings. It prints new validated draws and retains both files as an artifact
for review. The assistant can read the run logs, inspect new results, and publish the two data
files together through the authorized GitHub connection. Re-running the fetch job checks the
current `main` branch. No recurring schedule is configured.

If Pais blocks the GitHub runner or changes the CSV format, the run fails without publishing.
An operator may download the CSV from https://www.pais.co.il/lotto/archive.aspx and import it.
The current execution environment blocks direct Pais requests (HTTP 403); a live download
from GitHub Actions has not yet been verified.

The website shows the latest draw in its stored history, rather than a hard-coded date.
Historical frequencies and unseen combinations do not predict future lottery results.

## Tests

```sh
python -m unittest discover -s tests -v
```
