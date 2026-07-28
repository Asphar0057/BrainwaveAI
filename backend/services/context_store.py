
from __future__ import annotations

import logging
import math
import re
from datetime import datetime, timezone
from typing import List, Optional

from services import redis_cache
from services import vector_store as vs

logger = logging.getLogger(__name__)

HS_CURRICULUM_COLLECTION = "hs_curriculum"

_SUBJECT_ALIASES: list[tuple[str, list[str]]] = [
    ("US History", ["us history", "u.s. history", "us hist", "ush", "american history"]),
    ("World History", ["world history", "world hist"]),
    ("History", ["history", "hist"]),
    ("Pre-Calculus", ["precalculus", "pre-calc", "pre calc", "precalc", "pre calculus"]),
    ("Calculus", ["calculus", "calc", "differential equations", "multivariable"]),
    ("Statistics", ["statistics", "stats", "stat", "probability"]),
    ("Algebra", ["algebra", "alg", "prealgebra", "pre-algebra", "intermediate algebra", "elementary algebra"]),
    ("Mathematics", ["mathematics", "math", "discrete math", "linear algebra"]),
    ("Geometry", ["geometry", "geom"]),
    ("Biology", ["biology", "bio", "microbiology", "genetics", "cell biology"]),
    ("Chemistry", ["chemistry", "chem", "organic chemistry", "biochemistry"]),
    ("Physics", ["physics", "phys", "mechanics", "thermodynamics", "electromagnetism"]),
    ("Astronomy", ["astronomy", "astrophysics", "cosmology"]),
    ("Earth Science", ["earth science", "geology", "geoscience", "geosci", "geography"]),
    ("Environmental Science", ["environmental science", "environmental", "env sci", "environ", "ecology"]),
    ("Anatomy", ["anatomy", "physiology", "anatomy and physiology", "nursing", "pharmacology"]),
    ("Psychology", ["psychology", "psych", "cognitive", "behavioral", "lifespan development"]),
    ("Sociology", ["sociology", "socio", "anthropology", "social science", "ethnic studies"]),
    ("Economics", ["economics", "econ", "accounting", "business", "finance", "management", "marketing", "entrepreneurship"]),
    ("Government", ["government", "gov", "civics", "political science", "politics"]),
    ("English", ["english", "ela", "literature", "lit", "language arts", "writing", "composition"]),
    ("Computer Science", ["computer science", "cs", "programming", "coding", "software"]),
    ("Philosophy", ["philosophy", "ethics", "logic", "critical thinking"]),
]

_KNOWN_SUBJECTS = {canon for canon, _ in _SUBJECT_ALIASES}

_STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "at", "by",
    "from", "about", "as", "is", "are", "was", "were", "be", "been", "being",
    "i", "you", "he", "she", "it", "they", "them", "we", "me", "my", "your", "our", "their",
    "this", "that", "these", "those", "what", "why", "how", "when", "where", "which",
    "do", "does", "did", "can", "could", "should", "would", "will", "just", "need", "want",
    "help", "explain", "again", "please",
}

def _normalize_subject_text(text: str) -> str:
    return re.sub(r"[_\-\/]+", " ", (text or "").lower()).strip()

def _matches_alias(text: str, alias: str) -> bool:
    if not text or not alias:
        return False
    if " " in alias:
        return alias in text
    return re.search(rf"\b{re.escape(alias)}\b", text) is not None

def canonicalize_subject(subject: str) -> str:
    if not subject:
        return ""
    text = _normalize_subject_text(subject)
    for canonical, aliases in _SUBJECT_ALIASES:
        if _matches_alias(text, canonical.lower()):
            return canonical
        for alias in aliases:
            if _matches_alias(text, alias):
                return canonical
    return subject.strip()

def infer_subject(text: str, default: str = "") -> str:
    if not text:
        return default
    normalized = _normalize_subject_text(text)
    for canonical, aliases in _SUBJECT_ALIASES:
        for alias in aliases + [canonical.lower()]:
            if _matches_alias(normalized, alias):
                return canonical
    return default

def _keyword_tokens(text: str) -> set[str]:
    tokens = re.findall(r"[a-zA-Z0-9]+", (text or "").lower())
    return {t for t in tokens if len(t) > 2 and t not in _STOPWORDS}

def _tokenize_list(text: str) -> list[str]:
    tokens = re.findall(r"[a-zA-Z0-9]+", (text or "").lower())
    return [t for t in tokens if len(t) > 2 and t not in _STOPWORDS]

def _overlap_ratio(query_tokens: set[str], doc_text: str) -> float:
    if not query_tokens:
        return 0.0
    doc_tokens = _keyword_tokens(doc_text)
    if not doc_tokens:
        return 0.0
    return len(query_tokens & doc_tokens) / max(1, len(query_tokens))

def _bm25_scores(query_tokens: list[str], corpus: list[str], k1: float = 1.5, b: float = 0.75) -> list[float]:
    if not query_tokens or not corpus:
        return [0.0] * len(corpus)
    tokenized = [_tokenize_list(doc) for doc in corpus]
    dl = [len(t) for t in tokenized]
    avgdl = sum(dl) / max(1, len(dl))
    N = len(corpus)
    scores: list[float] = []
    for i, doc_tokens in enumerate(tokenized):
        freq: dict[str, int] = {}
        for t in doc_tokens:
            freq[t] = freq.get(t, 0) + 1
        score = 0.0
        for term in query_tokens:
            df = sum(1 for dt in tokenized if term in dt)
            if df == 0:
                continue
            idf = math.log((N - df + 0.5) / (df + 0.5) + 1.0)
            tf = freq.get(term, 0)
            score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl[i] / max(1, avgdl)))
        scores.append(score)
    return scores

def _chunk_index(metadata: dict) -> int:
    raw = str((metadata or {}).get("chunk_index", "0")).strip()
    return int(raw) if raw.isdigit() else 0

def _spread_rows(rows: list[dict], limit: int) -> list[dict]:
    if limit <= 0 or len(rows) <= limit:
        return rows[:limit] if limit > 0 else []
    if limit == 1:
        return [rows[0]]
    step = (len(rows) - 1) / (limit - 1)
    selected: list[dict] = []
    seen: set[int] = set()
    for i in range(limit):
        idx = round(i * step)
        if idx in seen:
            continue
        seen.add(idx)
        selected.append(rows[idx])
    return selected

def initialize(*args, **kwargs):
    pass

def available() -> bool:
    return vs.available()

def add_document_chunks(
    user_id: str,
    doc_id: str,
    filename: str,
    chunks: list[str],
    subject: str = "",
    grade_level: str = "",
    scope: str = "private",
    source_url: str = "",
    source_name: str = "",
    license: str = "",
    replace_existing: bool = False,
    chunk_pages: list[dict] | None = None,
    curriculum: str = "",
    source_type: str = "",
    book_title: str = "",
) -> int:
    if not available():
        raise RuntimeError("context_store not initialized")
    if not chunks:
        raise ValueError("No chunks provided")

    timestamp = datetime.now(timezone.utc).isoformat()
    clean_subject = canonicalize_subject(subject) if subject else ""
    clean_grade = (grade_level or "").strip()
    clean_book_title = (book_title or filename.replace(".pdf", "").replace(".txt", "").replace(".md", "")).strip()[:200]
    cleaned_chunks = [c.strip() for c in chunks if c and c.strip()]
    if not cleaned_chunks:
        raise ValueError("No non-empty chunks provided")

    def _encode_chunks(payload: list[str]) -> list[list[float]]:
        try:
            from services.vector_store import _embed_model
            vectors = _embed_model.encode(payload, batch_size=32, show_progress_bar=False)
        except TypeError:
            from services.vector_store import _embed_model
            vectors = _embed_model.encode(payload)
        if hasattr(vectors, "tolist"):
            vectors = vectors.tolist()
        out: list[list[float]] = []
        for vector in vectors:
            out.append(vector.tolist() if hasattr(vector, "tolist") else list(vector))
        return out

    embeddings = _encode_chunks(cleaned_chunks)

    def _write_to(col_name: str, uid: Optional[str]) -> int:
        if replace_existing:
            try:
                vs.delete(col_name, doc_id=doc_id, user_id=uid)
            except Exception as e:
                logger.warning(f"replace_existing delete failed for {doc_id} in {col_name}: {e}")

        rows = []
        for i, chunk in enumerate(cleaned_chunks):
            meta: dict = {
                "doc_id": doc_id,
                "filename": filename[:200],
                "book_title": clean_book_title,
                "subject": clean_subject[:100] if clean_subject else "",
                "grade_level": clean_grade[:50] if clean_grade else "",
                "scope": scope,
                "user_id": str(user_id),
                "chunk_index": str(i),
                "page_number": "",
                "page_start": "",
                "page_end": "",
                "source_url": source_url[:300] if source_url else "",
                "source_name": source_name[:120] if source_name else "",
                "license": license[:60] if license else "",
                "curriculum": curriculum[:20] if curriculum else "",
                "source_type": source_type[:40] if source_type else "",
                "timestamp": timestamp,
            }
            if chunk_pages and i < len(chunk_pages):
                pg = chunk_pages[i]
                meta["page_number"] = str(pg.get("page_label") or pg.get("page_start") or "")
                meta["page_start"] = str(pg.get("page_start") or "")
                meta["page_end"] = str(pg.get("page_end") or "")
            rows.append({
                "id": f"{doc_id}_{i}",
                "collection": col_name,
                "user_id": uid,
                "content": chunk,
                "embedding": embeddings[i],
                "metadata": meta,
            })

        inserted = vs.bulk_upsert(rows)
        return inserted

    stored = _write_to("user_docs", str(user_id))

    if scope == "hs_shared":
        try:
            _write_to(HS_CURRICULUM_COLLECTION, None)
        except Exception as e:
            logger.warning(f"HS curriculum write failed for doc {doc_id}: {e}")

    try:
        redis_cache.invalidate_user_search(str(user_id))
    except Exception:
        pass

    return stored

def search_context(
    query: str,
    user_id: str,
    use_hs: bool = True,
    top_k: int = 5,
    subject: Optional[str] = None,
    grade_level: Optional[str] = None,
    curriculum: Optional[str] = None,
    doc_ids: Optional[List[str]] = None,
) -> list[dict]:
    if not available():
        return []

    normalized_doc_ids = None
    if doc_ids:
        normalized_doc_ids = sorted({str(d).strip() for d in doc_ids if str(d).strip()})

    _cache_kwargs = dict(
        use_hs=use_hs, top_k=top_k,
        subject=subject or "", grade_level=grade_level or "", curriculum=curriculum or "",
        doc_ids=",".join(normalized_doc_ids or []),
    )
    cached = redis_cache.get_search(query, user_id, **_cache_kwargs)
    if cached is not None:
        return cached

    query_embedding: list[float] | None = redis_cache.get_embedding(query)
    if query_embedding is None:
        try:
            query_embedding = vs.embed(query)
            redis_cache.set_embedding(query, query_embedding)
        except Exception as e:
            logger.warning(f"Query embedding failed: {e}")
            return []

    results: list[dict] = []
    seen_keys: set[str] = set()

    query_tokens = _keyword_tokens(query)
    query_token_list = _tokenize_list(query)
    subject_filter = canonicalize_subject(subject) if subject else ""
    if subject_filter not in _KNOWN_SUBJECTS:
        subject_filter = ""
    if not subject_filter:
        inferred = infer_subject(query, default="")
        subject_filter = inferred if inferred in _KNOWN_SUBJECTS else ""
    if subject_filter == "General":
        subject_filter = ""
    grade_filter = (grade_level or "").strip()

    overlap_boost = 0.20
    bm25_boost    = 0.18
    subject_boost = 0.05

    def _fetch_from(
        col_name: str,
        source_label: str,
        uid: Optional[str],
        where: Optional[dict],
        n_multiplier: int = 2,
        n_override: Optional[int] = None,
        fallback_on_empty_where: bool = True,
    ):
        try:
            n = max(int(n_override or 0), top_k) if n_override else max(top_k * n_multiplier, top_k)
            rows = vs.search(col_name, query_embedding, n, user_id=uid, where=where)
            if not rows and where and fallback_on_empty_where:
                rows = vs.search(col_name, query_embedding, n, user_id=uid, where=None)

            for r in rows:
                meta = r["metadata"] or {}
                key = f"{meta.get('doc_id', '')}_{meta.get('chunk_index', '')}"
                if key not in seen_keys:
                    seen_keys.add(key)
                    overlap = _overlap_ratio(query_tokens, r["content"])
                    subject_match = (
                        bool(subject_filter)
                        and canonicalize_subject(meta.get("subject", "")) == subject_filter
                    )
                    results.append({
                        "text": r["content"],
                        "metadata": meta,
                        "source": source_label,
                        "distance": r["distance"],
                        "_overlap": overlap,
                        "_subject_match": subject_match,
                    })
        except Exception as e:
            logger.warning(f"context_store search failed for {col_name}: {e}")

    if normalized_doc_ids:
        per_doc_k = max(4, min(12, top_k * 2))
        for doc_id in normalized_doc_ids:
            _fetch_from(
                "user_docs",
                "private",
                str(user_id),
                {"doc_id": doc_id},
                n_multiplier=1,
                n_override=per_doc_k,
                fallback_on_empty_where=False,
            )
    else:
        _fetch_from("user_docs", "private", str(user_id), None, n_multiplier=2)

    if use_hs and not normalized_doc_ids:
        hs_where: dict = {}
        if subject_filter:
            hs_where["subject"] = subject_filter
        if grade_filter:
            hs_where["grade_level"] = grade_filter
        if curriculum:
            hs_where["curriculum"] = curriculum.strip().lower()[:20]
        if len(hs_where) > 1:
            hs_where = {"$and": [{k: v} for k, v in hs_where.items()]}
        _fetch_from(HS_CURRICULUM_COLLECTION, "hs", None, hs_where or None, n_multiplier=4)

    if query_token_list and results:
        corpus = [r["text"] for r in results]
        bm25 = _bm25_scores(query_token_list, corpus)
        max_bm25 = max(bm25) if bm25 else 1.0
        for i, r in enumerate(results):
            r["_bm25"] = bm25[i] / max(max_bm25, 1e-9)

    def _score(item: dict) -> float:
        score = item.get("distance", 1.0)
        if query_tokens:
            score -= overlap_boost * item.get("_overlap", 0.0)
        if query_token_list:
            score -= bm25_boost * item.get("_bm25", 0.0)
        if item.get("_subject_match"):
            score -= subject_boost
        return score

    ranked = sorted(results, key=_score)
    if query_tokens:
        with_overlap = [r for r in ranked if r.get("_overlap", 0.0) > 0.0]
        if len(with_overlap) >= top_k:
            ranked = with_overlap

    if normalized_doc_ids:
        ranked = [r for r in ranked if r.get("metadata", {}).get("doc_id") in normalized_doc_ids]

    cleaned = [{k: v for k, v in r.items() if not k.startswith("_")} for r in ranked[:top_k]]

    try:
        redis_cache.set_search(query, user_id, cleaned, **_cache_kwargs)
    except Exception:
        pass

    return cleaned

def get_document_chunks(
    user_id: str,
    doc_ids: list[str],
    max_chunks_per_doc: int = 10,
    max_chars_per_chunk: int = 1800,
) -> list[dict]:
    if not available():
        return []

    normalized_doc_ids = [str(d).strip() for d in (doc_ids or []) if str(d).strip()]
    if not normalized_doc_ids:
        return []

    chunks: list[dict] = []
    seen_docs: set[str] = set()
    for doc_id in normalized_doc_ids:
        if doc_id in seen_docs:
            continue
        seen_docs.add(doc_id)
        try:
            rows = vs.get_by_metadata("user_docs", {"doc_id": doc_id}, user_id=str(user_id))
        except Exception as e:
            logger.warning(f"get_document_chunks failed for doc_id={doc_id}: {e}")
            rows = []
        if not rows:
            continue

        rows.sort(key=lambda r: _chunk_index(r.get("metadata") or {}))
        for row in _spread_rows(rows, max(1, int(max_chunks_per_doc or 10))):
            text = (row.get("content") or "").strip()
            if not text:
                continue
            if max_chars_per_chunk and len(text) > max_chars_per_chunk:
                text = text[:max_chars_per_chunk].rsplit(" ", 1)[0].strip()
            metadata = row.get("metadata") or {}
            chunks.append({
                "text": text,
                "metadata": metadata,
                "source": "private",
                "distance": 0.0,
            })
    return chunks

def source_label(source: str) -> str:
    """Human-readable label for a retrieved chunk's origin, matching /api/context/ask's wording."""
    return "Community Curriculum" if source == "hs" else "Your Notes"

def build_rag_sources(results: list[dict]) -> list[dict]:
    """Turn search_context()/get_document_chunks() results into numbered citation
    metadata: {index, text, filename, book_title, page, subject, source_label}.
    Mirrors the citation fields routes/context.py's /ask endpoint already builds,
    so every RAG-consuming graph can cite the same book_title/page info."""
    sources = []
    for i, r in enumerate(results, start=1):
        meta = r.get("metadata") or {}
        filename = meta.get("filename") or meta.get("book_title") or "Unknown"
        book_title = meta.get("book_title") or filename
        page = meta.get("page_number") or meta.get("page_start") or ""
        sources.append({
            "index": i,
            "text": r.get("text", ""),
            "filename": filename,
            "book_title": book_title,
            "page": page,
            "subject": meta.get("subject", ""),
            "source_label": source_label(r.get("source", "private")),
        })
    return sources

def format_rag_sources_block(rag_sources: list[dict], max_sources: int = 5, max_chars: int = 800) -> str:
    """Render rag_sources (from build_rag_sources) as numbered excerpts for a prompt:
    '[1] Book Title, p.X (label)\\n<excerpt text>'."""
    blocks = []
    for s in rag_sources[:max_sources]:
        page_str = f", p.{s['page']}" if s.get("page") else ""
        blocks.append(
            f"[{s.get('index')}] {s.get('book_title', 'Unknown')}{page_str} ({s.get('source_label', 'Your Notes')})\n"
            f"{str(s.get('text', ''))[:max_chars]}"
        )
    return "\n\n".join(blocks)

import re as _re
_CITATION_MARKER_RE = _re.compile(r"\[(\d+)\]")

def resolve_citations(text: str, rag_sources: list[dict]) -> str:
    """If text uses [n] citation markers referencing rag_sources, append a resolved
    '(Source: book, p.X)' suffix so the citation is human-readable without the reader
    needing the numbered source list. No-op if there are no markers or no sources."""
    if not text or not rag_sources:
        return text
    used = sorted({int(m) for m in _CITATION_MARKER_RE.findall(text)})
    if not used:
        return text
    by_index = {s["index"]: s for s in rag_sources}
    parts = []
    for i in used:
        src = by_index.get(i)
        if not src:
            continue
        page_str = f", p.{src['page']}" if src.get("page") else ""
        label = f"{src.get('book_title', 'Unknown')}{page_str}"
        if label not in text:
            parts.append(label)
    if not parts:
        return text
    return f"{text} (Source: {'; '.join(parts)})"

def list_user_docs(user_id: str) -> list[dict]:
    if not available():
        return []
    try:
        rows = vs.get_by_metadata("user_docs", {"chunk_index": "0"}, user_id=str(user_id))
        docs = [
            {
                "doc_id": m.get("doc_id", ""),
                "filename": m.get("filename", ""),
                "subject": m.get("subject", ""),
                "grade_level": m.get("grade_level", ""),
                "scope": m.get("scope", "private"),
                "timestamp": m.get("timestamp", ""),
            }
            for r in rows
            for m in [r["metadata"]]
        ]
        docs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        return docs
    except Exception as e:
        logger.warning(f"list_user_docs failed: {e}")
        return []

def list_hs_subjects() -> list[dict]:
    if not available():
        return []
    try:
        rows = vs.get_by_metadata(HS_CURRICULUM_COLLECTION, {"chunk_index": "0"})
        subject_map: dict[str, dict] = {}
        for r in rows:
            meta = r["metadata"]
            subj = meta.get("subject", "General") or "General"
            grade = meta.get("grade_level", "") or ""
            curric = meta.get("curriculum", "") or ""
            key = f"{subj}|{grade}|{curric}"
            if key not in subject_map:
                subject_map[key] = {"subject": subj, "grade_level": grade, "curriculum": curric, "doc_count": 0}
            subject_map[key]["doc_count"] += 1
        return sorted(subject_map.values(), key=lambda x: (x["curriculum"], x["subject"]))
    except Exception as e:
        logger.warning(f"list_hs_subjects failed: {e}")
        return []

def get_hs_stats() -> dict:
    if not available():
        return {}
    try:
        total_chunks = vs.count(HS_CURRICULUM_COLLECTION)
        if total_chunks == 0:
            return {"total_chunks": 0, "total_docs": 0, "by_curriculum": {}, "by_subject": {}, "by_source_type": {}}

        rows = vs.get_by_metadata(HS_CURRICULUM_COLLECTION, {"chunk_index": "0"})
        by_curriculum: dict[str, int] = {}
        by_subject: dict[str, int] = {}
        by_source: dict[str, int] = {}
        for r in rows:
            meta = r["metadata"]
            curric = meta.get("curriculum", "unknown") or "unknown"
            subj = meta.get("subject", "General") or "General"
            src = meta.get("source_type", "user") or "user"
            by_curriculum[curric] = by_curriculum.get(curric, 0) + 1
            by_subject[subj] = by_subject.get(subj, 0) + 1
            by_source[src] = by_source.get(src, 0) + 1

        return {
            "total_chunks": total_chunks,
            "total_docs": len(rows),
            "by_curriculum": dict(sorted(by_curriculum.items())),
            "by_subject": dict(sorted(by_subject.items())),
            "by_source_type": dict(sorted(by_source.items())),
        }
    except Exception as e:
        logger.warning(f"get_hs_stats failed: {e}")
        return {}

def delete_document(user_id: str, doc_id: str, is_admin: bool = False):
    if not available():
        return
    try:
        vs.delete("user_docs", doc_id=doc_id, user_id=str(user_id))
    except Exception as e:
        logger.warning(f"delete_document user_docs failed for {doc_id}: {e}")

    try:
        redis_cache.invalidate_user_search(str(user_id))
    except Exception:
        pass

    if is_admin:
        try:
            vs.delete(HS_CURRICULUM_COLLECTION, doc_id=doc_id)
        except Exception as e:
            logger.warning(f"delete_document hs_curriculum failed for {doc_id}: {e}")
