from __future__ import annotations

import json
import math
import os
import sys
import tempfile
import time
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.intent_engine import (
    CLASSES,
    BehavioralRule,
    CerbylIntentEngine,
    ConfidenceEstimator,
    IntentResult,
    InstructionMemory,
    NaiveBayesClassifier,
)

# InstructionMemory/CerbylIntentEngine.classify are keyed per-user (see
# services/intent_engine.py) -- any fixed id works here since each test gets
# its own fresh engine/memory fixture instance, so there is no cross-test
# leakage to worry about.
TEST_USER_ID = 1

@pytest.fixture()
def fresh_nb() -> NaiveBayesClassifier:
    return NaiveBayesClassifier(CLASSES)

@pytest.fixture()
def trained_nb() -> NaiveBayesClassifier:
    nb = NaiveBayesClassifier(CLASSES)
    examples = [
        ("explain gradient descent to me", "LEARN_CONCEPT"),
        ("what is a neural network", "LEARN_CONCEPT"),
        ("how does backpropagation work", "LEARN_CONCEPT"),
        ("tell me about transformers", "LEARN_CONCEPT"),
        ("what is the central limit theorem", "LEARN_CONCEPT"),
        ("don't ask me questions", "INSTRUCTION"),
        ("stop using bullet points", "INSTRUCTION"),
        ("keep your answers short", "INSTRUCTION"),
        ("never end with a question", "INSTRUCTION"),
        ("do you remember what we talked about", "META"),
        ("what did we cover last session", "META"),
        ("hi", "CASUAL"),
        ("hello there", "CASUAL"),
        ("ok thanks", "CASUAL"),
        ("cool got it", "CASUAL"),
        ("i'm so lost i give up", "EMOTIONAL"),
        ("this is so confusing", "EMOTIONAL"),
        ("quiz me on this topic", "ASSESS"),
        ("give me practice questions", "ASSESS"),
        ("summarize what we covered", "REVIEW"),
        ("give me a quick recap", "REVIEW"),
    ]
    for text, label in examples:
        nb.partial_fit(text, label)
    return nb

@pytest.fixture()
def mem() -> InstructionMemory:
    return InstructionMemory()

@pytest.fixture()
def estimator() -> ConfidenceEstimator:
    return ConfidenceEstimator()

@pytest.fixture()
def engine_with_seed() -> CerbylIntentEngine:
    eng = CerbylIntentEngine()
    seed_path = Path(__file__).parent.parent / "services" / "intent_seed.json"
    seed = json.loads(seed_path.read_text(encoding="utf-8"))
    for ex in seed.get("examples", []):
        eng.classifier.partial_fit(ex["text"], ex["label"], weight=ex.get("weight", 1.0))
    eng._ready = True
    return eng

class TestNaiveBayesClassifier:

    def test_tokenize_produces_unigrams_and_bigrams(self, fresh_nb):
        tokens = fresh_nb._tokenize("hello world foo")
        assert "hello" in tokens
        assert "world" in tokens
        assert "hello_world" in tokens
        assert "world_foo" in tokens

    def test_tokenize_lowercases(self, fresh_nb):
        tokens = fresh_nb._tokenize("Hello WORLD")
        assert "hello" in tokens
        assert "world" in tokens
        assert "Hello" not in tokens

    def test_tokenize_strips_short_tokens(self, fresh_nb):
        tokens = fresh_nb._tokenize("a is an the")
        assert "a" not in tokens

    def test_tokenize_handles_empty(self, fresh_nb):
        assert fresh_nb._tokenize("") == []

    def test_partial_fit_updates_vocab(self, fresh_nb):
        fresh_nb.partial_fit("explain backprop", "LEARN_CONCEPT")
        assert "explain" in fresh_nb.vocab
        assert "backprop" in fresh_nb.vocab

    def test_partial_fit_increments_counts(self, fresh_nb):
        fresh_nb.partial_fit("explain explain", "LEARN_CONCEPT")
        assert fresh_nb.class_word_counts["LEARN_CONCEPT"]["explain"] == pytest.approx(2.0)

    def test_partial_fit_weighted(self, fresh_nb):
        fresh_nb.partial_fit("gradient descent", "LEARN_CONCEPT", weight=3.0)
        assert fresh_nb.class_word_counts["LEARN_CONCEPT"]["gradient"] == pytest.approx(3.0)
        assert fresh_nb.class_total_words["LEARN_CONCEPT"] == pytest.approx(9.0)

    def test_predict_proba_sums_to_one(self, trained_nb):
        proba = trained_nb.predict_proba("what is gradient descent")
        assert abs(sum(proba.values()) - 1.0) < 1e-9

    def test_predict_proba_all_classes_present(self, trained_nb):
        proba = trained_nb.predict_proba("explain backprop")
        assert set(proba.keys()) == set(CLASSES)

    def test_predict_proba_positive_values(self, trained_nb):
        proba = trained_nb.predict_proba("hello")
        for v in proba.values():
            assert v > 0.0

    def test_predict_learn_concept(self, trained_nb):
        label, conf = trained_nb.predict("explain how neural networks learn")
        assert label == "LEARN_CONCEPT", f"got {label}"
        assert conf > 0.3

    def test_predict_instruction(self, trained_nb):
        label, conf = trained_nb.predict("don't ask me questions anymore")
        assert label == "INSTRUCTION", f"got {label}"

    def test_predict_casual(self, trained_nb):
        label, _ = trained_nb.predict("hi")
        assert label == "CASUAL"

    def test_predict_meta(self, trained_nb):
        label, _ = trained_nb.predict("do you remember what we covered")
        assert label == "META"

    def test_predict_emotional(self, trained_nb):
        label, _ = trained_nb.predict("i'm so lost i give up on this")
        assert label == "EMOTIONAL"

    def test_predict_assess(self, trained_nb):
        label, _ = trained_nb.predict("quiz me on this topic")
        assert label == "ASSESS"

    def test_predict_review(self, trained_nb):
        label, _ = trained_nb.predict("summarize everything we covered today")
        assert label == "REVIEW"

    def test_entropy_untrained_is_max(self, fresh_nb):
        H = fresh_nb.entropy("anything")
        H_max = math.log(len(CLASSES))
        assert H == pytest.approx(H_max, abs=0.01)

    def test_entropy_decreases_after_training(self, trained_nb):
        H_trained = trained_nb.entropy("explain gradient descent")
        H_max = math.log(len(CLASSES))
        assert H_trained < H_max

    def test_entropy_confident_prediction_low(self, trained_nb):
        for _ in range(10):
            trained_nb.partial_fit("xyzzy frobulate quux", "ASSESS")
        H = trained_nb.entropy("xyzzy frobulate quux")
        assert H < math.log(len(CLASSES)) * 0.8

    def test_serialise_deserialise_roundtrip(self, trained_nb):
        proba_before = trained_nb.predict_proba("explain neural networks")
        state = trained_nb.serialize()

        nb2 = NaiveBayesClassifier(CLASSES)
        nb2.deserialize(state)
        proba_after = nb2.predict_proba("explain neural networks")

        for cls in CLASSES:
            assert proba_before[cls] == pytest.approx(proba_after[cls], abs=1e-9)

    def test_serialise_vocab_preserved(self, trained_nb):
        state = trained_nb.serialize()
        nb2 = NaiveBayesClassifier(CLASSES)
        nb2.deserialize(state)
        assert "gradient" in nb2.vocab
        assert "backpropagation" in nb2.vocab

    def test_online_update_shifts_prediction(self, trained_nb):
        phrase = "zebra unicorn frobble"
        label_before, _ = trained_nb.predict(phrase)
        for _ in range(20):
            trained_nb.partial_fit(phrase, "REVIEW", weight=2.0)
        label_after, conf_after = trained_nb.predict(phrase)
        assert label_after == "REVIEW"
        assert conf_after > 0.5

    def test_handles_unknown_tokens_gracefully(self, trained_nb):
        proba = trained_nb.predict_proba("qxzwpfmrvblt zzzyqqq")
        assert abs(sum(proba.values()) - 1.0) < 1e-9

    def test_empty_string_returns_uniform_ish(self, trained_nb):
        proba = trained_nb.predict_proba("")
        total = sum(proba.values())
        assert abs(total - 1.0) < 1e-9
        max_p = max(proba.values())
        min_p = min(proba.values())
        assert max_p / min_p < 10

class TestInstructionMemory:

    def test_extract_no_questions_rule(self, mem):
        rules = mem.extract_and_store(TEST_USER_ID, "don't ask me questions anymore")
        assert any(r.domain == "questions" and r.negated for r in rules)

    def test_extract_no_questions_variant(self, mem):
        rules = mem.extract_and_store(TEST_USER_ID, "stop asking me questions")
        assert any(r.domain == "questions" and r.negated for r in rules)

    def test_extract_no_bullets_rule(self, mem):
        rules = mem.extract_and_store(TEST_USER_ID, "stop using bullet points")
        assert any(r.domain == "bullets" and r.negated for r in rules)

    def test_extract_length_rule(self, mem):
        rules = mem.extract_and_store(TEST_USER_ID, "keep it short")
        assert any(r.domain == "length" and r.negated for r in rules)

    def test_extract_examples_positive_rule(self, mem):
        rules = mem.extract_and_store(TEST_USER_ID, "always use examples when explaining")
        assert any(r.domain == "examples" and not r.negated for r in rules)

    def test_extract_emoji_rule(self, mem):
        rules = mem.extract_and_store(TEST_USER_ID, "please don't use emojis")
        assert any(r.domain == "emojis" and r.negated for r in rules)

    def test_extract_no_summary_rule(self, mem):
        rules = mem.extract_and_store(TEST_USER_ID, "don't summarize at the end")
        assert any(r.domain == "summary" and r.negated for r in rules)

    def test_extract_comprehension_check_variant(self, mem):
        rules = mem.extract_and_store(TEST_USER_ID, "no comprehension checks please")
        assert any(r.domain == "questions" and r.negated for r in rules)

    def test_no_rules_for_casual_message(self, mem):
        rules = mem.extract_and_store(TEST_USER_ID, "hi how are you")
        assert rules == []

    def test_no_rules_for_educational_message(self, mem):
        rules = mem.extract_and_store(TEST_USER_ID, "explain gradient descent to me")
        assert rules == []

    def test_rule_initial_strength_is_one(self, mem):
        rules = mem.extract_and_store(TEST_USER_ID, "don't ask me questions")
        assert rules[0].strength == pytest.approx(1.0)

    def test_rule_reinforcement_increases_strength(self, mem):
        mem.extract_and_store(TEST_USER_ID, "don't ask me questions")
        rules = mem.extract_and_store(TEST_USER_ID, "stop asking me questions again")
        assert rules[0].strength > 1.0

    def test_rule_strength_capped_at_two(self, mem):
        for _ in range(20):
            mem.extract_and_store(TEST_USER_ID, "don't ask me questions")
        active = mem.active_rules(TEST_USER_ID)
        q_rule = next(r for r in active if r.domain == "questions")
        assert q_rule.strength <= 2.0

    def test_rule_is_active_immediately(self, mem):
        mem.extract_and_store(TEST_USER_ID, "keep it short")
        assert len(mem.active_rules(TEST_USER_ID)) == 1

    def test_rule_decay_with_mocked_time(self, mem):
        mem.extract_and_store(TEST_USER_ID, "don't ask me questions")
        rule = mem.active_rules(TEST_USER_ID)[0]
        rule.created_at -= 7 * 86400
        assert rule.current_strength == pytest.approx(0.5, abs=0.01)

    def test_rule_becomes_inactive_after_decay(self, mem):
        mem.extract_and_store(TEST_USER_ID, "don't ask me questions")
        rule = mem.active_rules(TEST_USER_ID)[0]
        rule.created_at -= 50 * 86400
        assert not rule.is_active

    def test_active_rules_filters_expired(self, mem):
        mem.extract_and_store(TEST_USER_ID, "don't ask me questions")
        rule = list(mem._rules[TEST_USER_ID].values())[0]
        rule.created_at -= 50 * 86400
        assert len(mem.active_rules(TEST_USER_ID)) == 0

    def test_multiple_distinct_rules(self, mem):
        mem.extract_and_store(TEST_USER_ID, "don't ask me questions")
        mem.extract_and_store(TEST_USER_ID, "stop using bullet points")
        mem.extract_and_store(TEST_USER_ID, "keep it short")
        active = mem.active_rules(TEST_USER_ID)
        domains = {r.domain for r in active}
        assert "questions" in domains
        assert "bullets" in domains
        assert "length" in domains

    def test_prompt_addendum_includes_active_rules(self, mem):
        mem.extract_and_store(TEST_USER_ID, "don't ask me questions")
        addendum = mem.to_prompt_addendum(TEST_USER_ID)
        assert "questions" in addendum
        assert "NEVER" in addendum

    def test_prompt_addendum_empty_when_no_rules(self, mem):
        assert mem.to_prompt_addendum(TEST_USER_ID) == ""

    def test_serialise_deserialise_roundtrip(self, mem):
        mem.extract_and_store(TEST_USER_ID, "don't ask me questions")
        mem.extract_and_store(TEST_USER_ID, "keep it short")
        data = mem.serialize()

        mem2 = InstructionMemory()
        mem2.deserialize(data)
        domains = {r.domain for r in mem2.active_rules(TEST_USER_ID)}
        assert "questions" in domains
        assert "length" in domains

    def test_rule_id_is_unique(self, mem):
        mem.extract_and_store(TEST_USER_ID, "don't ask me questions")
        mem.extract_and_store(TEST_USER_ID, "stop using bullets")
        ids = [r.rule_id for r in mem.active_rules(TEST_USER_ID)]
        assert len(ids) == len(set(ids))

class TestConfidenceEstimator:

    def _uniform_proba(self):
        return {c: 1.0 / len(CLASSES) for c in CLASSES}

    def _peaked_proba(self, winner="LEARN_CONCEPT", winner_mass=0.90):
        rest = (1.0 - winner_mass) / (len(CLASSES) - 1)
        return {c: (winner_mass if c == winner else rest) for c in CLASSES}

    def test_output_in_valid_range(self, estimator):
        proba = self._peaked_proba()
        conf = estimator.estimate(proba, "This is a confident answer about tensors.")
        assert 0.05 <= conf <= 0.95

    def test_uniform_proba_gives_lower_confidence(self, estimator):
        uniform_conf = estimator.estimate(
            self._uniform_proba(), "answer", engagement_score=0.5, frustration_score=0.0
        )
        peaked_conf = estimator.estimate(
            self._peaked_proba(), "answer", engagement_score=0.5, frustration_score=0.0
        )
        assert peaked_conf > uniform_conf

    def test_high_frustration_lowers_confidence(self, estimator):
        proba = self._peaked_proba()
        low = estimator.estimate(proba, "clear answer", frustration_score=0.9)
        high = estimator.estimate(proba, "clear answer", frustration_score=0.0)
        assert high > low

    def test_high_engagement_raises_confidence(self, estimator):
        proba = self._peaked_proba()
        low = estimator.estimate(proba, "answer", engagement_score=0.1)
        high = estimator.estimate(proba, "answer", engagement_score=0.9)
        assert high > low

    def test_hedging_words_lower_confidence(self, estimator):
        proba = self._peaked_proba()
        hedged = "It might possibly be roughly accurate, perhaps approximately."
        clean = "Gradient descent minimises loss by moving in the negative gradient direction."
        conf_hedged = estimator.estimate(proba, hedged)
        conf_clean = estimator.estimate(proba, clean)
        assert conf_clean >= conf_hedged

    def test_zpd_match_raises_confidence(self, estimator):
        proba = self._peaked_proba()
        zpd = estimator.estimate(proba, "good answer", p_mastery=0.40)
        novice = estimator.estimate(proba, "good answer", p_mastery=0.05)
        expert = estimator.estimate(proba, "good answer", p_mastery=0.95)
        assert zpd >= novice
        assert zpd >= expert

    def test_confidence_never_below_floor(self, estimator):
        worst_proba = self._uniform_proba()
        conf = estimator.estimate(
            worst_proba,
            "might possibly perhaps unclear uncertain roughly approximately",
            engagement_score=0.0,
            frustration_score=1.0,
            p_mastery=0.99,
        )
        assert conf >= 0.05

    def test_confidence_never_above_ceiling(self, estimator):
        best_proba = self._peaked_proba(winner_mass=0.999)
        conf = estimator.estimate(
            best_proba,
            "Backpropagation computes gradients via the chain rule.",
            engagement_score=1.0,
            frustration_score=0.0,
            p_mastery=0.40,
        )
        assert conf <= 0.95

    def test_output_is_rounded_to_3_decimals(self, estimator):
        proba = self._peaked_proba()
        conf = estimator.estimate(proba, "answer")
        assert conf == round(conf, 3)

    def test_empty_response_handled(self, estimator):
        proba = self._peaked_proba()
        conf = estimator.estimate(proba, "")
        assert 0.05 <= conf <= 0.95

    def test_different_winner_classes_affect_confidence(self, estimator):
        lc = estimator.estimate(self._peaked_proba("LEARN_CONCEPT"), "good answer")
        ca = estimator.estimate(self._peaked_proba("ASSESS"), "good answer")
        assert lc > 0.4
        assert ca > 0.4

    def test_not_constant_across_inputs(self, estimator):
        results = set()
        for eng, fru, pm in [(0.2, 0.8, 0.1), (0.8, 0.1, 0.4), (0.5, 0.3, 0.7)]:
            c = estimator.estimate(
                self._peaked_proba(), "answer",
                engagement_score=eng, frustration_score=fru, p_mastery=pm
            )
            results.add(c)
        assert len(results) > 1, "Confidence should vary with inputs"

class TestIntentResult:

    def _make_result(self, label: str) -> IntentResult:
        proba = {c: (0.9 if c == label else 0.1 / (len(CLASSES) - 1)) for c in CLASSES}
        return IntentResult(
            label=label,
            confidence=0.9,
            proba=proba,
            entropy=0.3,
            new_rules=[],
            active_rules=[],
        )

    @pytest.mark.parametrize("label", ["LEARN_CONCEPT", "ASSESS", "REVIEW"])
    def test_is_educational_true(self, label):
        result = self._make_result(label)
        assert result.is_educational()

    @pytest.mark.parametrize("label", ["INSTRUCTION", "META", "CASUAL", "EMOTIONAL"])
    def test_is_educational_false(self, label):
        result = self._make_result(label)
        assert not result.is_educational()

    def test_is_instruction_true(self):
        result = self._make_result("INSTRUCTION")
        assert result.is_instruction()

    def test_is_instruction_via_proba_threshold(self):
        proba = {c: 0.1 for c in CLASSES}
        proba["CASUAL"] = 0.35
        proba["INSTRUCTION"] = 0.32
        result = IntentResult(label="CASUAL", confidence=0.35, proba=proba,
                              entropy=1.5, new_rules=[], active_rules=[])
        assert result.is_instruction()

    @pytest.mark.parametrize("label", ["CASUAL", "META"])
    def test_is_casual_true(self, label):
        result = self._make_result(label)
        assert result.is_casual()

    def test_to_dict_has_required_keys(self):
        result = self._make_result("LEARN_CONCEPT")
        d = result.to_dict()
        assert "label" in d
        assert "confidence" in d
        assert "entropy" in d
        assert "proba" in d
        assert "active_rule_domains" in d

    def test_to_dict_proba_rounded(self):
        result = self._make_result("LEARN_CONCEPT")
        d = result.to_dict()
        for v in d["proba"].values():
            assert v == round(v, 4)

class TestCerbylIntentEngineClassify:

    def test_engine_loads_seed_vocab(self, engine_with_seed):
        assert len(engine_with_seed.classifier.vocab) > 50

    def test_engine_all_classes_have_examples(self, engine_with_seed):
        for cls in CLASSES:
            assert engine_with_seed.classifier.class_doc_counts[cls] > 0, \
                f"Class {cls} has 0 training examples in seed"

    @pytest.mark.parametrize("msg", [
        "explain gradient descent to me",
        "what is a neural network",
        "how does backpropagation work",
        "tell me about the transformer architecture",
        "what is the bias-variance tradeoff",
        "explain the central limit theorem",
        "how do convolutional neural networks work",
        "what is regularization in machine learning",
        "explain how RSA encryption works",
        "what is the vanishing gradient problem",
        "tell me how BERT pretraining works",
        "what does eigenvalue mean intuitively",
    ])
    def test_learn_concept_messages(self, engine_with_seed, msg):
        result = engine_with_seed.classify(msg, TEST_USER_ID)
        assert result.label == "LEARN_CONCEPT", \
            f"'{msg}' → got {result.label} (conf={result.confidence:.3f})"

    @pytest.mark.parametrize("msg", [
        "don't ask me questions anymore",
        "stop adding comprehension checks",
        "no more follow up questions please",
        "keep your answers short",
        "stop using bullet points",
        "please don't use emojis",
        "never end your response with a question",
        "from now on keep responses under 3 sentences",
        "i said no questions",
        "do you remember me telling you to not ask me questions",
        "no comprehension checks ever",
    ])
    def test_instruction_messages(self, engine_with_seed, msg):
        result = engine_with_seed.classify(msg, TEST_USER_ID)
        assert result.is_instruction(), \
            f"'{msg}' → got {result.label} (conf={result.confidence:.3f}), " \
            f"INSTRUCTION prob={result.proba.get('INSTRUCTION', 0):.3f}"

    @pytest.mark.parametrize("msg", [
        "do you remember what we talked about",
        "what did we cover last time",
        "earlier you said something about this",
        "where did we leave off",
        "what have we learned so far in this session",
    ])
    def test_meta_messages(self, engine_with_seed, msg):
        result = engine_with_seed.classify(msg, TEST_USER_ID)
        assert result.label == "META", \
            f"'{msg}' → got {result.label} (conf={result.confidence:.3f})"

    @pytest.mark.parametrize("msg", [
        "hi", "hello there", "hey", "ok", "thanks",
        "cool got it", "sounds good", "yo", "bruh", "lol ok",
    ])
    def test_casual_messages(self, engine_with_seed, msg):
        result = engine_with_seed.classify(msg, TEST_USER_ID)
        assert result.label == "CASUAL", \
            f"'{msg}' → got {result.label} (conf={result.confidence:.3f})"

    @pytest.mark.parametrize("msg", [
        "i don't get this at all",
        "ugh i give up",
        "this is so confusing",
        "i'm so lost",
        "i keep failing at this",
        "i'm stressed about my exam",
    ])
    def test_emotional_messages(self, engine_with_seed, msg):
        result = engine_with_seed.classify(msg, TEST_USER_ID)
        assert result.label == "EMOTIONAL", \
            f"'{msg}' → got {result.label} (conf={result.confidence:.3f})"

    @pytest.mark.parametrize("msg", [
        "quiz me on this",
        "give me some practice questions",
        "test my knowledge on this topic",
        "generate some MCQs about neural networks",
        "test me on gradient descent",
        "give me 5 questions on this",
    ])
    def test_assess_messages(self, engine_with_seed, msg):
        result = engine_with_seed.classify(msg, TEST_USER_ID)
        assert result.label == "ASSESS", \
            f"'{msg}' → got {result.label} (conf={result.confidence:.3f})"

    @pytest.mark.parametrize("msg", [
        "summarize what we covered",
        "give me a quick recap",
        "what are the key points from today",
        "what should i remember from this",
        "give me a summary of everything so far",
    ])
    def test_review_messages(self, engine_with_seed, msg):
        result = engine_with_seed.classify(msg, TEST_USER_ID)
        assert result.label == "REVIEW", \
            f"'{msg}' → got {result.label} (conf={result.confidence:.3f})"

    def test_result_has_all_class_probabilities(self, engine_with_seed):
        result = engine_with_seed.classify("explain backprop", TEST_USER_ID)
        assert set(result.proba.keys()) == set(CLASSES)

    def test_result_probabilities_sum_to_one(self, engine_with_seed):
        result = engine_with_seed.classify("explain backprop", TEST_USER_ID)
        assert abs(sum(result.proba.values()) - 1.0) < 1e-9

    def test_result_confidence_matches_label_proba(self, engine_with_seed):
        result = engine_with_seed.classify("explain backprop", TEST_USER_ID)
        assert result.confidence == pytest.approx(result.proba[result.label], abs=1e-6)

    def test_result_entropy_is_positive(self, engine_with_seed):
        result = engine_with_seed.classify("explain gradient descent", TEST_USER_ID)
        assert result.entropy > 0

    def test_instruction_result_captures_rules(self, engine_with_seed):
        result = engine_with_seed.classify("don't ask me questions anymore", TEST_USER_ID)
        assert any(r.domain == "questions" for r in result.new_rules)

    def test_non_instruction_has_empty_new_rules(self, engine_with_seed):
        result = engine_with_seed.classify("explain gradient descent to me", TEST_USER_ID)
        assert result.new_rules == []

    def test_active_rules_populated_after_instruction(self, engine_with_seed):
        engine_with_seed.classify("don't ask me questions anymore", TEST_USER_ID)
        result2 = engine_with_seed.classify("explain backprop", TEST_USER_ID)
        assert any(r.domain == "questions" for r in result2.active_rules)

class TestOnlineLearning:

    def test_record_signal_increments_train_count(self, engine_with_seed):
        before = engine_with_seed._train_count
        engine_with_seed.record_signal("hello there", "CASUAL")
        assert engine_with_seed._train_count == before + 1

    def test_record_signal_invalid_label_ignored(self, engine_with_seed):
        before = engine_with_seed._train_count
        engine_with_seed.record_signal("hello", "INVALID_CLASS")
        assert engine_with_seed._train_count == before

    def test_record_signal_shifts_prediction(self, engine_with_seed):
        unique_phrase = "zorgblatt frimble wumbo quux"
        for _ in range(15):
            engine_with_seed.record_signal(unique_phrase, "ASSESS", weight=2.0)
        result = engine_with_seed.classify(unique_phrase, TEST_USER_ID)
        assert result.label == "ASSESS"

    def test_instruction_online_update_strengthens_class(self, engine_with_seed):
        phrase = "totally unique instruction xylophone bloop"
        engine_with_seed.record_signal(phrase, "INSTRUCTION", weight=1.5)
        proba = engine_with_seed.classifier.predict_proba(phrase)
        assert engine_with_seed.classifier.class_word_counts["INSTRUCTION"].get("xylophone", 0) > 0

    def test_repeated_instructions_reinforce_memory(self, engine_with_seed):
        for _ in range(3):
            engine_with_seed.classify("don't ask me questions", TEST_USER_ID)
        rules = engine_with_seed.instruction_memory.active_rules(TEST_USER_ID)
        q_rule = next((r for r in rules if r.domain == "questions"), None)
        assert q_rule is not None
        assert q_rule.strength > 1.0

    def test_save_triggered_every_10_updates(self, engine_with_seed, tmp_path):
        state_path = tmp_path / "intent_state.json"
        with patch.object(type(engine_with_seed), '_save') as mock_save:
            engine_with_seed._train_count = 9
            engine_with_seed.record_signal("test phrase", "CASUAL")
            mock_save.assert_called_once()

    def test_save_not_triggered_before_10_updates(self, engine_with_seed):
        with patch.object(type(engine_with_seed), '_save') as mock_save:
            engine_with_seed._train_count = 5
            engine_with_seed.record_signal("test phrase", "CASUAL")
            mock_save.assert_not_called()

class TestConfidenceIntegration:

    def test_confidence_not_constant(self, engine_with_seed):
        inputs = [
            ("explain gradient descent", "detailed clear explanation of gradient descent"),
            ("hi", "Hello! How can I help you today?"),
            ("don't ask me questions", "Understood, I will not ask questions."),
        ]
        confidences = []
        for user_msg, response in inputs:
            result = engine_with_seed.classify(user_msg, TEST_USER_ID)
            conf = engine_with_seed.estimate_response_confidence(result, response)
            confidences.append(conf)
        assert len(set(confidences)) > 1, f"All confidences identical: {confidences}"

    def test_educational_query_gets_higher_confidence(self, engine_with_seed):
        learn_result = engine_with_seed.classify("explain the transformer architecture", TEST_USER_ID)
        learn_conf = engine_with_seed.estimate_response_confidence(
            learn_result,
            "The transformer uses self-attention to process sequences in parallel.",
            engagement_score=0.75,
            frustration_score=0.1,
            p_mastery=0.35,
        )
        casual_result = engine_with_seed.classify("hi", TEST_USER_ID)
        casual_conf = engine_with_seed.estimate_response_confidence(
            casual_result,
            "Hello! Great to see you.",
            engagement_score=0.3,
            frustration_score=0.0,
            p_mastery=0.1,
        )
        assert learn_conf > casual_conf

    def test_frustrated_user_lowers_confidence(self, engine_with_seed):
        result = engine_with_seed.classify("i don't get this at all", TEST_USER_ID)
        high_fru = engine_with_seed.estimate_response_confidence(
            result, "Here is an explanation.", frustration_score=0.9
        )
        low_fru = engine_with_seed.estimate_response_confidence(
            result, "Here is an explanation.", frustration_score=0.1
        )
        assert low_fru > high_fru

    def test_hedged_response_lower_confidence(self, engine_with_seed):
        result = engine_with_seed.classify("explain backprop", TEST_USER_ID)
        hedged = "It might possibly be roughly accurate, perhaps approximately correct."
        direct = "Backpropagation computes gradients via the chain rule applied layer by layer."
        c_hedged = engine_with_seed.estimate_response_confidence(result, hedged)
        c_direct = engine_with_seed.estimate_response_confidence(result, direct)
        assert c_direct >= c_hedged

    def test_confidence_always_in_valid_range(self, engine_with_seed):
        test_cases = [
            ("explain neural networks", "...", 0.8, 0.1, 0.3),
            ("hi", "Hello!", 0.2, 0.0, 0.05),
            ("i give up", "Take a break.", 0.1, 0.9, 0.1),
            ("quiz me", "Here are 5 questions:", 0.7, 0.2, 0.5),
            ("summarize", "Key points: ...", 0.6, 0.3, 0.7),
        ]
        for user_msg, response, eng, fru, mastery in test_cases:
            result = engine_with_seed.classify(user_msg, TEST_USER_ID)
            conf = engine_with_seed.estimate_response_confidence(
                result, response,
                engagement_score=eng, frustration_score=fru, p_mastery=mastery
            )
            assert 0.05 <= conf <= 0.95, \
                f"Confidence {conf} out of range for '{user_msg}'"

class TestPromptAddendum:

    def test_addendum_empty_with_no_rules(self, engine_with_seed):
        engine_with_seed.instruction_memory = InstructionMemory()
        assert engine_with_seed.to_prompt_addendum(TEST_USER_ID) == ""

    def test_addendum_contains_rule_domain(self, engine_with_seed):
        engine_with_seed.classify("don't ask me questions", TEST_USER_ID)
        addendum = engine_with_seed.to_prompt_addendum(TEST_USER_ID)
        assert "questions" in addendum

    def test_addendum_contains_never(self, engine_with_seed):
        engine_with_seed.classify("don't ask me questions", TEST_USER_ID)
        addendum = engine_with_seed.to_prompt_addendum(TEST_USER_ID)
        assert "NEVER" in addendum

    def test_addendum_contains_always_for_positive_rule(self, engine_with_seed):
        engine_with_seed.classify("always use examples when explaining", TEST_USER_ID)
        addendum = engine_with_seed.to_prompt_addendum(TEST_USER_ID)
        if addendum:
            assert "ALWAYS" in addendum

class TestSeedData:

    @pytest.fixture()
    def seed(self):
        seed_path = Path(__file__).parent.parent / "services" / "intent_seed.json"
        return json.loads(seed_path.read_text(encoding="utf-8"))

    def test_seed_file_exists(self):
        seed_path = Path(__file__).parent.parent / "services" / "intent_seed.json"
        assert seed_path.exists()

    def test_seed_has_examples(self, seed):
        assert len(seed["examples"]) >= 80

    def test_seed_all_classes_covered(self, seed):
        labels = {ex["label"] for ex in seed["examples"]}
        for cls in CLASSES:
            assert cls in labels, f"Class {cls} missing from seed data"

    def test_seed_no_unknown_labels(self, seed):
        for ex in seed["examples"]:
            assert ex["label"] in CLASSES, f"Unknown label: {ex['label']}"

    def test_seed_all_examples_have_text(self, seed):
        for ex in seed["examples"]:
            assert "text" in ex and len(ex["text"].strip()) > 0

    def test_seed_class_balance_reasonable(self, seed):
        from collections import Counter
        counts = Counter(ex["label"] for ex in seed["examples"])
        most_common = counts.most_common(1)[0][1]
        least_common = counts.most_common()[-1][1]
        ratio = most_common / least_common
        assert ratio < 5, f"Class imbalance too high: {counts}"

    def test_seed_weights_positive(self, seed):
        for ex in seed["examples"]:
            w = ex.get("weight", 1.0)
            assert w > 0, f"Non-positive weight in example: {ex}"

class TestPersistence:

    def test_serialise_deserialise_preserves_predictions(self, engine_with_seed):
        phrase = "explain gradient descent"
        label_before, conf_before = engine_with_seed.classifier.predict(phrase)
        state = engine_with_seed.classifier.serialize()

        nb2 = NaiveBayesClassifier(CLASSES)
        nb2.deserialize(state)
        label_after, conf_after = nb2.predict(phrase)

        assert label_before == label_after
        assert conf_before == pytest.approx(conf_after, abs=1e-9)

    def test_engine_save_and_load(self, engine_with_seed, tmp_path):
        from services.intent_engine import STATE_PATH
        saved_state_path = tmp_path / "intent_state.json"

        with patch("services.intent_engine.STATE_PATH", saved_state_path):
            engine_with_seed._save()
            assert saved_state_path.exists()
            saved = json.loads(saved_state_path.read_text())
            assert "classifier" in saved
            assert "instruction_rules" in saved
            assert "train_count" in saved

    def test_engine_load_preserves_train_count(self, engine_with_seed, tmp_path):
        from services.intent_engine import STATE_PATH
        saved_state_path = tmp_path / "intent_state.json"

        engine_with_seed._train_count = 42
        with patch("services.intent_engine.STATE_PATH", saved_state_path):
            engine_with_seed._save()
            saved = json.loads(saved_state_path.read_text())
            assert saved["train_count"] == 42

class TestEdgeCases:

    def test_empty_string(self, engine_with_seed):
        result = engine_with_seed.classify("", TEST_USER_ID)
        assert result.label in CLASSES
        assert abs(sum(result.proba.values()) - 1.0) < 1e-9

    def test_very_long_message(self, engine_with_seed):
        msg = "explain gradient descent " * 200
        result = engine_with_seed.classify(msg, TEST_USER_ID)
        assert result.label in CLASSES

    def test_all_numbers(self, engine_with_seed):
        result = engine_with_seed.classify("12345 67890 11111", TEST_USER_ID)
        assert result.label in CLASSES

    def test_special_characters(self, engine_with_seed):
        result = engine_with_seed.classify("!!! ??? ### @@@", TEST_USER_ID)
        assert result.label in CLASSES

    def test_repeated_word(self, engine_with_seed):
        result = engine_with_seed.classify("explain explain explain explain explain", TEST_USER_ID)
        assert result.label == "LEARN_CONCEPT"

    def test_mixed_case_instruction(self, engine_with_seed):
        result = engine_with_seed.classify("DON'T ASK ME QUESTIONS", TEST_USER_ID)
        assert result.is_instruction()

    def test_unicode_message(self, engine_with_seed):
        result = engine_with_seed.classify("αβγδ explain 神经网络 gradient descent", TEST_USER_ID)
        assert result.label in CLASSES

    def test_instruction_with_embedded_educational_content(self, engine_with_seed):
        result = engine_with_seed.classify(
            "don't ask me any more questions about gradient descent please", TEST_USER_ID
        )
        assert result.is_instruction()

    def test_message_starting_with_please(self, engine_with_seed):
        result = engine_with_seed.classify("please explain how transformers work", TEST_USER_ID)
        assert result.label == "LEARN_CONCEPT"

    def test_casual_with_question_mark(self, engine_with_seed):
        result = engine_with_seed.classify("ok?", TEST_USER_ID)
        assert result.label == "CASUAL"

    def test_confidence_estimate_with_zero_length_response(self, engine_with_seed):
        result = engine_with_seed.classify("explain backprop", TEST_USER_ID)
        conf = engine_with_seed.estimate_response_confidence(result, "")
        assert 0.05 <= conf <= 0.95

    def test_status_returns_dict(self, engine_with_seed):
        status = engine_with_seed.status()
        assert "ready" in status
        assert "vocab_size" in status
        assert status["vocab_size"] > 0
        assert status["classes"] == CLASSES

class TestAccuracyBenchmark:

    HELD_OUT = [
        ("can you walk me through how attention works in transformers", "LEARN_CONCEPT"),
        ("i need to understand the chain rule of calculus", "LEARN_CONCEPT"),
        ("what exactly is a pointer in C programming", "LEARN_CONCEPT"),
        ("break down how a decision tree splits data", "LEARN_CONCEPT"),
        ("what is the intuition behind support vector machines", "LEARN_CONCEPT"),
        ("explain the intuition behind L1 vs L2 regularization", "LEARN_CONCEPT"),
        ("how does dropout prevent overfitting", "LEARN_CONCEPT"),
        ("i really don't want you to quiz me at the end", "INSTRUCTION"),
        ("please stop using so many bullet points", "INSTRUCTION"),
        ("i need you to be more concise going forward", "INSTRUCTION"),
        ("no more questions at the end of your responses ok", "INSTRUCTION"),
        ("what were we talking about before", "META"),
        ("earlier in this conversation you explained something about this", "META"),
        ("can you recall what we discussed previously", "META"),
        ("alright", "CASUAL"),
        ("got it thanks", "CASUAL"),
        ("ok makes sense", "CASUAL"),
        ("nice one", "CASUAL"),
        ("lol ok", "CASUAL"),
        ("no matter how many times i read this it makes no sense", "EMOTIONAL"),
        ("i'm so stressed out about this topic", "EMOTIONAL"),
        ("why can't i just get this i keep messing up", "EMOTIONAL"),
        ("can you give me a few questions to test myself on this", "ASSESS"),
        ("i'd like to do a mock exam on this material", "ASSESS"),
        ("generate 3 hard questions about regularization", "ASSESS"),
        ("can you quickly run me through what we talked about", "REVIEW"),
        ("what are the most important things to take away from today", "REVIEW"),
        ("give me the highlights of everything we've covered", "REVIEW"),
    ]

    def test_held_out_accuracy(self, engine_with_seed):
        correct = 0
        failures = []
        for msg, expected in self.HELD_OUT:
            result = engine_with_seed.classify(msg, TEST_USER_ID)
            predicted = result.label if not result.is_instruction() else "INSTRUCTION"
            if predicted == expected:
                correct += 1
            else:
                failures.append((msg, expected, result.label, result.confidence))

        accuracy = correct / len(self.HELD_OUT)
        failure_summary = "\n".join(
            f"  '{m}' → expected {e}, got {p} ({c:.3f})"
            for m, e, p, c in failures
        )
        assert accuracy >= 0.85, (
            f"Accuracy {accuracy:.1%} below 85% threshold.\n"
            f"Failures ({len(failures)}/{len(self.HELD_OUT)}):\n{failure_summary}"
        )

    def test_instruction_detection_recall(self, engine_with_seed):
        instruction_cases = [
            "i really don't want you to quiz me at the end",
            "please stop using so many bullet points",
            "i need you to be more concise going forward",
            "no more questions at the end of your responses ok",
            "don't ask me anything after answering",
            "stop ending with questions",
        ]
        detected = sum(
            1 for msg in instruction_cases
            if engine_with_seed.classify(msg, TEST_USER_ID).is_instruction()
        )
        recall = detected / len(instruction_cases)
        assert recall >= 0.83, f"Instruction recall {recall:.1%} below 83%"

    def test_no_false_instruction_on_educational(self, engine_with_seed):
        educational = [
            "explain gradient descent",
            "what is a neural network",
            "how does backpropagation work",
            "tell me about transformers",
            "quiz me on regularization",
            "summarize the session",
        ]
        false_positives = [
            msg for msg in educational
            if engine_with_seed.classify(msg, TEST_USER_ID).label == "INSTRUCTION"
        ]
        assert len(false_positives) == 0, \
            f"False instruction detections: {false_positives}"
