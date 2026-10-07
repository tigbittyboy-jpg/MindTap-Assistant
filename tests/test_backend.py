import io
import json
import os
import unittest
from unittest.mock import patch
from backend.server import analyze, validate_question


class BackendTests(unittest.TestCase):
    def test_question_validation(self):
        self.assertEqual(validate_question({'prompt': '2+2?', 'choices': ['3', '4']})['choices'], ['3', '4'])
        for data in [[], {}, {'prompt': 'x', 'choices': ['one']}, {'prompt': 'x', 'choices': ['', 'b']}]:
            with self.assertRaises(ValueError):
                validate_question(data)

    @patch.dict(os.environ, {'GEMINI_API_KEY': 'test-placeholder'})
    def test_provider_contract(self):
        provider = {'candidates': [{'content': {'parts': [{'text': json.dumps(
            {'index': 1, 'confidence': .95, 'explanation': 'Two plus two is four.'})}]}}]}
        with patch('urllib.request.urlopen', return_value=io.BytesIO(json.dumps(provider).encode())) as fetch:
            self.assertEqual(analyze({'prompt': '2+2?', 'choices': ['3', '4']})['index'], 1)
            request = fetch.call_args.args[0]
            self.assertEqual(request.get_header('X-goog-api-key'), 'test-placeholder')
            self.assertNotIn('test-placeholder', request.full_url)
            self.assertEqual(json.loads(request.data)['generationConfig']['responseMimeType'], 'application/json')

    @patch.dict(os.environ, {'GEMINI_API_KEY': 'test-placeholder'})
    def test_invalid_answer_rejected(self):
        for answer in [{'index': 99, 'confidence': .99, 'explanation': 'x'},
                       {'index': True, 'confidence': .99, 'explanation': 'x'},
                       {'index': 0, 'confidence': 2, 'explanation': 'x'}]:
            provider = {'candidates': [{'content': {'parts': [{'text': json.dumps(answer)}]}}]}
            with patch('urllib.request.urlopen', return_value=io.BytesIO(json.dumps(provider).encode())):
                with self.assertRaises(ValueError):
                    analyze({'prompt': '2+2?', 'choices': ['3', '4']})

    @patch.dict(os.environ, {}, clear=True)
    def test_missing_key(self):
        with self.assertRaisesRegex(ValueError, 'GEMINI_API_KEY'):
            analyze({'prompt': '2+2?', 'choices': ['3', '4']})


if __name__ == '__main__':
    unittest.main()
