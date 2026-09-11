import re
from typing import Optional

_GREETING_RE = [
    r"^(hi+|hello+|hey+|hiya|howdy|good\s*(morning|afternoon|evening|day))\b",
    r"^(what'?s\s*up|sup|yo+|hola+|hoi+|hai+|heya|ello|helo+)\b",
    r"^(greetings|salut|bonjour|namaste|ciao|hallo+)\b",
    r"^\W*(hi+|hello+|hey+|hola+)\W*$",
]

_JUNK_EXACT = frozenset({
    "hi", "hello", "hey", "yo", "sup", "what", "ok", "okay",
    "test", "testing", "lol", "hmm", "hm", "uh", "um",
    "new chat", "untitled", "chat", "session", "help", "bye",
    "thanks", "thank", "haha", "cool",
})

_STOP_WORDS = frozenset({
    "i", "me", "my", "we", "our", "you", "your", "he", "she", "it", "they",
    "a", "an", "the", "and", "or", "but", "so", "yet", "for", "nor",
    "in", "on", "at", "to", "by", "of", "up", "as", "is", "am", "are",
    "was", "were", "be", "been", "being", "have", "has", "had", "do",
    "does", "did", "will", "would", "could", "should", "may", "might",
    "shall", "can", "this", "that", "these", "those",
    "what", "which", "who", "whom", "whose", "how", "when", "where", "why",
    "not", "no", "yes", "just", "like", "get", "go", "let", "lets",
    "make", "come", "want", "work", "start", "begin", "new", "old",
    "good", "bad", "big", "small", "more", "less", "some", "any", "all",
    "each", "every", "both", "few", "many", "much", "most", "other",
    "such", "same", "then", "now", "here", "there",
    "with", "from", "into", "onto", "out", "about", "over", "after",
    "before", "between", "through", "during", "without",
    "really", "very", "too", "also", "still", "even", "back", "well",
    "please", "sure", "tell", "show", "help", "try", "put", "see",
    "look", "find", "give", "take", "use", "think", "feel", "say",
    "ask", "add", "keep", "hold", "turn", "move", "play", "run", "set",
    "need", "dare", "ok", "okay",
})

def is_valid_topic(text: str) -> bool:
    if not text:
        return False
    t = text.strip()
    if len(t) < 4:
        return False
    if re.match(r'^[\d\s\W]+$', t):
        return False

    t_low = t.lower()

    if any(re.search(p, t_low) for p in _GREETING_RE):
        return False

    words = t_low.split()
    if len(words) <= 2 and words[0] in _JUNK_EXACT:
        return False

    content_words = [w for w in words if w not in _STOP_WORDS and len(w) >= 4]
    return bool(content_words)

def clean_topic(text: str) -> Optional[str]:
    if not text:
        return None
    cleaned = re.sub(r'^[\s\-–—:,;|•]+|[\s\-–—:,;|•]+$', '', text.strip())
    return cleaned if cleaned else None


def is_placeholder_topic(value: str) -> bool:
    return str(value or "").strip().lower() in {
        "", "none", "null", "unknown", "n/a", "unclassified concept", "ai tutor mistake"
    }
