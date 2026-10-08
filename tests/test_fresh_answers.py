import json
import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from backend import server


class FreshAnswerTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {}, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.question = {'prompt': '2+2?', 'choices': ['3', '4']}
        self.result = {'index': 1, 'answer_text': '4', 'confidence': .95, 'explanation': '2+2=4'}

    def response(self, *_args):
        return {'message': {'content': json.dumps(self.result)}}

    @patch('backend.server.ollama_json')
    def test_repeat_question_can_replace_a_wrong_answer(self, fetch):
        wrong = {**self.result, 'index': 0, 'answer_text': '3'}
        fetch.side_effect = [{'message': {'content': json.dumps(wrong)}}, self.response()]
        first = server.analyze(self.question)
        second = server.analyze(self.question)
        self.assertEqual(first['answer_text'], '3')
        self.assertEqual(second['answer_text'], '4')
        self.assertFalse(second['cached'])
        self.assertEqual(fetch.call_count, 2)

    @patch('backend.server.ollama_json')
    def test_simultaneous_repeats_each_generate(self, fetch):
        fetch.side_effect = self.response
        with ThreadPoolExecutor(max_workers=4) as pool:
            answers = list(pool.map(server.analyze, [self.question] * 4))
        self.assertTrue(all(not answer['cached'] for answer in answers))
        self.assertEqual(fetch.call_count, 4)

    @patch('backend.server.ollama_json')
    def test_token_budget_and_model_residency(self, fetch):
        fetch.side_effect = self.response
        server.analyze(self.question)
        payload = fetch.call_args.args[1]
        self.assertEqual(payload['keep_alive'], -1)
        self.assertEqual(payload['options']['num_predict'], 512)
        with patch.dict(os.environ, {'OLLAMA_MAX_TOKENS': '1024'}):
            server.analyze(self.question)
            self.assertEqual(fetch.call_args.args[1]['options']['num_predict'], 1024)
        with patch.dict(os.environ, {'OLLAMA_THINK': 'true'}):
            server.analyze(self.question)
            self.assertEqual(fetch.call_args.args[1]['options']['num_predict'], 2048)

    @patch('backend.server.ollama_json')
    def test_invalid_settings_rejected_before_generation(self, fetch):
        fetch.side_effect = self.response
        server.analyze(self.question)
        for setting in [{'OLLAMA_MAX_TOKENS': '0'}, {'OLLAMA_MAX_TOKENS': 'oops'},
                        {'OLLAMA_TIMEOUT_SECONDS': '0'}, {'OLLAMA_THINK': 'oops'}]:
            with patch.dict(os.environ, setting), self.assertRaises(ValueError):
                server.analyze(self.question)
        fetch.assert_called_once()

    @patch('builtins.print')
    @patch('backend.server.ollama_json')
    def test_warmup_loads_without_generating_answer_and_failure_is_nonfatal(self, fetch, output):
        server.warm_model()
        self.assertEqual(fetch.call_args.args[0], '/api/generate')
        payload = fetch.call_args.args[1]
        self.assertEqual(payload['prompt'], '')
        self.assertEqual(payload['keep_alive'], -1)
        self.assertEqual(payload['options']['num_ctx'], 4096)
        fetch.side_effect = TimeoutError('Timed out')
        server.warm_model()
        self.assertIn('next question will retry', output.call_args.args[0])
