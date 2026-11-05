# Results download review — 2026-11-05

Status: proposed resilience fix; live automatic retrieval remains unverified.
Base: `3573f7cce1af6ec5f6087683179a9678f8d6baba`. No draw data or workflow changes.

## Evidence and diagnosis

- [November 1 run](https://github.com/robigo/Loto/actions/runs/41278787746),
  job 124766254951: seven tests passed, download failed after about 31 seconds
  with `<urlopen error timed out>`, publication skipped.
- [November 4 run](https://github.com/robigo/Loto/actions/runs/41783591914),
  job 126420518753: same seven passing tests, download failed after about
  30 seconds with the same error, publication skipped.
- Both logs identify hosted Azure runners in westus. This is evidence of a
  repeatable access problem from those runners, not proof of geographic blocking,
  a Pais outage, a DNS fault or a particular firewall rule.
- The original importer made one HTTPS request with timeout=30 and no retries.
- Both stored datasets agree. Latest stored result is 3981, 2026-11-03,
  numbers 8,12,21,23,28,35, strong 6. This review does not independently verify
  that result against a newly downloaded Pais file.

## Source options investigated

| Option | Evidence / limitation | Decision |
| --- | --- | --- |
| Existing `https://www.pais.co.il/lotto/lotto_resultsDownload.aspx` | Current code uses it; current web retrieval did not return a downloadable payload. Both Actions runs timed out. | Retain endpoint; add bounded retries, but do not claim restored access. |
| [Pais archive](https://www.pais.co.il/lotto/archive.aspx) | Search index shows a CSV download control. Live archive retrieval timed out. Cached search content cannot validate current CSV bytes or freshness. | Practical manual download route from an accessible browser/network. |
| Same Pais archive and download paths without `www` | Search index confirms the archive alias; live archive retrieval timed out and download retrieval returned no payload. No independent infrastructure or working CSV demonstrated. | Do not enable as fallback or permit its redirects implicitly. |
| Alternate public API/RSS or third-party mirror | No independently verified Pais-owned CSV/API fallback was established by the search. Search snippets or mirrored history cannot authenticate new results. | No automatic fallback enabled. |

An inaccessible response through a research tool is not a direct socket diagnosis.
The execution environment also disallows shell cloning from GitHub; repository files
and Actions logs were obtained through the connected GitHub tools. No live run of the
modified downloader on GitHub was started, since the existing workflow can publish data.

## Proposed change and regression coverage

- Three attempts, 45-second socket timeout per blocking operation, exponential
  2/4-second backoff; existing five-minute workflow timeout bounds the whole job.
  This is not a strict 45-second wall-clock limit for a whole response.
- Retry transient HTTP and connection failures only. Respect bounded numeric
  Retry-After; fail with a later-run instruction for longer/date-form values.
- Keep TLS verification and the exact source URL. Reject redirects before following
  them, HTML, malformed/empty CSV, oversized and Content-Length-mismatched responses.
- Reject noncanonical draw IDs such as `03981`, which could otherwise alias an ID.
  Preserve existing duplicate/conflict/continuity and historical-preservation rules.
- `--check` validates the proposed merge and both existing views without writing.
- Network tests use mocked responses; they demonstrate behavior, not Pais availability.
  Regression tests cover timeout exhaustion/recovery, read failure, retryable HTTP,
  Retry-After, permanent HTTP/TLS failures, redirects, invalid payloads, duplicate
  conflicts, idempotency, dry-run preservation and existing-dataset consistency.

## Practical fallback and approval boundary

1. From a browser/network where Pais is reachable, download the CSV using the Lotto
   archive's download control. Preserve the file and record the download time and URL.
2. In an isolated checkout, run `python scripts/update_results.py --csv PATH --check`.
   The supplied file is treated as operator-provided input; its origin cannot be
   cryptographically authenticated by CSV validation alone. Compare any proposed new
   draw with Pais before approving its import.
3. Review results and obtain approval before an import that writes or publishes data.
4. For unattended access if hosted GitHub runners remain unreachable, evaluate an
   approved dedicated runner on a network where the official download succeeds.
   Validate it in read-only `--check` mode first; this requires separate setup and
   is not implemented or activated by this patch.

Do not merge this proposal before explicit approval. The existing workflow has a
push-to-main trigger for the modified script/tests; merging could immediately run
the publishing job. A read-only runner verification should be arranged before an
approval to merge/activate publication. No scheduled task, workflow dispatch,
publication, main-branch update or draw-data edit was performed in this review.
