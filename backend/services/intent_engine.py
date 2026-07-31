from __future__ import annotations

import json
import logging
import math
import re
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

CLASSES = ["LEARN_CONCEPT", "INSTRUCTION", "META", "CASUAL", "EMOTIONAL", "ASSESS", "REVIEW"]

SEED_PATH  = Path(__file__).parent / "intent_seed.json"
STATE_PATH = Path(__file__).parent / "intent_state.json"

HEDGING_WORDS = frozenset([
    "might", "possibly", "perhaps", "not sure", "could be", "i think",
    "approximately", "roughly", "generally", "usually", "sometimes",
    "uncertain", "unclear", "debatable", "arguably", "tends to", "may be",
    "it depends", "in some cases", "it's possible", "likely", "probably",
])

_IP: List[Tuple[re.Pattern, bool, str]] = [
    (re.compile(r"don'?t\s+ask",                    re.I), True,  "questions"),
    (re.compile(r"stop\s+asking",                   re.I), True,  "questions"),
    (re.compile(r"no\s+more\s+questions?",          re.I), True,  "questions"),
    (re.compile(r"no\s+comprehension\s+checks?",    re.I), True,  "questions"),
    (re.compile(r"don'?t\s+end\s+with\s+a\s+question", re.I), True, "questions"),
    (re.compile(r"don'?t\s+check\s+(in|up)\s+with", re.I), True, "questions"),
    (re.compile(r"(no|don'?t)\s+(use\s+)?emojis?", re.I), True,  "emojis"),
    (re.compile(r"stop\s+using\s+bullet",           re.I), True,  "bullets"),
    (re.compile(r"no\s+bullets?",                   re.I), True,  "bullets"),
    (re.compile(r"(be|keep it)\s+more\s+concise",   re.I), True,  "length"),
    (re.compile(r"keep\s+(it\s+)?short",            re.I), True,  "length"),
    (re.compile(r"shorter\s+answers?",              re.I), True,  "length"),
    (re.compile(r"don'?t\s+summar",                 re.I), True,  "summary"),
    (re.compile(r"no\s+summar",                     re.I), True,  "summary"),
    (re.compile(r"always\s+use\s+(code\s+)?examples?", re.I), False, "examples"),
    (re.compile(r"use\s+analogies",                 re.I), False, "analogies"),
    (re.compile(r"keep\s+it\s+(detailed|in.depth|thorough)", re.I), False, "depth"),
    (re.compile(r"always\s+explain\s+with",         re.I), False, "style"),
    (re.compile(r"don'?t\s+repeat\s+yourself",      re.I), True,  "repetition"),
    (re.compile(r"stop\s+repeating",                re.I), True,  "repetition"),
]

INSTRUCTION_SIGNALS = re.compile(
    r"\b(don'?t|do not|stop|no more|never|please don'?t|i told you|"
    r"remember (that )?i|keep your|be more|always|from now on|"
    r"i (don'?t|do not) want|i need you to|i said)\b",
    re.I,
)

META_SIGNALS = re.compile(
    r"\b(do you remember|what did we|earlier you|last time|our conversation|"
    r"you said|recall|prior|previous (session|conversation|message)|"
    r"what (is|was) my name|who am i|what do you know about me|"
    r"where did we leave off)\b",
    re.I,
)

@dataclass
class BehavioralRule:
    rule_id:        str
    raw_text:       str
    negated:        bool
    domain:         str
    strength:       float
    created_at:     float
    half_life_days: float = 7.0

    @property
    def current_strength(self) -> float:
        days = (time.time() - self.created_at) / 86400.0
        return self.strength * (0.5 ** (days / self.half_life_days))

    @property
    def is_active(self) -> bool:
        return self.current_strength > 0.05

class InstructionMemory:
    """Per-user store of behavioral rules ('don't use bullet points', etc).

    Keyed by user_id so one student's chat instructions never leak into
    another student's prompts -- this was previously a single shared dict.
    """

    def __init__(self):
        self._rules: Dict[int, Dict[str, BehavioralRule]] = {}

    def extract_and_store(self, user_id: int, text: str) -> List[BehavioralRule]:
        user_rules = self._rules.setdefault(user_id, {})
        new_rules: List[BehavioralRule] = []
        for pattern, negated, domain in _IP:
            if pattern.search(text):
                existing = next(
                    (r for r in user_rules.values()
                     if r.domain == domain and r.negated == negated),
                    None,
                )
                if existing:
                    existing.strength = min(existing.strength + 0.3, 2.0)
                    existing.created_at = time.time()
                    new_rules.append(existing)
                else:
                    rule = BehavioralRule(
                        rule_id=str(uuid.uuid4())[:8],
                        raw_text=text[:120],
                        negated=negated,
                        domain=domain,
                        strength=1.0,
                        created_at=time.time(),
                    )
                    user_rules[rule.rule_id] = rule
                    new_rules.append(rule)
        return new_rules

    def active_rules(self, user_id: int) -> List[BehavioralRule]:
        return [r for r in self._rules.get(user_id, {}).values() if r.is_active]

    def to_prompt_addendum(self, user_id: int) -> str:
        active = self.active_rules(user_id)
        if not active:
            return ""
        lines = []
        for r in sorted(active, key=lambda x: -x.current_strength):
            verb = "NEVER" if r.negated else "ALWAYS"
            lines.append(f"  [{verb} {r.domain}] strength={r.current_strength:.2f}")
        return "⚠ Behavioral rules (user-set, enforce strictly):\n" + "\n".join(lines)

    def serialize(self) -> Dict[str, List[dict]]:
        return {
            str(user_id): [asdict(r) for r in rules.values()]
            for user_id, rules in self._rules.items()
        }

    def deserialize(self, data) -> None:
        if not isinstance(data, dict):
            # Discard the old pre-fix format (a single flat list shared by
            # every user) -- there's no way to attribute those rules to the
            # right user, so starting empty is safer than misattributing them.
            return
        for user_id_str, rules in data.items():
            try:
                user_id = int(user_id_str)
            except (TypeError, ValueError):
                continue
            user_rules = self._rules.setdefault(user_id, {})
            for d in rules:
                r = BehavioralRule(**d)
                user_rules[r.rule_id] = r

class NaiveBayesClassifier:

    def __init__(self, classes: List[str], alpha: float = 1.0):
        self.classes = classes
        self.alpha   = alpha
        self.class_word_counts: Dict[str, Dict[str, float]] = {c: {} for c in classes}
        self.class_total_words: Dict[str, float]            = {c: 0.0  for c in classes}
        self.class_doc_counts:  Dict[str, float]            = {c: 0.0  for c in classes}
        self.vocab: set = set()

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        tokens  = re.findall(r"\b[a-z']{2,}\b", text.lower())
        bigrams = [f"{a}_{b}" for a, b in zip(tokens, tokens[1:])]
        return tokens + bigrams

    def partial_fit(self, text: str, label: str, weight: float = 1.0) -> None:
        tokens = self._tokenize(text)
        for tok in tokens:
            self.vocab.add(tok)
            self.class_word_counts[label][tok] = (
                self.class_word_counts[label].get(tok, 0.0) + weight
            )
            self.class_total_words[label] += weight
        self.class_doc_counts[label] += weight

    def predict_proba(self, text: str) -> Dict[str, float]:
        tokens     = self._tokenize(text)
        vocab_size = len(self.vocab) or 1
        total_docs = sum(self.class_doc_counts.values()) or 1

        log_scores: Dict[str, float] = {}
        for cls in self.classes:
            log_prior = math.log(
                (self.class_doc_counts[cls] + self.alpha)
                / (total_docs + self.alpha * len(self.classes))
            )
            denom = self.class_total_words[cls] + self.alpha * vocab_size
            log_lik = sum(
                math.log(
                    (self.class_word_counts[cls].get(tok, 0.0) + self.alpha) / denom
                )
                for tok in tokens
            ) if tokens else 0.0
            log_scores[cls] = log_prior + log_lik

        max_s   = max(log_scores.values())
        exp_s   = {c: math.exp(s - max_s) for c, s in log_scores.items()}
        tot_exp = sum(exp_s.values()) or 1.0
        return {c: v / tot_exp for c, v in exp_s.items()}

    def predict(self, text: str) -> Tuple[str, float]:
        proba = self.predict_proba(text)
        best  = max(proba, key=proba.__getitem__)
        return best, proba[best]

    def entropy(self, text: str) -> float:
        proba = self.predict_proba(text)
        return -sum(p * math.log(p + 1e-12) for p in proba.values())

    def serialize(self) -> dict:
        return {
            "class_word_counts": self.class_word_counts,
            "class_total_words": self.class_total_words,
            "class_doc_counts":  self.class_doc_counts,
            "vocab":             list(self.vocab),
        }

    def deserialize(self, data: dict) -> None:
        self.class_word_counts = {
            c: data["class_word_counts"].get(c, {}) for c in self.classes
        }
        self.class_total_words = {
            c: float(data["class_total_words"].get(c, 0.0)) for c in self.classes
        }
        self.class_doc_counts = {
            c: float(data["class_doc_counts"].get(c, 0.0)) for c in self.classes
        }
        self.vocab = set(data.get("vocab", []))

class ConfidenceEstimator:

    W = [0.35, 0.20, 0.20, 0.15, -0.10]
    B = -0.20
    PLATT_A = 2.5
    PLATT_B = 0.0

    @staticmethod
    def _sigmoid(x: float) -> float:
        return 1.0 / (1.0 + math.exp(-max(min(x, 20.0), -20.0)))

    @staticmethod
    def _hedging_density(text: str) -> float:
        words = text.lower().split()
        if not words:
            return 0.0
        hits = sum(1 for hw in HEDGING_WORDS if hw in text.lower())
        return min(hits / max(len(words) / 10, 1), 1.0)

    def estimate(
        self,
        proba:            Dict[str, float],
        response_text:    str,
        engagement_score: float = 0.5,
        frustration_score: float = 0.0,
        p_mastery:        float = 0.1,
    ) -> float:
        H       = -sum(p * math.log(p + 1e-12) for p in proba.values())
        H_max   = math.log(len(CLASSES))
        f0      = 1.0 - (H / H_max)

        f1      = 1.0 - frustration_score
        f2      = engagement_score
        f3      = max(0.0, 1.0 - abs(p_mastery - 0.4) * 1.5)
        f4      = self._hedging_density(response_text)

        features = [f0, f1, f2, f3, f4]
        logit    = sum(w * f for w, f in zip(self.W, features)) + self.B
        raw      = self._sigmoid(self.PLATT_A * logit + self.PLATT_B)
        return round(min(max(raw, 0.05), 0.95), 3)

@dataclass
class IntentResult:
    label:        str
    confidence:   float
    proba:        Dict[str, float]
    entropy:      float
    new_rules:    List[BehavioralRule]
    active_rules: List[BehavioralRule]

    def is_educational(self) -> bool:
        return self.label in ("LEARN_CONCEPT", "ASSESS", "REVIEW")

    def is_instruction(self) -> bool:
        return self.label == "INSTRUCTION" or self.proba.get("INSTRUCTION", 0) > 0.30

    def is_casual(self) -> bool:
        return self.label in ("CASUAL", "META")

    def to_dict(self) -> dict:
        return {
            "label":      self.label,
            "confidence": self.confidence,
            "entropy":    round(self.entropy, 4),
            "proba":      {k: round(v, 4) for k, v in self.proba.items()},
            "new_rules":  [asdict(r) for r in self.new_rules],
            "active_rule_domains": [r.domain for r in self.active_rules if r.is_active],
        }

class CerbylIntentEngine:

    _instance: Optional["CerbylIntentEngine"] = None

    def __init__(self):
        self.classifier           = NaiveBayesClassifier(CLASSES)
        self.instruction_memory   = InstructionMemory()
        self.confidence_estimator = ConfidenceEstimator()
        self._train_count         = 0
        self._ready               = False

    @classmethod
    def get(cls) -> "CerbylIntentEngine":
        if cls._instance is None:
            cls._instance = CerbylIntentEngine()
            cls._instance._load()
        return cls._instance

    def _load(self) -> None:
        try:
            seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
            for ex in seed.get("examples", []):
                self.classifier.partial_fit(
                    ex["text"], ex["label"], weight=ex.get("weight", 1.0)
                )
            logger.info(
                "[IntentEngine] Seed loaded: %d examples, %d classes, vocab=%d",
                len(seed.get("examples", [])),
                len(CLASSES),
                len(self.classifier.vocab),
            )
        except Exception as e:
            logger.warning("[IntentEngine] Seed load failed: %s", e)

        if STATE_PATH.exists():
            try:
                state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
                self.classifier.deserialize(state.get("classifier", {}))
                self.instruction_memory.deserialize(state.get("instruction_rules", []))
                self._train_count = state.get("train_count", 0)
                logger.info(
                    "[IntentEngine] State loaded (%d online updates)", self._train_count
                )
            except Exception as e:
                logger.warning("[IntentEngine] State load failed: %s", e)

        self._ready = True

    def _save(self) -> None:
        try:
            STATE_PATH.write_text(
                json.dumps(
                    {
                        "classifier":       self.classifier.serialize(),
                        "instruction_rules": self.instruction_memory.serialize(),
                        "train_count":      self._train_count,
                        "saved_at":         time.time(),
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
        except Exception as e:
            logger.warning("[IntentEngine] State save failed: %s", e)

    def classify(self, text: str, user_id: int) -> IntentResult:
        proba = self.classifier.predict_proba(text)
        label = max(proba, key=proba.__getitem__)
        H     = -sum(p * math.log(p + 1e-12) for p in proba.values())

        if INSTRUCTION_SIGNALS.search(text):
            proba["INSTRUCTION"] = max(proba["INSTRUCTION"], 0.40)
            if label not in ("INSTRUCTION",):
                total = sum(proba.values())
                proba = {c: v / total for c, v in proba.items()}
                label = max(proba, key=proba.__getitem__)

        if META_SIGNALS.search(text):
            proba["META"] = max(proba["META"], 0.45)
            total = sum(proba.values())
            proba = {c: v / total for c, v in proba.items()}
            label = max(proba, key=proba.__getitem__)

        new_rules: List[BehavioralRule] = []
        if label == "INSTRUCTION" or proba.get("INSTRUCTION", 0) > 0.28:
            new_rules = self.instruction_memory.extract_and_store(user_id, text)
            if new_rules:
                logger.info(
                    "[IntentEngine] Instruction captured: %s",
                    [r.domain for r in new_rules],
                )

        return IntentResult(
            label=label,
            confidence=proba[label],
            proba=proba,
            entropy=H,
            new_rules=new_rules,
            active_rules=self.instruction_memory.active_rules(user_id),
        )

    def estimate_response_confidence(
        self,
        result:           IntentResult,
        response_text:    str,
        engagement_score: float = 0.5,
        frustration_score: float = 0.0,
        p_mastery:        float = 0.1,
    ) -> float:
        return self.confidence_estimator.estimate(
            proba=result.proba,
            response_text=response_text,
            engagement_score=engagement_score,
            frustration_score=frustration_score,
            p_mastery=p_mastery,
        )

    def record_signal(self, text: str, label: str, weight: float = 1.0) -> None:
        if label not in CLASSES:
            return
        self.classifier.partial_fit(text, label, weight=weight)
        self._train_count += 1
        if self._train_count % 10 == 0:
            self._save()
        logger.debug(
            "[IntentEngine] Online update #%d: '%s' → %s (w=%.2f)",
            self._train_count, text[:40], label, weight,
        )

    def to_prompt_addendum(self, user_id: int) -> str:
        return self.instruction_memory.to_prompt_addendum(user_id)

    def status(self) -> dict:
        total_active_rules = sum(
            1
            for rules in self.instruction_memory._rules.values()
            for r in rules.values()
            if r.is_active
        )
        return {
            "ready":        self._ready,
            "train_count":  self._train_count,
            "vocab_size":   len(self.classifier.vocab),
            "active_rules": total_active_rules,
            "classes":      CLASSES,
        }
