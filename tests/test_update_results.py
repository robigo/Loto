import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
import socket
import ssl
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location('updater', Path(__file__).resolve().parents[1] / 'scripts/update_results.py')
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)
BASE = dict(id='10', date='2020-01-01', numbers=[1, 2, 3, 4, 5, 6], strong=3)
HEADER = 'הגרלה,תאריך,1,2,3,4,5,6,המספר החזק\n'
VALID = (HEADER + '11,04/01/2020,14,24,25,27,29,33,3\n').encode()


class DownloadTests(unittest.TestCase):
    def response(self, raw=VALID, url=updater.SOURCE, headers=None):
        response = Mock(url=url, headers=headers or {})
        response.read.return_value = raw
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        return response

    def fetch(self, effects):
        opener = Mock()
        opener.open.side_effect = effects
        with patch.object(updater.urllib.request, 'build_opener', return_value=opener), \
                patch.object(updater.time, 'sleep') as sleep:
            result = updater.fetch_csv()
        return result, opener, sleep

    def test_timeout_then_success(self):
        result, opener, sleep = self.fetch([urllib.error.URLError(socket.timeout('timed out')), self.response()])
        self.assertEqual(result, VALID)
        self.assertEqual(opener.open.call_count, 2)
        self.assertEqual(opener.open.call_args.kwargs['timeout'], 45)
        sleep.assert_called_once_with(2)

    def test_read_timeout_discards_partial_response_and_retries(self):
        response = self.response()
        response.read.side_effect = TimeoutError()
        self.assertEqual(self.fetch([response, self.response()])[0], VALID)
        response.__exit__.assert_called_once()

    def test_all_timeouts_stop_after_three_attempts(self):
        opener = Mock()
        opener.open.side_effect = TimeoutError()
        with patch.object(updater.urllib.request, 'build_opener', return_value=opener), \
                patch.object(updater.time, 'sleep') as sleep, self.assertRaisesRegex(RuntimeError, 'no verified fallback'):
            updater.fetch_csv()
        self.assertEqual(opener.open.call_count, 3)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [2, 4])

    def test_transient_http_and_retry_after(self):
        for code in updater.RETRY_STATUS:
            with self.subTest(code=code):
                error = urllib.error.HTTPError(updater.SOURCE, code, 'temporary', {'Retry-After': '10'}, None)
                result, _, sleep = self.fetch([error, self.response()])
                self.assertEqual(result, VALID)
                sleep.assert_called_once_with(10)

    def test_long_or_date_retry_after_requires_later_run(self):
        for value in ['120', 'Wed, 11 Nov 2026 10:00:00 GMT']:
            error = urllib.error.HTTPError(updater.SOURCE, 429, 'limited', {'Retry-After': value}, None)
            with self.subTest(value=value), self.assertRaisesRegex(RuntimeError, 'later run'):
                self.fetch([error])

    def test_permanent_http_and_tls_are_not_retried(self):
        for error in [urllib.error.HTTPError(updater.SOURCE, 403, 'forbidden', {}, None),
                      urllib.error.HTTPError(updater.SOURCE, 404, 'missing', {}, None),
                      urllib.error.URLError(ssl.SSLCertVerificationError('certificate'))]:
            opener = Mock()
            opener.open.side_effect = error
            with self.subTest(error=error), patch.object(updater.urllib.request, 'build_opener', return_value=opener), \
                    patch.object(updater.time, 'sleep') as sleep, self.assertRaises(type(error)):
                updater.fetch_csv()
            self.assertEqual(opener.open.call_count, 1)
            sleep.assert_not_called()

    def test_invalid_payload_and_unexpected_source_fail_closed(self):
        for response in [self.response(b'<html>blocked</html>'), self.response(b''),
                         self.response(b'x' * (updater.MAX_BYTES + 1)),
                         self.response(headers={'Content-Length': str(len(VALID) + 1)}),
                         self.response(url='https://example.com/results.csv')]:
            with self.subTest(response=response), self.assertRaises(ValueError):
                self.fetch([response])

    def test_redirect_is_rejected_before_following(self):
        handler = updater.NoRedirect()
        for target in ['http://www.pais.co.il/lotto/lotto_resultsDownload.aspx',
                       'https://pais.co.il/lotto/lotto_resultsDownload.aspx',
                       'https://example.com/results.csv']:
            with self.subTest(target=target), self.assertRaisesRegex(ValueError, 'redirect'):
                handler.redirect_request(urllib.request.Request(updater.SOURCE), None, 302, '', {}, target)


class UpdateTests(unittest.TestCase):
    def test_noncanonical_ids_rejected(self):
        for identifier in ['011', '0', '００１']:
            with self.subTest(identifier=identifier), self.assertRaises(ValueError):
                updater.parse_csv((HEADER + identifier + ',04/01/2020,1,2,3,4,5,6,3').encode())

    def test_conflicting_duplicate_in_same_download_rejected(self):
        new = dict(BASE, id='11', date='2020-01-04')
        for conflict in [dict(new, strong=4), dict(new, date='2020-01-05'), dict(new, id='12')]:
            with self.subTest(conflict=conflict), self.assertRaises(ValueError):
                updater.merge_results([BASE], [new, conflict])

    def test_check_validates_without_replacing_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'data').mkdir()
            hp, dp = root / 'data/history.json', root / 'data/draws.json'
            hp.write_text(json.dumps([BASE]))
            dp.write_text(json.dumps([dict(date=BASE['date'], numbers=BASE['numbers'])]))
            before = hp.read_bytes(), dp.read_bytes()
            with patch.object(updater.os, 'replace') as replace:
                result = updater.update(VALID, root, dry_run=True)
            self.assertFalse(result['updated'])
            self.assertTrue(result['wouldUpdate'])
            replace.assert_not_called()
            self.assertEqual((hp.read_bytes(), dp.read_bytes()), before)
            dp.write_text('[]')
            with self.assertRaisesRegex(ValueError, 'disagree'):
                updater.update(VALID, root, dry_run=True)

    def test_repository_bytes_preserved_on_download_failure(self):
        paths = [updater.ROOT / 'data/history.json', updater.ROOT / 'data/draws.json']
        before = [path.read_bytes() for path in paths]
        with patch.object(updater.urllib.request, 'build_opener') as build, \
                patch.object(updater.time, 'sleep'), self.assertRaises(RuntimeError):
            build.return_value.open.side_effect = TimeoutError()
            updater.update(updater.fetch_csv())
        self.assertEqual([path.read_bytes() for path in paths], before)

    def test_utf8_and_hebrew_windows_csv(self):
        for encoding in ['utf-8-sig', 'cp1255']:
            parsed = updater.parse_csv((HEADER + '11,04/01/2020,14,24,25,27,29,33,3\n').encode(encoding))
            self.assertEqual(parsed[0]['id'], '11')
            self.assertEqual(parsed[0]['date'], '2020-01-04')

    def test_invalid_sources_are_rejected(self):
        for text in ['<html>blocked</html>', '', HEADER,
                     HEADER + '11,31/02/2020,1,2,3,4,5,6,3',
                     HEADER + '11,04/01/2020,1,1,3,4,5,6,3',
                     HEADER + '11,04/01/2020,1,2,3,4,5,38,3',
                     HEADER + '11,04/01/2020,1,2,3,4,5,6,8',
                     HEADER + '11,04/01/2099,1,2,3,4,5,6,3']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                updater.parse_csv(text.encode())

    def test_merge_adds_once_and_preserves_older_records(self):
        new = dict(BASE, id='11', date='2020-01-04')
        merged, frequency = updater.merge_results([BASE], [new, new, BASE])
        self.assertEqual(merged, [new, BASE])
        self.assertEqual(len(frequency), 2)
        self.assertEqual(updater.merge_results(merged, [new, BASE]), (merged, None))

    def test_conflicting_id_date_or_missing_intermediate_draw_fails(self):
        for incoming in [[dict(BASE, strong=4)], [dict(BASE, id='11')],
                         [dict(BASE, id='12', date='2020-01-04')],
                         [dict(BASE, id='9', date='2020-01-04')]]:
            with self.subTest(incoming=incoming), self.assertRaises(ValueError):
                updater.merge_results([BASE], incoming)

    def test_stale_source_is_noop(self):
        self.assertEqual(updater.merge_results([BASE], [dict(BASE, id='9', date='2019-12-28')]), ([BASE], None))

    def test_failure_leaves_both_files_unchanged_and_success_updates_both(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'data').mkdir()
            hp, dp = root / 'data/history.json', root / 'data/draws.json'
            hp.write_text(json.dumps([BASE]))
            dp.write_text(json.dumps([dict(date=BASE['date'], numbers=BASE['numbers'])]))
            before = hp.read_bytes(), dp.read_bytes()
            with self.assertRaises(ValueError):
                updater.update((HEADER + '10,01/01/2020,1,2,3,4,5,6,4').encode(), root)
            self.assertEqual((hp.read_bytes(), dp.read_bytes()), before)
            result = updater.update((HEADER + '11,04/01/2020,14,24,25,27,29,33,3').encode(), root)
            self.assertTrue(result['updated'])
            self.assertEqual(json.loads(hp.read_text())[0]['id'], '11')
            self.assertEqual(json.loads(dp.read_text())[-1]['numbers'], [14, 24, 25, 27, 29, 33])

    def test_current_repository_data_matches_both_views_without_rewriting(self):
        history = json.loads((updater.ROOT / 'data/history.json').read_text())
        projected = [dict(date=d['date'], numbers=d['numbers']) for d in sorted(history, key=lambda d:d['date']) if d['date'] >= '2010-01-01']
        self.assertEqual(projected, json.loads((updater.ROOT / 'data/draws.json').read_text()))


if __name__ == '__main__':
    unittest.main()
