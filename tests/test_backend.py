import os
import urllib.error
import unittest
from unittest.mock import patch
from backend import server
from backend.server import analyze, validate_question, validate_answer, connection_error, check_connection, provider_error


class BackendTests(unittest.TestCase):
    def test_question_validation(self):
        self.assertEqual(validate_question({'prompt': '2+2?', 'choices': ['3', '4']})['choices'], ['3', '4'])
        for data in [[], {}, {'prompt': 'x', 'choices': ['one']}, {'prompt': 'x', 'choices': ['', 'b']}]:
            with self.assertRaises(ValueError):
                validate_question(data)

    def test_invalid_answer_rejected(self):
        question = {'prompt': '2+2?', 'choices': ['3', '4']}
        for answer in [{'index': 99, 'answer_text': '3', 'confidence': .99, 'explanation': 'x'},
                       {'index': True, 'answer_text': '3', 'confidence': .99, 'explanation': 'x'},
                       {'index': 0, 'answer_text': '3', 'confidence': 2, 'explanation': 'x'}]:
            with self.assertRaises(ValueError):
                validate_answer(answer, question, 'Ollama')

    @patch.dict(os.environ, {}, clear=True)
    @patch('backend.server.ollama_json')
    def test_default_uses_local_model_without_credentials(self, fetch):
        fetch.return_value = {'message': {'content': '{"index":1,"answer_text":"4","confidence":0.95,"explanation":"2+2=4"}'}}
        answer = analyze({'prompt': '2+2?', 'choices': ['3', '4']})
        self.assertEqual(answer['provider'], 'ollama')
        self.assertEqual(answer['model'], 'qwen3:8b')
        self.assertEqual(fetch.call_args.args[0], '/api/chat')
        self.assertEqual(fetch.call_args.args[2], 90)

    def test_connection_errors_are_specific(self):
        self.assertIn('timed out', connection_error(urllib.error.URLError(TimeoutError())))
        self.assertIn('port 11434', connection_error(urllib.error.URLError('connection refused')))

    def test_provider_error_explains_missing_model(self):
        error = urllib.error.HTTPError('http://localhost', 404, 'Not found', {}, None)
        self.assertIn('ollama pull', provider_error(error))
        error.code = 500
        self.assertIn('HTTP 500', provider_error(error))

    @patch.dict(os.environ, {'OLLAMA_TIMEOUT_SECONDS': '0'})
    @patch('backend.server.ollama_json')
    def test_invalid_timeout_rejected_before_request(self, fetch):
        with self.assertRaisesRegex(ValueError, 'OLLAMA_TIMEOUT_SECONDS'):
            analyze({'prompt': '2+2?', 'choices': ['3', '4']})
        fetch.assert_not_called()

    @patch('backend.server.ollama_json', return_value={'models': []})
    @patch('builtins.print')
    def test_connection_check_rejects_missing_model(self, output, fetch):
        self.assertEqual(check_connection(), 1)
        self.assertIn('not installed', output.call_args.args[0])

    @patch('backend.server.ollama_json', side_effect=urllib.error.URLError('connection refused'))
    @patch('builtins.print')
    def test_connection_check_rejects_unavailable_service(self, output, fetch):
        self.assertEqual(check_connection(), 1)
        self.assertIn('port 11434', output.call_args.args[0])

    @patch('backend.server.analyze_ollama')
    def test_single_pass_preserves_answer_without_second_request(self, solve):
        solve.return_value = {'index': 1, 'answer_text': '4', 'confidence': .95, 'explanation': '2+2=4'}
        answer = analyze({'prompt': '2+2?', 'choices': ['3', '4']})
        solve.assert_called_once()
        self.assertEqual(answer['confidence'], .95)
        self.assertEqual(answer['analysis_mode'], 'single_pass')
        self.assertEqual(answer['reference_count'], 0)


if __name__ == '__main__':
    unittest.main()

class CompoundStatementTests(unittest.TestCase):
    def setUp(self):
        self.question = {'prompt': 'Each thread has a 45° angle and a taper of 1/16 inch per inch.', 'choices': ['True', 'False']}
        self.checks = [{'claim_index': 0, 'status': 'false', 'reason': 'The angle is 60°, not 45°.'}, {'claim_index': 1, 'status': 'true', 'reason': 'The taper is 1/16 inch per inch.'}]

    @patch('backend.server.ollama_json')
    def test_false_clause_overrides_true_in_one_model_call(self, fetch):
        import json
        result = {'index': 0, 'answer_text': 'True', 'confidence': .9, 'explanation': 'Taper is correct.', 'claim_checks': self.checks}
        fetch.return_value = {'message': {'content': json.dumps(result)}}
        answer = analyze(self.question)
        self.assertEqual(answer['answer_text'], 'False')
        self.assertEqual(answer['explanation'], 'The angle is 60°, not 45°.')
        fetch.assert_called_once()
        payload = fetch.call_args.args[1]
        claims = json.loads(payload['messages'][1]['content'])['claims_to_check']
        self.assertEqual(len(claims), 2)
        self.assertIn('45°', claims[0]['text'])
        self.assertIn('1/16', claims[1]['text'])
        self.assertIn('claim_checks', payload['format']['required'])

    def test_combination_and_coverage(self):
        from backend.server import compound_claims, resolve_claims
        claims = compound_claims(self.question)
        self.checks[0]['status'] = 'true'
        self.assertEqual(resolve_claims({'claim_checks': self.checks}, self.question, claims)['answer_text'], 'True')
        self.checks[0]['status'] = 'unknown'
        with self.assertRaisesRegex(ValueError, 'unsupported'):
            resolve_claims({'claim_checks': self.checks}, self.question, claims)
        self.checks[1]['status'] = 'false'
        self.assertEqual(resolve_claims({'claim_checks': self.checks}, self.question, claims)['answer_text'], 'False')
        for checks in [self.checks[:1], [self.checks[0], self.checks[0]]]:
            with self.assertRaises(ValueError):
                resolve_claims({'claim_checks': checks}, self.question, claims)
        self.assertEqual(compound_claims({'prompt':'Refrigerant contains liquid and vapor.', 'choices':['True','False']}), [])
        self.assertEqual(compound_claims({'prompt':'The angle is 45° or the taper is 1/16.', 'choices':['True','False']}), [])
