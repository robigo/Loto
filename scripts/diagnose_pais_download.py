"""Read-only network diagnostics for the single official Pais CSV endpoint."""
import hashlib
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.parse import urlsplit

from update_results import ROOT, SOURCE, update

host = urlsplit(SOURCE).hostname
started = time.monotonic()
try:
    addresses = sorted({item[4][0] for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)})
    print(json.dumps({"stage": "dns", "seconds": round(time.monotonic() - started, 3), "addresses": addresses}), flush=True)
except OSError as error:
    print(json.dumps({"stage": "dns", "error": str(error)}), flush=True)

with tempfile.TemporaryDirectory() as temp:
    for label, flags in [("default", []), ("ipv4", ["--ipv4"])]:
        target = Path(temp) / (label + ".csv")
        command = ["curl", *flags, "--silent", "--show-error", "--proto", "=https",
                   "--connect-timeout", "10", "--max-time", "25", "--max-filesize", "5000000",
                   "--user-agent", "LotoResultsUpdater/1.0", "--header", "Accept: text/csv,*/*;q=0.1",
                   "--output", str(target), "--write-out",
                   "status=%{http_code} ip=%{remote_ip} dns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} first_byte=%{time_starttransfer} total=%{time_total}",
                   SOURCE]
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=30)
            print(json.dumps({"transport": label, "exit": result.returncode,
                              "timings": result.stdout, "error": result.stderr}), flush=True)
            if result.returncode == 0:
                raw = target.read_bytes()
                try:
                    validation = update(raw, ROOT, dry_run=True)
                    print(json.dumps({"transport": label, "bytes": len(raw),
                                      "sha256": hashlib.sha256(raw).hexdigest(), "validation": validation}), flush=True)
                except (ValueError, UnicodeError) as error:
                    print(json.dumps({"transport": label, "validation_error": str(error)}), flush=True)
        except (OSError, subprocess.TimeoutExpired) as error:
            print(json.dumps({"transport": label, "error": str(error)}), flush=True)
