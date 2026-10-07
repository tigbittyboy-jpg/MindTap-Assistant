import io
import json
import os
import socket
import ssl
import urllib.error
import unittest
from unittest.mock import patch
from backend.server import analyze, validate_question, connection_error, check_connection, provider_error


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


    def test_connection_errors_are_specific(self):
        cases = [(ssl.SSLCertVerificationError(1, 'certificate verify failed'), 'Install Certificates.command'),
                 (socket.gaierror(-2, 'name not known'), 'hostname'),
                 (TimeoutError(), 'timed out'), (ssl.SSLError(), 'TLS')]
        for reason, expected in cases:
            self.assertIn(expected, connection_error(urllib.error.URLError(reason)))
        self.assertNotIn('secret-placeholder', connection_error(urllib.error.URLError('secret-placeholder')))

    @patch('urllib.request.urlopen', side_effect=urllib.error.HTTPError('https://example.test', 403, 'Forbidden', {}, None))
    @patch('builtins.print')
    def test_diagnostic_accepts_http_response_without_api_key(self, output, fetch):
        self.assertEqual(check_connection(), 0)
        self.assertIn('sends no API key', output.call_args.args[0])


    @patch.dict(os.environ, {'GEMINI_API_KEY': 'private-test-key'})
    def test_provider_error_explanation_redacts_key(self):
        body = {'error': {'status': 'INVALID_ARGUMENT', 'message': 'Invalid API key private-test-key and AIzaFakeKey123456.'}}
        error = urllib.error.HTTPError('https://example.test', 400, 'Bad request', {}, io.BytesIO(json.dumps(body).encode()))
        message = provider_error(error)
        self.assertIn('INVALID_ARGUMENT', message)
        self.assertIn('[redacted API key]', message)
        self.assertNotIn('private-test-key', message)
        self.assertNotIn('AIzaFakeKey', message)

    def test_provider_error_handles_non_json_response(self):
        error = urllib.error.HTTPError('https://example.test', 400, 'Bad request', {}, io.BytesIO(b'<html>unavailable</html>'))
        self.assertIn('No readable error details', provider_error(error))


if __name__ == '__main__':
    unittest.main()
