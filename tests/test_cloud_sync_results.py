import importlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
cloud = importlib.import_module('cloud_sync_results')

BASE = dict(id='10', date='2020-01-01', numbers=[1, 2, 3, 4, 5, 6], strong=3)
CSV = ('הגרלה,תאריך,1,2,3,4,5,6,המספר החזק\n'
       '11,04/01/2020,14,24,25,27,29,33,3\n'
       '10,01/01/2020,1,2,3,4,5,6,3\n').encode()


class CloudSync(unittest.TestCase):
    def test_missing_secret_fails_before_network(self):
        opener = Mock()
        with self.assertRaises(ValueError):
            cloud.download('', opener)
        opener.open.assert_not_called()

    def response(self, source=cloud.OFFICIAL_SOURCE, length=None, url=cloud.RELAY_URL):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.url = url
        response.headers = {'X-Pais-Source': source, 'Content-Length': str(length or len(CSV))}
        response.read.return_value = CSV
        return Mock(open=Mock(return_value=response))

    def test_download_checks_source_and_preserves_original_bytes(self):
        opener = self.response()
        self.assertEqual(cloud.download('x' * 48, opener), CSV)
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, cloud.RELAY_URL)
        self.assertEqual(request.get_header('Authorization'), 'Bearer ' + 'x' * 48)

    def test_unexpected_source_or_relay_url_is_rejected(self):
        for opener in [self.response(source='https://other.test'), self.response(url='https://other.test')]:
            with self.assertRaises(ValueError):
                cloud.download('x' * 48, opener)

    def test_truncated_response_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            cloud.download('x' * 48, self.response(length=len(CSV) + 10))

    def test_dryrun_then_publish_preserves_old_rows_and_noop(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'data').mkdir()
            history = root / 'data/history.json'
            frequency = root / 'data/draws.json'
            history.write_text(json.dumps([BASE]))
            frequency.write_text(json.dumps([{'date': BASE['date'], 'numbers': BASE['numbers']}]))
            before = [p.read_bytes() for p in (history, frequency)]
            with patch.object(cloud, 'download', return_value=CSV):
                check = cloud.synchronize('unused', root, check=True)
                self.assertTrue(check['wouldUpdate'])
                self.assertEqual([p.read_bytes() for p in (history, frequency)], before)
                result = cloud.synchronize('unused', root)
                self.assertTrue(result['updated'])
                self.assertEqual(json.loads(history.read_text())[1], BASE)
                self.assertEqual(json.loads(frequency.read_text())[-1]['date'], '2020-01-04')
                self.assertFalse(cloud.synchronize('unused', root)['updated'])

    def test_invalid_download_never_changes_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'data').mkdir()
            for name in ['history.json', 'draws.json']:
                (root / 'data' / name).write_text('[]')
            with patch.object(cloud, 'download', return_value=b'<html>error</html>'):
                with self.assertRaises(ValueError):
                    cloud.synchronize('unused', root)
            self.assertEqual((root / 'data/history.json').read_text(), '[]')
            self.assertEqual((root / 'data/draws.json').read_text(), '[]')


if __name__ == '__main__':
    unittest.main()
