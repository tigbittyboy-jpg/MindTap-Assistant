import json
import os
import threading
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
from backend import server


class OllamaIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.payloads = []
        owner = self
        class FakeOllama(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass
            def do_GET(self):
                self.respond({'models': [{'name': 'qwen3:8b'}]})
            def do_POST(self):
                payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                owner.payloads.append((self.path, payload, self.headers.get('x-goog-api-key')))
                answer = {'index': 1, 'answer_text': '4', 'confidence': .95, 'explanation': '2 + 2 = 4.'}
                if owner.invalid:
                    answer['index'] = 99
                if owner.mismatch:
                    answer['answer_text'] = '3'
                self.respond({'message': {'content': json.dumps(answer)}})
            def respond(self, data):
                encoded = json.dumps(data).encode()
                self.send_response(200)
                self.send_header('Content-Length', str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)
        self.invalid = False
        self.mismatch = False
        self.model_server = ThreadingHTTPServer(('127.0.0.1', 0), FakeOllama)
        self.gateway = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        for instance in [self.model_server, self.gateway]:
            threading.Thread(target=instance.serve_forever, daemon=True).start()
            self.addCleanup(instance.server_close)
            self.addCleanup(instance.shutdown)
        local = f'http://127.0.0.1:{self.model_server.server_port}'
        self.addCleanup(patch.stopall)
        patch.object(server, 'OLLAMA_BASE_URL', local).start()
        patch.dict(os.environ, {'OLLAMA_MODEL': 'qwen3:8b'}, clear=True).start()
        self.client = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def test_http_gateway_to_local_model_without_key(self):
        request = urllib.request.Request(f'http://127.0.0.1:{self.gateway.server_port}/analyze',
            data=json.dumps({'prompt': '2+2?', 'choices': ['3', '4']}).encode(),
            headers={'Content-Type': 'application/json', 'Origin': 'chrome-extension://test'})
        with self.client.open(request, timeout=5) as response:
            self.assertEqual(json.load(response)['index'], 1)
            self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'chrome-extension://test')
        path, payload, key = self.payloads[0]
        self.assertEqual(path, '/api/chat')
        self.assertEqual(payload['model'], 'qwen3:8b')
        self.assertFalse(payload['stream'])
        self.assertFalse(payload['think'])
        self.assertIsNone(key)
        question = json.loads(payload['messages'][1]['content'])
        self.assertEqual(question['choices'], [{'index': 0, 'text': '3'}, {'index': 1, 'text': '4'}])
        self.assertIn('answer_text', payload['format']['required'])

    def test_health_identifies_ollama(self):
        with self.client.open(f'http://127.0.0.1:{self.gateway.server_port}/health', timeout=5) as response:
            health = json.load(response)
        self.assertEqual(health['provider'], 'ollama')
        self.assertEqual(health['model'], 'qwen3:8b')
        self.assertNotIn('api_key_configured', health)

    @patch('builtins.print')
    def test_connection_check_verifies_installed_model(self, output):
        self.assertEqual(server.check_connection(), 0)
        self.assertIn('qwen3:8b is installed', output.call_args.args[0])
        self.assertEqual(self.payloads, [])

    def test_invalid_model_answer_rejected(self):
        self.invalid = True
        with self.assertRaisesRegex(ValueError, 'Ollama returned an invalid answer'):
            server.analyze({'prompt': '2+2?', 'choices': ['3', '4']})

    def test_inconsistent_answer_text_rejected(self):
        self.mismatch = True
        with self.assertRaisesRegex(ValueError, 'Ollama returned an invalid answer'):
            server.analyze({'prompt': '2+2?', 'choices': ['3', '4']})

    @patch.dict(os.environ, {'OLLAMA_THINK': 'true'})
    def test_reasoning_can_be_enabled(self):
        server.analyze({'prompt': '2+2?', 'choices': ['3', '4']})
        payload = self.payloads[0][1]
        self.assertTrue(payload['think'])
        self.assertNotIn('/no_think', payload['messages'][0]['content'])
