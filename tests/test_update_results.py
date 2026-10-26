import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('updater', Path(__file__).resolve().parents[1] / 'scripts/update_results.py')
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)
BASE = dict(id='10', date='2020-01-01', numbers=[1, 2, 3, 4, 5, 6], strong=3)
HEADER = 'הגרלה,תאריך,1,2,3,4,5,6,המספר החזק\n'


class UpdateTests(unittest.TestCase):
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
