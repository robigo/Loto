"""Import published Pais Lotto CSV, preserving history on failed validation."""
import argparse
import csv
import datetime as dt
import io
import json
import os
from pathlib import Path
import tempfile
import urllib.request

SOURCE = 'https://www.pais.co.il/lotto/lotto_resultsDownload.aspx'
ROOT = Path(__file__).resolve().parents[1]


def parse_csv(raw):
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw.decode('cp1255')
    if not text.strip():
        raise ValueError('Source contains no CSV data')
    if '<html' in text.lower() or '<!doctype' in text.lower():
        raise ValueError('Source returned HTML instead of results CSV')
    delimiter = ';' if text.splitlines()[0].count(';') > text.splitlines()[0].count(',') else ','
    rows = csv.reader(io.StringIO(text), delimiter=delimiter)
    header = next(rows, [])
    if len(header) < 9 or 'הגרלה' not in header[0] or 'תאריך' not in header[1]:
        raise ValueError('Unrecognized Pais CSV header')
    draws = []
    for row in rows:
        if not row or not any(cell.strip() for cell in row):
            continue
        if len(row) < 9:
            raise ValueError('Incomplete draw row')
        identifier = row[0].strip()
        if not identifier.isascii() or not identifier.isdigit():
            raise ValueError('Invalid draw ID')
        date = dt.datetime.strptime(row[1].strip(), '%d/%m/%Y').date()
        if date > dt.datetime.now(dt.timezone.utc).date():
            raise ValueError('Future draw date')
        numbers = sorted(int(cell.strip()) for cell in row[2:8])
        strong = int(row[8].strip())
        # Older rule sets remain supported in the downloaded historical archive.
        modern = date >= dt.date(2010, 1, 1)
        if len(set(numbers)) != 6 or not all(1 <= n <= (37 if modern else 49) for n in numbers):
            raise ValueError('Invalid regular numbers')
        if not 0 <= strong <= 10 or (modern and not 1 <= strong <= 7):
            raise ValueError('Invalid strong number')
        draws.append(dict(id=identifier, date=date.isoformat(), numbers=numbers, strong=strong))
    if not draws:
        raise ValueError('Source contains no draws')
    return draws


def merge_results(history, incoming):
    if not history:
        raise ValueError('Existing history missing; refusing an implicit reset')
    by_id = {draw['id']: draw for draw in history}
    by_date = {draw['date']: draw for draw in history}
    if len(by_id) != len(history) or len(by_date) != len(history):
        raise ValueError('Existing history contains duplicate IDs or dates')
    latest = max(history, key=lambda draw: draw['date'])
    additions = []
    for draw in incoming:
        existing = by_id.get(draw['id']) or by_date.get(draw['date'])
        if existing:
            normalized = {**existing, 'numbers': sorted(existing['numbers'])}
            if normalized != draw:
                raise ValueError('Source conflicts with an existing draw; manual review required')
        elif draw['date'] > latest['date']:
            if int(draw['id']) <= int(latest['id']):
                raise ValueError('New date has an older draw ID')
            by_id[draw['id']] = draw
            by_date[draw['date']] = draw
            additions.append(draw)
        # Do not rewrite historical rule variants or backfill old gaps implicitly.
    additions.sort(key=lambda draw: draw['date'])
    expected = int(latest['id']) + 1
    for draw in additions:
        if int(draw['id']) != expected:
            raise ValueError('Missing intermediate draw; refusing a partial update')
        expected += 1
    if not additions:
        return history, None
    merged = sorted(by_id.values(), key=lambda draw: draw['date'], reverse=True)
    frequency = [dict(date=draw['date'], numbers=draw['numbers']) for draw in reversed(merged)
                 if draw['date'] >= '2010-01-01']
    return merged, frequency


def fetch_csv():
    request = urllib.request.Request(SOURCE, headers={'User-Agent': 'LotoResultsUpdater/1.0', 'Accept': 'text/csv,*/*;q=0.1'})
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.url.split('?', 1)[0] != SOURCE:
            raise ValueError('Unexpected source redirect')
        raw = response.read(5_000_001)
    if len(raw) > 5_000_000:
        raise ValueError('Source response too large')
    return raw


def update(raw, root=ROOT):
    history_path = root / 'data/history.json'
    draws_path = root / 'data/draws.json'
    history = json.loads(history_path.read_text(encoding='utf-8'))
    existing_frequency = json.loads(draws_path.read_text(encoding='utf-8'))
    merged, frequency = merge_results(history, parse_csv(raw))
    latest = max(merged, key=lambda draw: draw['date'])
    result = dict(updated=frequency is not None, latestId=latest['id'], latestDate=latest['date'], source=SOURCE)
    if frequency is None:
        return result
    projected_existing = [dict(date=draw['date'], numbers=draw['numbers']) for draw in sorted(history, key=lambda draw: draw['date'])
                          if draw['date'] >= '2010-01-01']
    if projected_existing != existing_frequency:
        raise ValueError('Existing datasets disagree; manual review required')
    # Validate everything first. GitHub commits both files together only after success.
    staged = []
    try:
        for path, data in [(history_path, merged), (draws_path, frequency)]:
            with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False) as handle:
                staged.append((Path(handle.name), path))
                json.dump(data, handle, ensure_ascii=False, separators=(',', ':'))
                handle.write('\n')
        for temporary, target in staged:
            os.replace(temporary, target)
    finally:
        for temporary, _ in staged:
            temporary.unlink(missing_ok=True)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv', type=Path, help='Import a downloaded Pais CSV instead of making a network request')
    args = parser.parse_args()
    try:
        print(json.dumps(update(args.csv.read_bytes() if args.csv else fetch_csv()), ensure_ascii=False))
    except Exception as error:
        raise SystemExit('Update failed; do not publish data changes: ' + str(error)) from error
