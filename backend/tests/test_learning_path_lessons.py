import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.learning_path_lessons import generate_lesson, valid_lesson, LEVELS

class LessonsTest(unittest.TestCase):
    def setUp(self):
        self.node = SimpleNamespace(title='Invoice validation', objectives=['Reconcile totals'],
            prerequisites=['Extract invoice fields'], keywords=['tax', 'line items'],
            core_sections=[], primary_resources=[], summary=[])
        self.path = SimpleNamespace(title='Invoice agents', topic_prompt='Automate invoice processing')
        self.payload = {'core_sections': [{
            'title': title,
            'content': ' '.join(['Compare each line item with the recorded total and check tax separately.'] * 7),
            'example': 'Worked example: two items cost 20 and 30, with 10 percent tax. The subtotal is 50, tax is 5, and the total is 55.',
            'practice': 'Calculate the total for a subtotal of 80 and tax of 10 percent.',
            'solution': '80 + 8 = 88.',
        } for title in ['Line item checks', 'Tax reconciliation', 'Mismatch review']]}

    def test_each_level_uses_distinct_teaching_requirements_and_chapter_context(self):
        prompts = []
        for level in LEVELS:
            ai = Mock()
            ai.generate.return_value = json.dumps(self.payload)
            result = generate_lesson(ai, self.node, self.path, level)
            prompt = ai.generate.call_args.args[0]
            self.assertIn(LEVELS[level], prompt)
            self.assertIn('Reconcile totals', prompt)
            self.assertIn('Automate invoice processing', prompt)
            self.assertTrue(valid_lesson(result, level))
            prompts.append(prompt)
        self.assertEqual(len(set(prompts)), 3)

    def test_rejects_old_generic_or_wrong_level_cache(self):
        self.assertFalse(valid_lesson({'content': 'A generic introduction'}, 'beginner'))
        ai = Mock(); ai.generate.return_value = json.dumps(self.payload)
        result = generate_lesson(ai, self.node, self.path, 'beginner')
        self.assertFalse(valid_lesson(result, 'advanced'))

    def test_incomplete_generation_fails_instead_of_returning_placeholder(self):
        ai = Mock(); ai.generate.return_value = '{"core_sections": []}'
        with self.assertRaises(ValueError):
            generate_lesson(ai, self.node, self.path, 'intermediate')

    def test_invalid_level_never_calls_model(self):
        ai = Mock()
        with self.assertRaises(ValueError):
            generate_lesson(ai, self.node, self.path, 'expert')
        ai.generate.assert_not_called()
