import json
import os
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from backend import server


class AnswerCacheTests(unittest.TestCase):
    def setUp(self):
        server.clear_answer_cache()
        self.environment = patch.dict(os.environ, {}, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.addCleanup(server.clear_answer_cache)
        self.question = {'prompt': '2+2?', 'choices': ['3', '4']}
        self.result = {'index': 1, 'answer_text': '4', 'confidence': .95, 'explanation': '2+2=4'}

    def response(self, *_args):
        return {'message': {'content': json.dumps(self.result)}}

    @patch('backend.server.ollama_json')
    def test_repeat_uses_cache_and_returns_independent_result(self, fetch):
        fetch.side_effect = self.response
        first = server.analyze(self.question)
        first['explanation'] = 'Caller modification'
        second = server.analyze(self.question)
        self.assertFalse(first['cached'])
        self.assertTrue(second['cached'])
        self.assertEqual(second['explanation'], '2+2=4')
        fetch.assert_called_once()

    @patch('backend.server.ollama_json')
    def test_context_and_answer_order_changes_do_not_reuse_cache(self, fetch):
        def answer_for_request(_path, payload, _timeout):
            choices = json.loads(payload['messages'][1]['content'])['choices']
            result = {**self.result, 'answer_text': choices[1]['text']}
            return {'message': {'content': json.dumps(result)}}
        fetch.side_effect = answer_for_request
        variants = [self.question,
            {**self.question, 'prompt': '2 + 2?'},
            {**self.question, 'choices': ['4', '3']},
            {**self.question, 'references': [{'source': 'Book', 'text': 'Two plus two equals four.'}]},
            {**self.question, 'references': [{'source': 'Book', 'text': 'Updated textbook facts.'}]}]
        for question in variants:
            self.assertFalse(server.analyze(question)['cached'])
            self.assertTrue(server.analyze(question)['cached'])
        self.assertEqual(fetch.call_count, len(variants))

    @patch('backend.server.ollama_json')
    def test_model_settings_and_instructions_invalidate_cache(self, fetch):
        fetch.side_effect = self.response
        server.analyze(self.question)
        for setting in [{'OLLAMA_MODEL': 'other:8b'}, {'OLLAMA_THINK': 'true'},
                        {'OLLAMA_MAX_TOKENS': '1024'}]:
            with patch.dict(os.environ, setting):
                self.assertFalse(server.analyze(self.question)['cached'])
        with patch.object(server, 'ANSWER_INSTRUCTIONS', server.ANSWER_INSTRUCTIONS + ' Updated.'):
            self.assertFalse(server.analyze(self.question)['cached'])
        self.assertEqual(fetch.call_count, 5)

    @patch('backend.server.ollama_json')
    def test_invalid_answers_and_connection_failures_are_not_cached(self, fetch):
        fetch.return_value = {'message': {'content': '{"index":99}'}}
        for _ in range(2):
            with self.assertRaises(ValueError):
                server.analyze(self.question)
        fetch.side_effect = TimeoutError('Timed out')
        with self.assertRaises(TimeoutError):
            server.analyze(self.question)
        self.assertEqual(len(server.ANSWER_CACHE), 0)
        fetch.side_effect = self.response
        self.assertFalse(server.analyze(self.question)['cached'])
        self.assertTrue(server.analyze(self.question)['cached'])
        self.assertEqual(fetch.call_count, 4)

    @patch('backend.server.ollama_json')
    def test_simultaneous_duplicates_generate_once(self, fetch):
        fetch.side_effect = self.response
        with ThreadPoolExecutor(max_workers=4) as pool:
            answers = list(pool.map(server.analyze, [self.question] * 4))
        self.assertEqual(sum(not answer['cached'] for answer in answers), 1)
        fetch.assert_called_once()

    @patch('backend.server.ollama_json')
    def test_cached_answer_does_not_wait_for_unrelated_generation(self, fetch):
        fetch.side_effect = self.response
        server.analyze(self.question)
        started, release = threading.Event(), threading.Event()
        def slow_response(*args):
            started.set()
            self.assertTrue(release.wait(timeout=5))
            return self.response(*args)
        fetch.side_effect = slow_response
        with ThreadPoolExecutor(max_workers=2) as pool:
            slow = pool.submit(server.analyze, {**self.question, 'prompt': 'Another question'})
            try:
                self.assertTrue(started.wait(timeout=2))
                fast = pool.submit(server.analyze, self.question)
                self.assertTrue(fast.result(timeout=1)['cached'])
            finally:
                release.set()
            self.assertFalse(slow.result(timeout=2)['cached'])

    @patch('backend.server.ollama_json')
    def test_lru_capacity_evicts_least_recent_answer(self, fetch):
        fetch.side_effect = self.response
        with patch.object(server, 'CACHE_MAX_ENTRIES', 2):
            questions = [{**self.question, 'prompt': str(i)} for i in range(3)]
            server.analyze(questions[0]); server.analyze(questions[1])
            self.assertTrue(server.analyze(questions[0])['cached'])
            server.analyze(questions[2])
            self.assertEqual(len(server.ANSWER_CACHE), 2)
            self.assertTrue(server.analyze(questions[0])['cached'])
            self.assertFalse(server.analyze(questions[1])['cached'])
        self.assertEqual(fetch.call_count, 4)

    @patch('backend.server.ollama_json')
    def test_byte_limit_and_explicit_reset(self, fetch):
        fetch.side_effect = self.response
        server.analyze(self.question)
        size = server.cache_bytes
        server.clear_answer_cache()
        with patch.object(server, 'CACHE_MAX_BYTES', size * 2):
            for i in range(3):
                server.analyze({**self.question, 'prompt': str(i)})
            self.assertEqual(len(server.ANSWER_CACHE), 2)
            self.assertLessEqual(server.cache_bytes, size * 2)
        server.clear_answer_cache()
        self.assertEqual(server.cache_bytes, 0)
        self.assertFalse(server.analyze(self.question)['cached'])

    @patch('backend.server.ollama_json')
    def test_tiny_cache_does_not_store_oversized_answers(self, fetch):
        fetch.side_effect = self.response
        with patch.object(server, 'CACHE_MAX_BYTES', 1):
            self.assertFalse(server.analyze(self.question)['cached'])
            self.assertFalse(server.analyze(self.question)['cached'])
        self.assertEqual(len(server.ANSWER_CACHE), 0)
        self.assertEqual(server.cache_bytes, 0)

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
    def test_invalid_settings_cannot_bypass_validation_via_cache(self, fetch):
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
