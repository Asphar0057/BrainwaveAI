"""Utilities that keep PDF-derived flashcards grounded in document content."""

from __future__ import annotations

import re
from typing import Any


_META_CARD_PATTERNS = (
    re.compile(
        r"\b(?:main|primary|recommended)\s+(?:purpose|use)\b.*\b(?:notes?|document|pdf|file|material)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:team\s+leader|author|creator|owner)\b.*\b(?:notes?|document|pdf|file|material)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:notes?|document|pdf|file|source material)\b.*\b(?:about|for|used|purpose)\b",
        re.IGNORECASE,
    ),
)


def _normalize_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _strip_navigation_text(value: object) -> str:
    """Remove table-of-contents rows and page decorations from PDF extraction."""
    lines = str(value or "").splitlines()
    for index, raw_line in enumerate(lines):
        if raw_line.strip().lower() in {"contents", "table of contents"}:
            # A title page before a contents section is document metadata, not
            # flashcard material. Start after it so the first excerpt is lesson text.
            lines = lines[index + 1 :]
            break

    filtered_lines: list[str] = []
    for raw_line in lines:
        line = raw_line.strip()
        lower = line.lower()
        if (
            not line
            or lower in {"contents", "table of contents", "index"}
            or line.startswith(("|", "+"))
            or re.fullmatch(r"[.\-_=~|+ ]+", line)
            or re.fullmatch(r"\d{1,4}", line)
        ):
            continue
        filtered_lines.append(line)
    return "\n".join(filtered_lines)


def _is_study_text(block: str) -> bool:
    words = re.findall(r"[A-Za-z][A-Za-z'-]*", block)
    if len(words) < 24:
        return False
    # A repeated title/header can be long enough to look like content. It has
    # very little vocabulary, unlike an explanatory paragraph.
    if len(words) >= 30 and len({word.lower() for word in words}) <= 5:
        return False
    letters = sum(char.isalpha() for char in block)
    return letters >= len(block) * 0.35


def _chunk_sentences(text: str, target_size: int) -> list[str]:
    def split_long_sentence(sentence: str) -> list[str]:
        if len(sentence) <= target_size:
            return [sentence]
        pieces: list[str] = []
        current_words: list[str] = []
        current_size = 0
        for word in sentence.split():
            if current_words and current_size + len(word) + 1 > target_size:
                pieces.append(" ".join(current_words))
                current_words = []
                current_size = 0
            current_words.append(word)
            current_size += len(word) + 1
        if current_words:
            pieces.append(" ".join(current_words))
        return pieces

    sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", text)
    chunks: list[str] = []
    current: list[str] = []
    current_size = 0

    for sentence in sentences:
        sentence = _normalize_text(sentence)
        if not sentence:
            continue
        for piece in split_long_sentence(sentence):
            if current and current_size + len(piece) + 1 > target_size:
                chunk = " ".join(current).strip()
                if _is_study_text(chunk):
                    chunks.append(chunk)
                current = []
                current_size = 0
            current.append(piece)
            current_size += len(piece) + 1

    if current:
        chunk = " ".join(current).strip()
        if _is_study_text(chunk):
            chunks.append(chunk)

    return chunks


def build_document_flashcard_source(content: object, max_chars: int = 18000) -> str:
    """Return representative, meaningful excerpts from a PDF's extracted text.

    PDF cover pages and repeated headers often occupy the beginning of extracted text.
    Sampling evenly across meaningful sentence chunks gives the model actual study content
    rather than letting it construct cards from a filename or cover-page metadata.
    """
    text = _normalize_text(_strip_navigation_text(content))
    # PDF extractors often repeat a short page header on every page. Collapse
    # three or more consecutive copies before creating excerpts.
    text = re.sub(
        r"\b((?:[A-Za-z][A-Za-z'-]*\s+){1,5}[A-Za-z][A-Za-z'-]*)(?:\s+\1){2,}\b",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = _normalize_text(text)
    if not text:
        return ""

    max_chars = max(2_000, int(max_chars))
    target_chunk_size = 2_000
    chunks = _chunk_sentences(text, target_chunk_size)
    if not chunks:
        return text[:max_chars]

    joined = "\n\n".join(chunks)
    if len(joined) <= max_chars:
        selected = chunks
    else:
        excerpt_count = min(len(chunks), max(4, min(9, max_chars // target_chunk_size)))
        if excerpt_count == 1:
            indexes = [0]
        else:
            indexes = [
                round(index * (len(chunks) - 1) / (excerpt_count - 1))
                for index in range(excerpt_count)
            ]
        selected = [chunks[index] for index in dict.fromkeys(indexes)]

    excerpts: list[str] = []
    used = 0
    for number, chunk in enumerate(selected, start=1):
        block = f"[Study excerpt {number}]\n{chunk}"
        remaining = max_chars - used
        if remaining < 250:
            break
        if len(block) > remaining:
            block = block[:remaining].rsplit(" ", 1)[0]
        excerpts.append(block)
        used += len(block) + 2

    return "\n\n".join(excerpts).strip()


def is_metadata_flashcard(card: dict[str, Any]) -> bool:
    question = _normalize_text(card.get("question") or card.get("front"))
    return bool(question) and any(pattern.search(question) for pattern in _META_CARD_PATTERNS)


def has_low_document_card_quality(cards: list[dict[str, Any]]) -> bool:
    """Reject sets that test a file's metadata rather than its study material."""
    valid_cards = [card for card in cards if isinstance(card, dict)]
    if not valid_cards:
        return True

    metadata_cards = sum(is_metadata_flashcard(card) for card in valid_cards)
    if metadata_cards:
        return True

    unique_questions = {
        _normalize_text(card.get("question") or card.get("front")).lower()
        for card in valid_cards
    }
    return len(unique_questions) < max(1, len(valid_cards) - 1)
