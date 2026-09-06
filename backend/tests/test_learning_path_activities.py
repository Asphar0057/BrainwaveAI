import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.learning_path_activities import (
    _build_flashcards, _build_completion_quiz, _build_question_bank_quiz, _build_chat_prompt,
)

class LearningPathActivitiesTest(unittest.TestCase):
    def setUp(self):
        self.node = SimpleNamespace(id='invoice', title='Invoice processing', summary=[], core_sections=[
            {'title': 'Extraction', 'content': 'Read invoice totals and supplier IDs.', 'example': 'Parse a PDF invoice.'},
            {'title': 'Validation', 'content': 'Compare line items with the invoice total.'},
            {'title': 'Review', 'content': 'Escalate mismatches to a human reviewer.'},
        ])

    def test_cards_use_lesson_explanations_and_examples(self):
        cards = _build_flashcards(self.node, 'Invoice agents', 8, 'intermediate')
        self.assertEqual(len(cards), 3)
        self.assertIn(self.node.core_sections[0]['content'], cards[0]['answer'])
        self.assertIn('Parse a PDF invoice.', cards[0]['answer'])

    def test_quiz_answers_match_context_and_vary_position(self):
        questions = _build_completion_quiz(self.node, 'Invoice agents', 8, 'intermediate')
        self.assertEqual(len(questions), 3)
        for index, question in enumerate(questions):
            self.assertIn(self.node.core_sections[index]['content'], question['question'])
            self.assertEqual(question['options'][question['correct_answer']], self.node.core_sections[index]['title'])
        self.assertEqual([q['correct_answer'] for q in questions], [0, 1, 2])
        bank = _build_question_bank_quiz(self.node, 'Invoice agents', 8, 'intermediate')
        self.assertEqual(bank[1]['correct_answer'], 'Validation')

    def test_missing_content_is_not_replaced_by_fabricated_answers(self):
        self.node.core_sections = []
        self.assertEqual(_build_flashcards(self.node, 'Invoices', 6, 'beginner'), [])
        self.assertEqual(_build_completion_quiz(self.node, 'Invoices', 6, 'beginner'), [])

    def test_reflection_includes_actual_lesson(self):
        prompt = _build_chat_prompt(self.node, 'Invoice agents')
        for section in self.node.core_sections:
            self.assertIn(section['content'], prompt)

if __name__ == '__main__':
    unittest.main()
