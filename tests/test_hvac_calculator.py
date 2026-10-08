import json
import unittest
from pathlib import Path
from unittest.mock import patch
from backend.hvac_calculator import calculate_subcooling, TABLE
from backend.server import analyze

CASES = json.loads((Path(__file__).parent / 'fixtures/subcooling.json').read_text())


class SubcoolingTests(unittest.TestCase):
    def test_shared_cases(self):
        for case in CASES:
            with self.subTest(case['name']):
                question = {'prompt': case['prompt'], 'choices': case['choices']}
                if case.get('error'):
                    with self.assertRaisesRegex(ValueError, case['error']):
                        calculate_subcooling(question)
                    continue
                answer = calculate_subcooling(question)
                if case.get('null'):
                    self.assertIsNone(answer)
                    continue
                self.assertEqual(answer['answer_text'], case['answer'])
                self.assertEqual(answer['index'], case['choices'].index(case['answer']))
                self.assertRegex(answer['explanation'], case.get('reason_pattern', '119.6.*108.*11.6'))

    @patch('backend.server.ollama_json')
    def test_backend_calculates_and_declines_bad_inputs_without_ollama(self, fetch):
        first = CASES[0]
        answer = analyze({'prompt': first['prompt'], 'choices': first['choices']})
        self.assertEqual(answer['answer_text'], '12°F')
        self.assertEqual(answer['provider'], 'calculator')
        with self.assertRaisesRegex(ValueError, 'exactly one choice'):
            analyze({'prompt': first['prompt'], 'choices': ['7°F', '21°F']})
        fetch.assert_not_called()

    def test_table_metadata_and_monotonicity(self):
        self.assertEqual(TABLE['pressure_unit'], 'psig')
        self.assertEqual(TABLE['eos_reference'], 'Lemmon-IJT-2003')
        self.assertTrue(all(a[0] < b[0] for a, b in zip(TABLE['points'], TABLE['points'][1:])))
