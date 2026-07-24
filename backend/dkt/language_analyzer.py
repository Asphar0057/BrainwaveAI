
from __future__ import annotations

import json
import logging
import os
import re
import threading
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

SIGNAL_PROTOTYPES: dict[str, list[str]] = {
    "confusion": [
        "I don't understand this at all",
        "I'm completely lost and confused",
        "This doesn't make any sense to me",
        "I can't figure out what you mean",
        "I have absolutely no idea what's happening",
        "I'm totally stuck on this concept",
        "This is going over my head",
        "I cannot grasp what you're saying",
        "Nothing is clicking for me here",
        "What does any of this mean?",
    ],
    "re_ask": [
        "Can you explain that again but differently",
        "I still don't understand even after your explanation",
        "Could you go over that one more time please",
        "I need you to explain this in a completely different way",
        "That explanation didn't help, try again",
        "Still not getting it, can you try another approach",
        "Can you repeat that with a different example",
        "I need another explanation of this",
    ],
    "doubt": [
        "So basically this means X is correct right",
        "Am I understanding this correctly",
        "Is that what you are saying",
        "Did I get that right",
        "Let me see if I understand this correctly",
        "Just to confirm what I think I understood",
        "So in other words what you mean is",
        "If I'm reading this right then",
        "So that means this is how it works right",
        "I think I understand but just checking",
        "Is my interpretation correct",
        "So to summarize what you said",
    ],
    "hesitation": [
        "I think maybe this is how it works but I'm not sure",
        "I'm not 100% certain but I believe the answer is",
        "Perhaps this is the right answer, not totally sure",
        "I might be wrong but I think",
        "I'm guessing but possibly",
        "Sort of getting it but not completely",
        "Kind of understand but not fully",
        "I believe it works this way but could be mistaken",
    ],
    "mastery": [
        "Oh I see, that makes perfect sense now",
        "I get it now completely, thank you",
        "That clicked for me, I understand it",
        "Got it, that makes total sense",
        "Now I understand how this works",
        "That explanation was clear, I understand",
        "Oh that's why it works that way",
        "Makes complete sense, I get it",
        "I finally understand this concept",
        "That cleared everything up for me",
    ],
    "extension": [
        "How does this apply to other situations",
        "I'm wondering how X connects to what we learned before",
        "Does this concept relate to other areas",
        "So is this similar to something else we covered",
        "How does this connect to that other concept",
        "What is the relationship between this and that",
        "Can this be applied in a different context",
        "Is there a connection between these two ideas",
    ],
}

SIGNAL_SCORE: dict[str, float] = {
    "confusion":        -0.75,
    "re_ask":           -0.70,
    "doubt":            -0.45,
    "hesitation":       -0.20,
    "neutral_question":  0.00,
    "neutral":           0.00,
    "extension":        +0.45,
    "mastery":          +0.65,
}

INSTRUCTIONAL_HINTS: dict[str, str] = {
    "confusion": (
        "Student is confused. Re-explain from scratch using a DIFFERENT approach — "
        "try an analogy or real-world example. Break into at most 3 numbered steps. "
        "End with ONE simple check question."
    ),
    "re_ask": (
        "Student asked to re-explain. Use a COMPLETELY different format — "
        "if you used abstract explanation before, switch to a concrete worked example. "
        "Be slower and more granular. Do not repeat the same wording."
    ),
    "doubt": (
        "Student is seeking confirmation. "
        "First, directly state whether they are right or wrong (one sentence). "
        "Then clarify what they got slightly wrong. Keep it short and reassuring."
    ),
    "hesitation": (
        "Student is uncertain but trying. Validate their reasoning first — "
        "tell them what they got right, then gently correct what is off. Be encouraging."
    ),
    "neutral_question": (
        "Answer the question clearly at the student's level. "
        "End with a brief comprehension check."
    ),
    "neutral": (
        "Answer the question clearly at the student's level. "
        "End with a brief comprehension check."
    ),
    "extension": (
        "Student is making connections — positive learning signal. "
        "Confirm or refine their connection, then deepen with one more layer. "
        "This student is ready to advance."
    ),
    "mastery": (
        "Student has understood. Acknowledge briefly (one sentence max). "
        "Do NOT re-explain. Introduce the next related concept or a harder application."
    ),
}

_OVERRIDES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"^\s*(got\s*it|makes?\s+sense|i\s+get\s+it|now\s+i\s+(get|understand)|that\s+clicked)[!\.]?\s*$", re.I), "mastery"),
    (re.compile(r"\b(explain|go\s+over)\s+(again|once\s+more|one\s+more\s+time)\b", re.I), "re_ask"),
    (re.compile(r"\bstill\s+don'?t\s+(get|understand)\b", re.I), "re_ask"),
    (re.compile(r"\bi'?m\s+(lost|confused|stuck)\b", re.I), "confusion"),
    (re.compile(r"\b(i|i'?m)\s+(really\s+|honestly\s+)*(struggle|struggling)\s+(with|on|in)\b", re.I), "confusion"),
    (re.compile(r"\b(i'?m|i\s+am)\s+(really\s+|honestly\s+)*(weak|bad|not\s+good|not\s+great)\s+(at|in|with)\b", re.I), "confusion"),
    (re.compile(r"\bwait[\s,]+what\b", re.I), "confusion"),
    (re.compile(r"\bso\s+basically\b.{0,60}\?", re.I), "doubt"),
    (re.compile(r"\b(is\s+that|am\s+i)\s+(right|correct)\s*\?", re.I), "doubt"),
]

STYLE_PROTOTYPES: dict[str, list[str]] = {
    "Exemplar": [
        "Can you give me a concrete example of that",
        "Show me an example please",
        "Give me more examples",
        "I learn better with examples",
        "Can you illustrate that with a real example",
        "I need to see this applied to something real",
        "What does this look like in practice",
        "Give me a worked example",
    ],
    "Cadence": [
        "Can you break that down step by step",
        "Walk me through this one step at a time",
        "Explain this more slowly in smaller steps",
        "Can you break it down for me",
        "Go through it step by step please",
        "I need this broken into smaller pieces",
        "Take it one step at a time",
    ],
    "Bridge": [
        "Can you give me an analogy for that",
        "What is this similar to in real life",
        "Is there a simpler way to think about this",
        "Compare this to something I already know",
        "What is this like in everyday terms",
        "Give me a real world comparison",
    ],
    "Axiom": [
        "Just give me the definition",
        "Explain the theory behind this",
        "What is the formal definition",
        "I want to understand the concept first",
        "Give me the technical explanation",
        "Explain it precisely without simplifying",
    ],
    "Catalyst": [
        "Ask me questions so I can figure it out",
        "Guide me to the answer with questions",
        "Help me think through this myself",
        "Ask me questions instead of telling me",
        "I want to work through this on my own with hints",
    ],
    "Forge": [
        "Give me a problem to solve",
        "Let me try a practice problem",
        "Show me a worked problem",
        "Give me a problem and walk through the solution",
        "I want to practice this with an actual problem",
        "Can we do a worked example problem",
    ],
}

_lock             = threading.Lock()
_model            = None
_proto_embeddings: dict[str, np.ndarray] = {}
_style_embeddings: dict[str, np.ndarray] = {}
_SIGNAL_THRESHOLD = 0.38
_STYLE_THRESHOLD  = 0.42

_GLOBAL_HEAD_PATH = os.path.join(os.path.dirname(__file__), "global_signal_head.npz")
_global_W: Optional[np.ndarray] = None
_global_b: Optional[np.ndarray] = None

def _load_global_head() -> None:
    global _global_W, _global_b
    if _global_W is not None or not os.path.exists(_GLOBAL_HEAD_PATH):
        return
    with _lock:
        if _global_W is not None:
            return
        try:
            data = np.load(_GLOBAL_HEAD_PATH)
            _global_W = data["W"].astype(np.float64)
            _global_b = data["b"].astype(np.float64)
            logger.info("[LANG] Global signal head loaded from checkpoint.")
        except Exception as e:
            logger.warning(f"[LANG] Could not load global head: {e}")

def _get_model():
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                try:
                    from sentence_transformers import SentenceTransformer
                    logger.info("[LANG] Loading all-MiniLM-L6-v2…")
                    _model = SentenceTransformer("all-MiniLM-L6-v2")
                    logger.info("[LANG] Model loaded.")
                except Exception as e:
                    logger.warning(f"[LANG] Could not load sentence-transformer: {e}")
    return _model

def _get_proto_embeddings() -> dict[str, np.ndarray]:
    global _proto_embeddings
    if _proto_embeddings:
        return _proto_embeddings
    m = _get_model()
    if m is None:
        return {}
    with _lock:
        if _proto_embeddings:
            return _proto_embeddings
        result = {}
        for sig, sentences in SIGNAL_PROTOTYPES.items():
            embs = m.encode(sentences, convert_to_numpy=True, normalize_embeddings=True)
            result[sig] = embs.mean(axis=0)
        _proto_embeddings = result
        logger.info(f"[LANG] Signal prototypes built for {len(result)} types.")
    return _proto_embeddings

def _get_style_embeddings() -> dict[str, np.ndarray]:
    global _style_embeddings
    if _style_embeddings:
        return _style_embeddings
    m = _get_model()
    if m is None:
        return {}
    with _lock:
        if _style_embeddings:
            return _style_embeddings
        result = {}
        for style, sentences in STYLE_PROTOTYPES.items():
            embs = m.encode(sentences, convert_to_numpy=True, normalize_embeddings=True)
            result[style] = embs.mean(axis=0)
        _style_embeddings = result
    return _style_embeddings

def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    d = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.dot(a, b) / d) if d > 0 else 0.0

def _embed(text: str) -> Optional[np.ndarray]:
    m = _get_model()
    if m is None:
        return None
    return m.encode([text], convert_to_numpy=True, normalize_embeddings=True)[0]

_SIGNAL_CLASSES = ["confusion", "re_ask", "doubt", "hesitation", "neutral", "extension", "mastery"]
_D_EMBED        = 384

class StudentSignalHead:

    def __init__(self):
        _load_global_head()
        if _global_W is not None:
            self.W         = _global_W.copy()
            self.b         = _global_b.copy()
            self.n_updates = 10
        else:
            self.W         = np.zeros((len(_SIGNAL_CLASSES), _D_EMBED), dtype=np.float64)
            self.b         = np.zeros(len(_SIGNAL_CLASSES), dtype=np.float64)
            self.n_updates = 0
        self.lr = 0.05

    def _softmax(self, z: np.ndarray) -> np.ndarray:
        e = np.exp(z - z.max())
        return e / (e.sum() + 1e-9)

    def predict(self, embedding: np.ndarray) -> tuple[str, float]:
        if self.n_updates < 10:
            return "neutral", 0.0
        logits = self.W @ embedding + self.b
        probs  = self._softmax(logits)
        idx    = int(np.argmax(probs))
        return _SIGNAL_CLASSES[idx], float(probs[idx])

    def blend_weight(self) -> float:
        return min(0.7, self.n_updates / 100.0)

    def update(self, embedding: np.ndarray, true_class: str):
        if true_class not in _SIGNAL_CLASSES:
            return
        y      = _SIGNAL_CLASSES.index(true_class)
        logits = self.W @ embedding + self.b
        probs  = self._softmax(logits)
        grad   = probs.copy()
        grad[y] -= 1.0
        self.W -= self.lr * np.outer(grad, embedding)
        self.b -= self.lr * grad
        self.n_updates += 1
        if self.n_updates % 25 == 0:
            self.lr = max(0.005, self.lr * 0.85)

    def to_dict(self) -> dict:
        return {"W": self.W.tolist(), "b": self.b.tolist(), "lr": self.lr, "n": self.n_updates}

    @classmethod
    def from_dict(cls, d: dict) -> "StudentSignalHead":
        h = cls()
        h.W        = np.array(d["W"], dtype=np.float64)
        h.b        = np.array(d["b"], dtype=np.float64)
        h.lr       = float(d.get("lr", 0.05))
        h.n_updates = int(d.get("n", 0))
        return h

def load_student_head(user_id: int, db) -> StudentSignalHead:
    try:
        from models import StudentStyleModel
        row = db.query(StudentStyleModel).filter(StudentStyleModel.user_id == user_id).first()
        if row and row.student_classifier_state:
            return StudentSignalHead.from_dict(json.loads(row.student_classifier_state))
    except Exception as e:
        logger.warning(f"[LANG] load_student_head failed for user={user_id}: {e}")
    return StudentSignalHead()

def save_student_head(user_id: int, head: StudentSignalHead, db):
    try:
        from models import StudentStyleModel
        from datetime import datetime, timezone
        row     = db.query(StudentStyleModel).filter(StudentStyleModel.user_id == user_id).first()
        payload = json.dumps(head.to_dict())
        now     = datetime.now(timezone.utc)
        if row:
            row.student_classifier_state = payload
            row.updated_at               = now
        else:
            db.add(StudentStyleModel(
                user_id                  = user_id,
                student_classifier_state = payload,
                updated_at               = now,
            ))
        db.commit()
    except Exception as e:
        logger.warning(f"[LANG] save_student_head failed for user={user_id}: {e}")

def update_student_head(
    user_id:    int,
    text:       str,
    true_class: str,
    db,
    embedding:  Optional[np.ndarray] = None,
):
    try:
        emb = embedding if embedding is not None else _embed(text)
        if emb is None:
            return
        head = load_student_head(user_id, db)
        head.update(emb, true_class)
        save_student_head(user_id, head, db)
        logger.debug(f"[LANG] Head updated user={user_id} class={true_class!r} n={head.n_updates}")
    except Exception as e:
        logger.warning(f"[LANG] update_student_head failed: {e}")

def _semantic_classify(
    text: str,
    embedding: Optional[np.ndarray] = None,
    user_head: Optional[StudentSignalHead] = None,
) -> tuple[str, float]:
    protos = _get_proto_embeddings()
    emb    = embedding if embedding is not None else _embed(text)
    if emb is None or not protos:
        return "neutral", 0.0

    best_base_signal = "neutral"
    best_base_sim    = _SIGNAL_THRESHOLD
    for sig, proto_emb in protos.items():
        sim = _cosine(emb, proto_emb)
        if sim > best_base_sim:
            best_base_sim    = sim
            best_base_signal = sig

    if user_head and user_head.n_updates >= 10:
        student_signal, student_conf = user_head.predict(emb)
        w = user_head.blend_weight()
        if student_conf > 0 and student_signal != "neutral":
            if student_signal == best_base_signal:
                return student_signal, min(1.0, best_base_sim * (1 + w))
            base_w = 1.0 - w
            if student_conf * w > best_base_sim * base_w and student_conf > _SIGNAL_THRESHOLD:
                return student_signal, student_conf * w

    return best_base_signal, best_base_sim

_STOPWORDS = {
    "a","an","the","is","are","was","were","be","been","being","have","has",
    "had","do","does","did","will","would","could","should","may","might",
    "of","in","on","at","to","for","from","by","with","about","into","it",
    "that","this","these","those","i","you","we","they","my","your","what",
    "how","why","when","where","which","who","if","but","and","or","so",
    "just","like","as","than","more","some","any","also","not","mean",
    "explain","tell","think","know","understand","make","use","get","see",
    "right","correct","wrong","good","bad","new","old","now","then","here",
    # Hedges/self-report words that describe the student's state rather than
    # the subject matter -- left in, these dominate the n-gram window and the
    # extractor picks e.g. "honestly really struggle" as the "concept" instead
    # of the actual topic the student named later in the same sentence.
    "honestly","really","struggle","struggling","definitely","actually",
    "totally","completely","kind","sort","weak","trouble","never","always",
}

def _match_concepts(text: str, vocab: dict[str, int]) -> list[str]:
    text_lower = text.lower()
    matches: list[str] = []
    for concept in sorted(vocab.keys(), key=len, reverse=True):
        if re.search(r"\b" + re.escape(concept) + r"\b", text_lower):
            matches.append(concept)
            if len(matches) >= 5:
                break
    return matches

def _extract_phrases(text: str, top_k: int = 3) -> list[str]:
    cleaned = re.sub(r"[^\w\s-]", " ", text.lower())
    words   = [w for w in cleaned.split() if w not in _STOPWORDS and len(w) > 2]
    seen, result = set(), []
    for n in range(3, 1, -1):
        for i in range(len(words) - n + 1):
            phrase = " ".join(words[i:i + n])
            if phrase not in seen:
                seen.add(phrase)
                result.append(phrase)
            if len(result) >= top_k:
                return result
    return result

def detect_explicit_style(text: str) -> Optional[str]:
    protos = _get_style_embeddings()
    emb    = _embed(text)
    if emb is None or not protos:
        return None
    best_style, best_sim = None, _STYLE_THRESHOLD
    for style, proto_emb in protos.items():
        sim = _cosine(emb, proto_emb)
        if sim > best_sim:
            best_sim  = sim
            best_style = style
    return best_style

@dataclass
class MessageAnalysis:
    text: str
    signal_type: str               = "neutral"
    knowledge_signal: float        = 0.0
    semantic_confidence: float     = 0.0
    matched_concepts: list[str]    = field(default_factory=list)
    primary_concept: Optional[str] = None
    instructional_hint: str        = ""
    is_negative: bool              = False
    is_positive: bool              = False
    classification_method: str     = "none"
    explicit_style: Optional[str]  = None
    embedding: Optional[np.ndarray] = field(default=None, repr=False)

    def to_dict(self) -> dict:
        return {
            "signal_type":           self.signal_type,
            "knowledge_signal":      round(self.knowledge_signal, 4),
            "semantic_confidence":   round(self.semantic_confidence, 4),
            "primary_concept":       self.primary_concept,
            "matched_concepts":      self.matched_concepts,
            "instructional_hint":    self.instructional_hint,
            "is_negative":           self.is_negative,
            "is_positive":           self.is_positive,
            "classification_method": self.classification_method,
            "explicit_style":        self.explicit_style,
        }

def analyze(
    text:    str,
    vocab:   Optional[dict[str, int]] = None,
    user_id: Optional[int]            = None,
    db                                = None,
) -> MessageAnalysis:
    if not text or not text.strip():
        return MessageAnalysis(text="")

    vocab    = vocab or {}
    concepts = _match_concepts(text, vocab) if vocab else _extract_phrases(text)
    primary  = concepts[0] if concepts else None

    user_head = None
    if user_id is not None and db is not None:
        try:
            user_head = load_student_head(user_id, db)
        except Exception:
            pass

    signal_type = "neutral"
    confidence  = 0.0
    method      = "fallback"
    embedding   = None

    for pattern, sig in _OVERRIDES:
        if pattern.search(text):
            signal_type = sig
            confidence  = 0.95
            method      = "regex_override"
            break

    if method == "fallback":
        embedding = _embed(text)
        sem_signal, sem_conf = _semantic_classify(text, embedding, user_head)

        if sem_signal != "neutral":
            signal_type = sem_signal
            confidence  = sem_conf
            method      = "semantic" if (user_head is None or user_head.n_updates < 10) else "student_adapted"
        elif text.rstrip().endswith("?"):
            signal_type = "neutral_question"
            method      = "fallback"

    _AUTO_CONF = 0.65
    if (user_head is not None
            and confidence >= _AUTO_CONF
            and signal_type not in ("neutral", "neutral_question")):
        try:
            emb_for_train = embedding if embedding is not None else _embed(text)
            if emb_for_train is not None:
                user_head.update(emb_for_train, signal_type)
                save_student_head(user_id, user_head, db)
        except Exception as e:
            logger.debug(f"[LANG] Auto-train failed: {e}")

    score          = SIGNAL_SCORE.get(signal_type, 0.0)
    hint           = INSTRUCTIONAL_HINTS.get(signal_type, INSTRUCTIONAL_HINTS["neutral"])
    explicit_style = detect_explicit_style(text)

    return MessageAnalysis(
        text                  = text,
        signal_type           = signal_type,
        knowledge_signal      = score,
        semantic_confidence   = confidence,
        matched_concepts      = concepts,
        primary_concept       = primary,
        instructional_hint    = hint,
        is_negative           = score < 0,
        is_positive           = score > 0,
        classification_method = method,
        explicit_style        = explicit_style,
        embedding             = embedding,
    )

def load_vocab_if_available() -> Optional[dict[str, int]]:
    try:
        from dkt.dataset import load_vocab
        return load_vocab()
    except Exception:
        return None
