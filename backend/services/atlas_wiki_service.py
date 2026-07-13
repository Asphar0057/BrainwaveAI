from __future__ import annotations

import json
import re
import math
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

import models

CORE_PAGES = {
    "overview.md",
    "index.md",
    "log.md",
    "schema.md",
}

DEFAULT_SCHEMA = """# Atlas Wiki Schema

Atlas follows a 3-layer model:
1. Raw sources: immutable uploaded documents.
2. Compiled wiki: LLM-maintained markdown pages.
3. Schema: these rules for ingest, query, and lint.

## Conventions
- Keep pages concise and linked with markdown links.
- Prefer source-backed claims with citations to source pages.
- When ingesting, update source, concept, and entity pages.
- Keep `index.md` and `log.md` current.

## Page Taxonomy
- `overview.md`
- `concepts/<slug>.md`
- `entities/<slug>.md`
- `sources/<slug>-<docid>.md`
- `analyses/<timestamp>-<slug>.md`
"""

def _now() -> datetime:
    return datetime.now(timezone.utc)

def _slugify(text: str) -> str:
    s = (text or "").strip().lower()
    s = re.sub(r"\.[a-z0-9]{1,6}$", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "page"

def _normalize_path(path: str) -> str:
    p = (path or "").strip().replace("\\", "/")
    p = re.sub(r"/+", "/", p)
    p = p.lstrip("/")
    return p or "overview.md"

def _loads_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return []
        try:
            data = json.loads(s)
            if isinstance(data, list):
                return [str(v).strip() for v in data if str(v).strip()]
        except Exception:
            pass
        return [x.strip() for x in s.split(",") if x.strip()]
    return []

def _dumps(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=True)
    except Exception:
        return "[]"

def _strip_md(text: str) -> str:
    t = text or ""
    t = re.sub(r"```[\s\S]*?```", " ", t)
    t = re.sub(r"`[^`]*`", " ", t)
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", t)
    t = re.sub(r"[#>*_\-]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t

def _summary_from_content(content: str, limit: int = 280) -> str:
    raw = _strip_md(content)
    return raw[:limit]

def _extract_links(content: str) -> list[str]:
    links: list[str] = []
    if not content:
        return links

    for m in re.finditer(r"\[\[[^\]]+\]\]", content):
        inner = m.group(0)[2:-2].strip()
        inner = inner.split("|", 1)[0].strip()
        if inner:
            links.append(_normalize_path(inner))

    for m in re.finditer(r"\[[^\]]+\]\(([^)]+)\)", content):
        target = (m.group(1) or "").strip()
        if not target or target.startswith("http://") or target.startswith("https://"):
            continue
        target = target.split("#", 1)[0]
        if target:
            links.append(_normalize_path(target))

    dedup = []
    seen = set()
    for l in links:
        if l not in seen:
            seen.add(l)
            dedup.append(l)
    return dedup

def _to_page_dict(page: models.AtlasWikiPage) -> dict[str, Any]:
    return {
        "id": page.id,
        "path": page.path,
        "title": page.title,
        "page_type": page.page_type,
        "content": page.content or "",
        "summary": page.summary or "",
        "tags": _loads_list(page.tags),
        "source_doc_ids": _loads_list(page.source_doc_ids),
        "source_refs": _loads_list(page.source_refs),
        "outbound_links": _loads_list(page.outbound_links),
        "inbound_links_count": page.inbound_links_count or 0,
        "last_compiled_at": page.last_compiled_at.isoformat() + "Z" if page.last_compiled_at else "",
        "updated_at": page.updated_at.isoformat() + "Z" if page.updated_at else "",
        "created_at": page.created_at.isoformat() + "Z" if page.created_at else "",
    }

def append_event(db: Session, user_id: int, event_type: str, title: str, details: Optional[dict[str, Any]] = None) -> None:
    ev = models.AtlasWikiEvent(
        user_id=user_id,
        event_type=(event_type or "event")[:40],
        title=(title or "Wiki event")[:255],
        details=_dumps(details or {}),
    )
    db.add(ev)
    db.commit()

def _ensure_page(db: Session, user_id: int, path: str, title: str, page_type: str, content: str) -> models.AtlasWikiPage:
    p = _normalize_path(path)
    existing = (
        db.query(models.AtlasWikiPage)
        .filter(models.AtlasWikiPage.user_id == user_id, models.AtlasWikiPage.path == p)
        .first()
    )
    if existing:
        return existing

    page = models.AtlasWikiPage(
        user_id=user_id,
        path=p,
        title=title[:255],
        page_type=page_type[:30],
        content=content,
        summary=_summary_from_content(content),
        outbound_links=_dumps(_extract_links(content)),
        tags="[]",
        source_doc_ids="[]",
        source_refs="[]",
        inbound_links_count=0,
    )
    db.add(page)
    db.commit()
    return page

def ensure_user_wiki(db: Session, user_id: int) -> None:
    schema = db.query(models.AtlasWikiSchema).filter(models.AtlasWikiSchema.user_id == user_id).first()
    if not schema:
        schema = models.AtlasWikiSchema(user_id=user_id, schema_markdown=DEFAULT_SCHEMA)
        db.add(schema)
        db.commit()

    _ensure_page(
        db,
        user_id,
        "overview.md",
        "Overview",
        "overview",
        "# Overview\n\nYour Atlas wiki compiles knowledge from sources, queries, and maintenance passes.",
    )
    _ensure_page(
        db,
        user_id,
        "index.md",
        "Index",
        "system",
        "# Index\n\nThis page is auto-generated.",
    )
    _ensure_page(
        db,
        user_id,
        "log.md",
        "Log",
        "system",
        "# Log\n\nChronological events are tracked in the event feed.",
    )
    _ensure_page(
        db,
        user_id,
        "schema.md",
        "Schema",
        "system",
        DEFAULT_SCHEMA,
    )
    refresh_link_counts(db, user_id)

def refresh_link_counts(db: Session, user_id: int) -> None:
    pages = db.query(models.AtlasWikiPage).filter(models.AtlasWikiPage.user_id == user_id).all()
    path_to_page = {p.path: p for p in pages}
    inbound: dict[str, int] = {p.path: 0 for p in pages}

    for p in pages:
        out = _loads_list(p.outbound_links)
        for target in out:
            if target in inbound:
                inbound[target] += 1

    for p in pages:
        p.inbound_links_count = inbound.get(p.path, 0)

    db.commit()

def upsert_page(
    db: Session,
    user_id: int,
    path: str,
    title: str,
    content: str,
    page_type: str = "concept",
    tags: Optional[list[str]] = None,
    source_doc_ids: Optional[list[str]] = None,
    source_refs: Optional[list[str]] = None,
    compiled: bool = False,
) -> dict[str, Any]:
    p = _normalize_path(path)
    now = _now()
    tags = [t.strip() for t in (tags or []) if t and t.strip()]
    source_doc_ids = [d.strip() for d in (source_doc_ids or []) if d and d.strip()]
    source_refs = [s.strip() for s in (source_refs or []) if s and s.strip()]

    row = (
        db.query(models.AtlasWikiPage)
        .filter(models.AtlasWikiPage.user_id == user_id, models.AtlasWikiPage.path == p)
        .first()
    )
    if not row:
        row = models.AtlasWikiPage(user_id=user_id, path=p)
        db.add(row)

    row.title = (title or p).strip()[:255]
    row.page_type = (page_type or "concept")[:30]
    row.content = content or ""
    row.summary = _summary_from_content(row.content)
    row.tags = _dumps(tags)
    row.source_doc_ids = _dumps(source_doc_ids)
    row.source_refs = _dumps(source_refs)
    row.outbound_links = _dumps(_extract_links(row.content))
    if compiled:
        row.last_compiled_at = now

    db.commit()
    refresh_link_counts(db, user_id)
    return _to_page_dict(row)

def get_page(db: Session, user_id: int, path: str) -> Optional[dict[str, Any]]:
    p = _normalize_path(path)
    row = (
        db.query(models.AtlasWikiPage)
        .filter(models.AtlasWikiPage.user_id == user_id, models.AtlasWikiPage.path == p)
        .first()
    )
    if not row:
        return None
    data = _to_page_dict(row)

    backlinks = (
        db.query(models.AtlasWikiPage)
        .filter(models.AtlasWikiPage.user_id == user_id)
        .all()
    )
    data["backlinks"] = [
        {"path": b.path, "title": b.title, "page_type": b.page_type}
        for b in backlinks
        if p in _loads_list(b.outbound_links)
    ]
    return data

def list_pages(
    db: Session,
    user_id: int,
    page_type: str = "",
    query: str = "",
    limit: int = 500,
) -> list[dict[str, Any]]:
    q = db.query(models.AtlasWikiPage).filter(models.AtlasWikiPage.user_id == user_id)
    if page_type:
        q = q.filter(models.AtlasWikiPage.page_type == page_type)

    rows = q.order_by(models.AtlasWikiPage.updated_at.desc()).limit(max(1, min(limit, 1000))).all()
    if query:
        tq = query.lower().strip()
        filtered = []
        for r in rows:
            txt = f"{r.title}\n{r.path}\n{r.summary}\n{r.content[:1200]}".lower()
            if tq in txt:
                filtered.append(r)
        rows = filtered

    return [_to_page_dict(r) for r in rows]

def search_pages(db: Session, user_id: int, query: str, limit: int = 6) -> list[dict[str, Any]]:
    tokens = [t for t in re.findall(r"[a-zA-Z0-9]{2,}", (query or "").lower()) if t]
    if not tokens:
        return []

    rows = db.query(models.AtlasWikiPage).filter(models.AtlasWikiPage.user_id == user_id).all()
    scored: list[tuple[float, models.AtlasWikiPage]] = []

    for r in rows:
        text = (r.content or "").lower()
        title = (r.title or "").lower()
        path = (r.path or "").lower()
        score = 0.0
        for tok in tokens:
            if tok in title:
                score += 2.0
            if tok in path:
                score += 1.3
            if tok in text:
                score += 0.6
        if score > 0:
            scored.append((score, r))

    scored.sort(key=lambda x: x[0], reverse=True)
    out = []
    for _, r in scored[: max(1, min(limit, 20))]:
        out.append(_to_page_dict(r))
    return out

def _doc_topic_tags(doc: models.ContextDocument) -> list[str]:
    tags = _loads_list(doc.topic_tags)
    if doc.subject:
        tags.append(doc.subject)
    dedup: list[str] = []
    seen = set()
    for t in tags:
        key = t.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        dedup.append(t.strip())
    return dedup[:15]

def _doc_key_concepts(doc: models.ContextDocument) -> list[str]:
    concepts = _loads_list(doc.key_concepts)
    dedup: list[str] = []
    seen = set()
    for t in concepts:
        key = t.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        dedup.append(t.strip())
    return dedup[:20]

def _clean_text(value: str, limit: int = 5000) -> str:
    txt = re.sub(r"\s+", " ", (value or "")).strip()
    return txt[:limit]

def _topic_candidates_from_text(text: str, limit: int = 12) -> list[str]:
    src = _clean_text(text, 3000)
    if not src:
        return []

    candidates: list[str] = []

    for m in re.finditer(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b", src):
        phrase = m.group(1).strip()
        if len(phrase) < 3:
            continue
        candidates.append(phrase)

    low = src.lower()
    fallback_patterns = [
        r"\b([a-z]{4,}(?:\s+[a-z]{4,}){0,2})\b",
    ]
    for pat in fallback_patterns:
        for m in re.finditer(pat, low):
            phrase = m.group(1).strip()
            if phrase in {"this is", "there are", "which are", "that the", "from the", "with the"}:
                continue
            if len(phrase) < 4:
                continue
            candidates.append(" ".join(w.capitalize() for w in phrase.split()))

    dedup: list[str] = []
    seen = set()
    for c in candidates:
        key = c.lower().strip()
        if not key or key in seen:
            continue
        if len(key.split()) > 4:
            continue
        seen.add(key)
        dedup.append(c.strip())
        if len(dedup) >= limit:
            break
    return dedup

def _extend_topic_maps(
    topic_to_sources: dict[str, list[dict[str, str]]],
    entity_to_sources: dict[str, list[dict[str, str]]],
    topic_claims: dict[str, list[dict[str, str]]],
    topics: list[str],
    entities: list[str],
    path: str,
    name: str,
    summary: str,
) -> None:
    first_claim = (summary or "").split(".")[0].strip()
    for t in topics:
        topic_to_sources.setdefault(t, []).append(
            {"path": path, "name": name, "summary": summary}
        )
        if first_claim:
            topic_claims.setdefault(t, []).append({"path": path, "claim": first_claim})

    for e in entities:
        entity_to_sources.setdefault(e, []).append(
            {"path": path, "name": name, "summary": summary}
        )

def _detect_contradictions(
    db: Session,
    user_id: int,
    topic_claims: dict[str, list[dict[str, str]]],
) -> int:
    inc_words = {"increase", "increases", "increased", "higher", "rise", "rises", "growth", "improves", "more"}
    dec_words = {"decrease", "decreases", "decreased", "lower", "drop", "drops", "decline", "reduces", "less"}

    created = 0
    for topic, claims in topic_claims.items():
        if len(claims) < 2:
            continue

        pos = []
        neg = []
        for c in claims:
            txt = (c.get("claim") or "").lower()
            if any(w in txt for w in inc_words):
                pos.append(c)
            if any(w in txt for w in dec_words):
                neg.append(c)

        if not pos or not neg:
            continue

        a = pos[0]
        b = neg[0]
        pa = a.get("path", "")
        pb = b.get("path", "")
        if not pa or not pb or pa == pb:
            continue

        existing = (
            db.query(models.AtlasWikiContradiction)
            .filter(
                models.AtlasWikiContradiction.user_id == user_id,
                models.AtlasWikiContradiction.topic == topic,
                models.AtlasWikiContradiction.status == "open",
            )
            .all()
        )
        exists_same = any(
            {x.page_a_path, x.page_b_path} == {pa, pb}
            for x in existing
        )
        if exists_same:
            continue

        row = models.AtlasWikiContradiction(
            user_id=user_id,
            topic=topic,
            page_a_path=pa,
            page_b_path=pb,
            description=f"Conflicting directional claims detected for '{topic}'.",
            evidence_a=(a.get("claim") or "")[:400],
            evidence_b=(b.get("claim") or "")[:400],
            status="open",
        )
        db.add(row)
        created += 1

    if created:
        db.commit()
    return created

def build_index_page(db: Session, user_id: int) -> dict[str, Any]:
    pages = db.query(models.AtlasWikiPage).filter(models.AtlasWikiPage.user_id == user_id).all()
    groups: dict[str, list[models.AtlasWikiPage]] = {
        "overview": [],
        "concept": [],
        "entity": [],
        "source": [],
        "analysis": [],
        "system": [],
    }
    for p in pages:
        groups.setdefault(p.page_type, []).append(p)

    lines = ["# Index", "", "Auto-generated atlas index.", ""]
    for gt in ["overview", "concept", "entity", "source", "analysis", "system"]:
        items = sorted(groups.get(gt, []), key=lambda x: x.title.lower())
        if not items:
            continue
        lines.append(f"## {gt.title()} Pages")
        lines.append("")
        for p in items:
            lines.append(f"- [{p.title}]({p.path}) - {p.summary[:120]}")
        lines.append("")

    return upsert_page(
        db,
        user_id,
        path="index.md",
        title="Index",
        page_type="system",
        content="\n".join(lines).strip() + "\n",
        compiled=True,
    )

def compile_from_documents(
    db: Session,
    user_id: int,
    doc_ids: Optional[list[str]] = None,
    include_platform: bool = True,
) -> dict[str, Any]:
    ensure_user_wiki(db, user_id)

    q = db.query(models.ContextDocument).filter(
        models.ContextDocument.user_id == user_id,
        models.ContextDocument.status == "ready",
    )
    if doc_ids:
        q = q.filter(models.ContextDocument.doc_id.in_(doc_ids))
    docs = q.order_by(models.ContextDocument.updated_at.desc()).all()

    topic_to_sources: dict[str, list[dict[str, str]]] = {}
    entity_to_sources: dict[str, list[dict[str, str]]] = {}
    topic_claims: dict[str, list[dict[str, str]]] = {}
    source_paths: list[str] = []
    platform_counts = {
        "documents": 0,
        "notes": 0,
        "flashcard_sets": 0,
        "question_sets": 0,
        "quiz_history": 0,
        "question_sessions": 0,
        "uploaded_documents": 0,
    }

    for d in docs:
        doc_name = re.sub(r"\.[^.]+$", "", d.filename or "Document")
        src_slug = _slugify(doc_name)
        src_path = f"sources/{src_slug}-{(d.doc_id or '')[:8]}.md"
        source_paths.append(src_path)
        platform_counts["documents"] += 1

        tags = _doc_topic_tags(d)
        concepts = _doc_key_concepts(d)
        summary = (d.ai_summary or "").strip() or "No summary yet."

        src_lines = [
            f"# {doc_name}",
            "",
            "## Metadata",
            f"- Doc ID: `{d.doc_id}`",
            f"- Subject: {d.subject or 'General'}",
            f"- Grade: {d.grade_level or 'N/A'}",
            f"- Source: {d.source_name or 'User upload'}",
            f"- Chunks: {d.chunk_count or 0}",
            f"- Updated: {(d.updated_at.isoformat() + 'Z') if d.updated_at else ''}",
            "",
            "## Summary",
            summary,
            "",
        ]
        if tags:
            src_lines.append("## Topic Tags")
            src_lines.extend([f"- {t}" for t in tags])
            src_lines.append("")
        if concepts:
            src_lines.append("## Key Concepts")
            src_lines.extend([f"- {c}" for c in concepts[:12]])
            src_lines.append("")

        upsert_page(
            db,
            user_id,
            path=src_path,
            title=doc_name,
            page_type="source",
            content="\n".join(src_lines).strip() + "\n",
            tags=tags,
            source_doc_ids=[d.doc_id],
            source_refs=[d.filename],
            compiled=True,
        )

        _extend_topic_maps(
            topic_to_sources=topic_to_sources,
            entity_to_sources=entity_to_sources,
            topic_claims=topic_claims,
            topics=tags,
            entities=concepts,
            path=src_path,
            name=doc_name,
            summary=summary,
        )

    if include_platform:
        note_rows = (
            db.query(models.Note)
            .filter(models.Note.user_id == user_id, models.Note.is_deleted == False)
            .order_by(models.Note.updated_at.desc())
            .limit(200)
            .all()
        )
        for n in note_rows:
            content = _clean_text(n.content or "", 2600)
            if not content and not (n.title or "").strip():
                continue
            name = (n.title or f"Note {n.id}").strip()
            summary = _summary_from_content(content or name)
            src_path = f"sources/note-{n.id}.md"
            lines = [
                f"# {name}",
                "",
                "## Metadata",
                f"- Source Type: Note",
                f"- Note ID: `{n.id}`",
                f"- Updated: {(n.updated_at.isoformat() + 'Z') if n.updated_at else ''}",
                "",
                "## Content Excerpt",
                content[:1800] if content else "No content.",
                "",
            ]
            upsert_page(
                db, user_id, src_path, name, "\n".join(lines), "source",
                tags=[], source_doc_ids=[], source_refs=[f"note:{n.id}"], compiled=True
            )
            topics = _topic_candidates_from_text(f"{name}. {content}", limit=10)
            entities = _topic_candidates_from_text(content, limit=12)
            _extend_topic_maps(topic_to_sources, entity_to_sources, topic_claims, topics, entities, src_path, name, summary)
            source_paths.append(src_path)
            platform_counts["notes"] += 1

        fs_rows = (
            db.query(models.FlashcardSet)
            .filter(models.FlashcardSet.user_id == user_id)
            .order_by(models.FlashcardSet.updated_at.desc())
            .limit(120)
            .all()
        )
        for fs in fs_rows:
            cards = fs.flashcards[:60] if fs.flashcards else []
            if not cards and not (fs.title or "").strip():
                continue
            name = (fs.title or f"Flashcard Set {fs.id}").strip()
            qa_lines = []
            card_topics = []
            for c in cards[:18]:
                q = _clean_text(c.question or "", 140)
                a = _clean_text(c.answer or "", 180)
                if q:
                    qa_lines.append(f"- Q: {q}")
                if a:
                    qa_lines.append(f"  A: {a}")
                if c.category:
                    card_topics.append(c.category.strip())
            summary = _summary_from_content("\n".join(qa_lines) or name)
            src_path = f"sources/flashcards-{fs.id}.md"
            lines = [
                f"# {name}",
                "",
                "## Metadata",
                f"- Source Type: Flashcard Set",
                f"- Set ID: `{fs.id}`",
                f"- Cards: {len(cards)}",
                f"- Updated: {(fs.updated_at.isoformat() + 'Z') if fs.updated_at else ''}",
                "",
                "## Cards",
                *(qa_lines if qa_lines else ["- No cards found."]),
                "",
            ]
            upsert_page(
                db, user_id, src_path, name, "\n".join(lines), "source",
                tags=card_topics[:10], source_doc_ids=[], source_refs=[f"flashcard_set:{fs.id}"], compiled=True
            )
            topics = _topic_candidates_from_text(name, limit=6) + card_topics[:8]
            entities = _topic_candidates_from_text("\n".join(qa_lines), limit=12)
            _extend_topic_maps(topic_to_sources, entity_to_sources, topic_claims, topics[:12], entities, src_path, name, summary)
            source_paths.append(src_path)
            platform_counts["flashcard_sets"] += 1

        qs_rows = (
            db.query(models.QuestionSet)
            .filter(models.QuestionSet.user_id == user_id)
            .order_by(models.QuestionSet.updated_at.desc())
            .limit(120)
            .all()
        )
        for qs in qs_rows:
            qs_questions = qs.questions[:80] if qs.questions else []
            name = (qs.title or f"Question Set {qs.id}").strip()
            q_lines = []
            q_topics = []
            for qx in qs_questions[:20]:
                qt = _clean_text(qx.question_text or "", 170)
                if qt:
                    q_lines.append(f"- {qt}")
                if qx.topic:
                    q_topics.append(qx.topic.strip())
            summary_src = (qs.description or "") + "\n" + "\n".join(q_lines[:5])
            summary = _summary_from_content(summary_src or name)
            src_path = f"sources/questionset-{qs.id}.md"
            lines = [
                f"# {name}",
                "",
                "## Metadata",
                f"- Source Type: Question Set",
                f"- Set ID: `{qs.id}`",
                f"- Questions: {len(qs_questions)}",
                f"- Attempts: {qs.attempts or 0}",
                f"- Best Score: {qs.best_score or 0}",
                "",
                "## Description",
                _clean_text(qs.description or "", 800) or "No description.",
                "",
                "## Questions",
                *(q_lines if q_lines else ["- No questions found."]),
                "",
            ]
            upsert_page(
                db, user_id, src_path, name, "\n".join(lines), "source",
                tags=q_topics[:12], source_doc_ids=[], source_refs=[f"question_set:{qs.id}"], compiled=True
            )
            topics = _topic_candidates_from_text(f"{name}. {qs.description or ''}", limit=8) + q_topics[:8]
            entities = _topic_candidates_from_text("\n".join(q_lines), limit=12)
            _extend_topic_maps(topic_to_sources, entity_to_sources, topic_claims, topics[:14], entities, src_path, name, summary)
            source_paths.append(src_path)
            platform_counts["question_sets"] += 1

        activity_rows = (
            db.query(models.Activity)
            .filter(models.Activity.user_id == user_id)
            .order_by(models.Activity.timestamp.desc())
            .limit(220)
            .all()
        )
        for a in activity_rows:
            name = f"Quiz Activity {a.id}"
            topic = (a.topic or "").strip()
            qtxt = _clean_text(a.question or "", 260)
            atxt = _clean_text(a.answer or "", 320)
            summary = _summary_from_content(f"{topic}. {qtxt} {atxt}")
            src_path = f"sources/quiz-{a.id}.md"
            lines = [
                f"# {name}",
                "",
                "## Metadata",
                f"- Source Type: Quiz History",
                f"- Activity ID: `{a.id}`",
                f"- Topic: {topic or 'General'}",
                f"- Timestamp: {(a.timestamp.isoformat() + 'Z') if a.timestamp else ''}",
                "",
                "## Question",
                qtxt or "No question text.",
                "",
                "## Answer",
                atxt or "No answer text.",
                "",
            ]
            upsert_page(
                db, user_id, src_path, name, "\n".join(lines), "source",
                tags=[topic] if topic else [], source_doc_ids=[], source_refs=[f"activity:{a.id}"], compiled=True
            )
            topics = ([topic] if topic else []) + _topic_candidates_from_text(qtxt, limit=6)
            entities = _topic_candidates_from_text(f"{qtxt}. {atxt}", limit=8)
            _extend_topic_maps(topic_to_sources, entity_to_sources, topic_claims, topics[:10], entities, src_path, name, summary)
            source_paths.append(src_path)
            platform_counts["quiz_history"] += 1

        session_rows = (
            db.query(models.QuestionSession)
            .filter(models.QuestionSession.user_id == user_id)
            .order_by(models.QuestionSession.completed_at.desc())
            .limit(100)
            .all()
        )
        for s in session_rows:
            set_name = s.question_set.title if s.question_set and s.question_set.title else f"Question Set {s.question_set_id}"
            name = f"Question Session {s.id}"
            summary = _summary_from_content(f"{set_name}. Score {s.score}/{s.total_questions}. Correct {s.correct_count}")
            src_path = f"sources/question-session-{s.id}.md"
            lines = [
                f"# {name}",
                "",
                "## Metadata",
                f"- Source Type: Question Session",
                f"- Session ID: `{s.id}`",
                f"- Question Set: {set_name}",
                f"- Score: {s.score or 0}/{s.total_questions or 0}",
                f"- Correct: {s.correct_count or 0}",
                f"- Completed: {(s.completed_at.isoformat() + 'Z') if s.completed_at else ''}",
                "",
            ]
            upsert_page(
                db, user_id, src_path, name, "\n".join(lines), "source",
                tags=[set_name], source_doc_ids=[], source_refs=[f"question_session:{s.id}"], compiled=True
            )
            topics = _topic_candidates_from_text(set_name, limit=6)
            entities = topics[:]
            _extend_topic_maps(topic_to_sources, entity_to_sources, topic_claims, topics, entities, src_path, name, summary)
            source_paths.append(src_path)
            platform_counts["question_sessions"] += 1

        up_rows = (
            db.query(models.UploadedDocument)
            .filter(models.UploadedDocument.user_id == user_id)
            .order_by(models.UploadedDocument.created_at.desc())
            .limit(120)
            .all()
        )
        for ud in up_rows:
            name = (ud.filename or f"Uploaded Document {ud.id}").strip()
            content = _clean_text(ud.content or "", 1800)
            summary = _summary_from_content(content or name)
            src_path = f"sources/uploaded-{ud.id}.md"
            lines = [
                f"# {name}",
                "",
                "## Metadata",
                f"- Source Type: Uploaded Document",
                f"- Uploaded Doc ID: `{ud.id}`",
                f"- Document Type: {ud.document_type or 'general'}",
                f"- Created: {(ud.created_at.isoformat() + 'Z') if ud.created_at else ''}",
                "",
                "## Content Excerpt",
                content or "No content.",
                "",
            ]
            upsert_page(
                db, user_id, src_path, name, "\n".join(lines), "source",
                tags=[ud.document_type] if ud.document_type else [], source_doc_ids=[], source_refs=[f"uploaded_document:{ud.id}"], compiled=True
            )
            topics = _topic_candidates_from_text(f"{name}. {ud.document_type or ''}. {content}", limit=10)
            entities = topics[:]
            _extend_topic_maps(topic_to_sources, entity_to_sources, topic_claims, topics, entities, src_path, name, summary)
            source_paths.append(src_path)
            platform_counts["uploaded_documents"] += 1

    total_compiled_sources = len(source_paths)
    if total_compiled_sources == 0:
        append_event(
            db,
            user_id,
            "compile",
            "Compile skipped",
            {"reason": "No source artifacts found", "doc_ids": doc_ids or [], "include_platform": include_platform},
        )
        return {
            "compiled": 0,
            "concept_pages": 0,
            "entity_pages": 0,
            "source_pages": 0,
            "contradictions": 0,
            "platform_counts": platform_counts,
        }

    concept_pages = 0
    for topic, items in topic_to_sources.items():
        c_path = f"concepts/{_slugify(topic)}.md"
        lines = [
            f"# {topic}",
            "",
            "Auto-compiled concept page.",
            "",
            "## Source Evidence",
        ]
        for it in items[:16]:
            lines.append(f"- [{it['name']}]({it['path']}): {it['summary'][:180]}")
        lines.append("")

        related = []
        for other_topic in topic_to_sources.keys():
            if other_topic.lower() == topic.lower():
                continue
            if len(set(topic.lower().split()) & set(other_topic.lower().split())) > 0:
                related.append(other_topic)
        if related:
            lines.append("## Related Concepts")
            for rt in sorted(set(related))[:10]:
                lines.append(f"- [{rt}](concepts/{_slugify(rt)}.md)")
            lines.append("")

        upsert_page(
            db,
            user_id,
            path=c_path,
            title=topic,
            page_type="concept",
            content="\n".join(lines).strip() + "\n",
            tags=[topic],
            source_doc_ids=[],
            source_refs=[i["path"] for i in items],
            compiled=True,
        )
        concept_pages += 1

    entity_pages = 0
    for ent, items in entity_to_sources.items():
        e_path = f"entities/{_slugify(ent)}.md"
        lines = [
            f"# {ent}",
            "",
            "Auto-compiled entity page.",
            "",
            "## Mentions",
        ]
        for it in items[:14]:
            lines.append(f"- [{it['name']}]({it['path']}): {it['summary'][:180]}")
        lines.append("")

        upsert_page(
            db,
            user_id,
            path=e_path,
            title=ent,
            page_type="entity",
            content="\n".join(lines).strip() + "\n",
            tags=[ent],
            source_doc_ids=[],
            source_refs=[i["path"] for i in items],
            compiled=True,
        )
        entity_pages += 1

    total_pages = db.query(models.AtlasWikiPage).filter(models.AtlasWikiPage.user_id == user_id).count()
    source_count = db.query(models.ContextDocument).filter(
        models.ContextDocument.user_id == user_id,
        models.ContextDocument.status == "ready",
    ).count()
    note_count = db.query(models.Note).filter(models.Note.user_id == user_id, models.Note.is_deleted == False).count()
    flashcard_set_count = db.query(models.FlashcardSet).filter(models.FlashcardSet.user_id == user_id).count()
    question_set_count = db.query(models.QuestionSet).filter(models.QuestionSet.user_id == user_id).count()
    quiz_activity_count = db.query(models.Activity).filter(models.Activity.user_id == user_id).count()

    overview_lines = [
        "# Overview",
        "",
        "Compiled Atlas wiki for your full platform knowledge universe.",
        "",
        "## Stats",
        f"- Source documents: {source_count}",
        f"- Notes: {note_count}",
        f"- Flashcard sets: {flashcard_set_count}",
        f"- Question sets: {question_set_count}",
        f"- Quiz activity entries: {quiz_activity_count}",
        f"- Wiki pages: {total_pages}",
        f"- Concepts: {len(topic_to_sources)}",
        f"- Entities: {len(entity_to_sources)}",
        "",
        "## Recent Sources",
    ]
    for sp in source_paths[:10]:
        page = get_page(db, user_id, sp)
        if page:
            overview_lines.append(f"- [{page['title']}]({sp})")
    overview_lines.append("")

    upsert_page(
        db,
        user_id,
        path="overview.md",
        title="Overview",
        page_type="overview",
        content="\n".join(overview_lines).strip() + "\n",
        compiled=True,
    )

    build_index_page(db, user_id)
    contradictions = _detect_contradictions(db, user_id, topic_claims)
    refresh_link_counts(db, user_id)

    append_event(
        db,
        user_id,
        "compile",
        "Wiki compile completed",
        {
            "compiled_docs": platform_counts["documents"],
            "source_pages": total_compiled_sources,
            "concept_pages": concept_pages,
            "entity_pages": entity_pages,
            "contradictions": contradictions,
            "platform_counts": platform_counts,
        },
    )

    return {
        "compiled": total_compiled_sources,
        "source_pages": total_compiled_sources,
        "concept_pages": concept_pages,
        "entity_pages": entity_pages,
        "contradictions": contradictions,
        "platform_counts": platform_counts,
    }

def list_events(db: Session, user_id: int, limit: int = 100) -> list[dict[str, Any]]:
    rows = (
        db.query(models.AtlasWikiEvent)
        .filter(models.AtlasWikiEvent.user_id == user_id)
        .order_by(models.AtlasWikiEvent.created_at.desc())
        .limit(max(1, min(limit, 500)))
        .all()
    )
    out = []
    for r in rows:
        try:
            details = json.loads(r.details) if r.details else {}
        except Exception:
            details = {}
        out.append(
            {
                "id": r.id,
                "event_type": r.event_type,
                "title": r.title,
                "details": details,
                "created_at": r.created_at.isoformat() + "Z" if r.created_at else "",
            }
        )
    return out

def list_contradictions(db: Session, user_id: int, status: str = "") -> list[dict[str, Any]]:
    q = db.query(models.AtlasWikiContradiction).filter(models.AtlasWikiContradiction.user_id == user_id)
    if status:
        q = q.filter(models.AtlasWikiContradiction.status == status)
    rows = q.order_by(models.AtlasWikiContradiction.created_at.desc()).limit(500).all()
    return [
        {
            "id": r.id,
            "topic": r.topic,
            "page_a_path": r.page_a_path,
            "page_b_path": r.page_b_path,
            "description": r.description,
            "evidence_a": r.evidence_a or "",
            "evidence_b": r.evidence_b or "",
            "status": r.status,
            "created_at": r.created_at.isoformat() + "Z" if r.created_at else "",
            "resolved_at": r.resolved_at.isoformat() + "Z" if r.resolved_at else "",
        }
        for r in rows
    ]

def resolve_contradiction(db: Session, user_id: int, contradiction_id: int) -> bool:
    row = (
        db.query(models.AtlasWikiContradiction)
        .filter(
            models.AtlasWikiContradiction.user_id == user_id,
            models.AtlasWikiContradiction.id == contradiction_id,
        )
        .first()
    )
    if not row:
        return False
    row.status = "resolved"
    row.resolved_at = _now()
    db.commit()
    append_event(
        db,
        user_id,
        "contradiction",
        "Contradiction resolved",
        {"id": contradiction_id, "topic": row.topic},
    )
    return True

def _stable_pos(seed: str, radius_min: float = 14.0, radius_max: float = 64.0) -> tuple[float, float, float]:
    h = hashlib.sha256((seed or "seed").encode("utf-8")).hexdigest()
    a = int(h[0:8], 16) / 0xFFFFFFFF
    b = int(h[8:16], 16) / 0xFFFFFFFF
    c = int(h[16:24], 16) / 0xFFFFFFFF
    theta = a * math.pi * 2.0
    phi = math.acos(max(-1.0, min(1.0, 2.0 * b - 1.0)))
    r = radius_min + (radius_max - radius_min) * c
    x = r * math.sin(phi) * math.cos(theta)
    y = r * math.sin(phi) * math.sin(theta)
    z = r * math.cos(phi)
    return (x, y, z)

def build_knowledge_universe_graph(
    db: Session,
    user_id: int,
    max_nodes: int = 480,
) -> dict[str, Any]:
    ensure_user_wiki(db, user_id)

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    node_map: dict[str, dict[str, Any]] = {}
    edge_seen: set[str] = set()

    def add_node(node_id: str, label: str, node_type: str, size: float = 1.0):
        if node_id in node_map:
            return
        if len(node_map) >= max_nodes:
            return
        x, y, z = _stable_pos(node_id)
        row = {
            "id": node_id,
            "label": (label or node_id)[:120],
            "type": node_type,
            "size": size,
            "x": x,
            "y": y,
            "z": z,
        }
        node_map[node_id] = row
        nodes.append(row)

    def add_edge(a: str, b: str, edge_type: str = "related", weight: float = 1.0):
        if a == b or a not in node_map or b not in node_map:
            return
        key = f"{a}|{b}|{edge_type}" if a < b else f"{b}|{a}|{edge_type}"
        if key in edge_seen:
            return
        edge_seen.add(key)
        edges.append({"source": a, "target": b, "type": edge_type, "weight": weight})

    add_node("hub:atlas", "Atlas", "hub", 2.2)
    add_node("hub:vault", "Vault", "hub", 1.8)
    add_node("hub:oracle", "Oracle", "hub", 1.8)
    add_node("hub:archive", "Archive", "hub", 1.8)
    add_node("hub:wiki", "Wiki", "hub", 1.8)
    for sub in ["hub:vault", "hub:oracle", "hub:archive", "hub:wiki"]:
        add_edge("hub:atlas", sub, "contains", 1.8)

    category_defs = [
        ("cat:documents", "Documents", "hub:vault"),
        ("cat:notes", "Notes", "hub:vault"),
        ("cat:flashcards", "Flashcards", "hub:vault"),
        ("cat:question_sets", "Question Sets", "hub:archive"),
        ("cat:quiz_history", "Quiz History", "hub:archive"),
        ("cat:wiki_pages", "Wiki Pages", "hub:wiki"),
        ("cat:concepts", "Concepts", "hub:wiki"),
    ]
    for cid, lbl, parent in category_defs:
        add_node(cid, lbl, "category", 1.4)
        add_edge(parent, cid, "contains", 1.3)

    docs = (
        db.query(models.ContextDocument)
        .filter(models.ContextDocument.user_id == user_id, models.ContextDocument.status == "ready")
        .order_by(models.ContextDocument.updated_at.desc())
        .limit(140)
        .all()
    )
    for d in docs:
        did = f"doc:{d.doc_id}"
        add_node(did, d.filename or "Document", "document", 1.0)
        add_edge("cat:documents", did, "contains", 1.1)
        if d.subject:
            cid = f"concept:{_slugify(d.subject)}"
            add_node(cid, d.subject, "concept", 0.95)
            add_edge(did, cid, "about", 1.0)

        for t in (_loads_list(d.topic_tags)[:6] if d.topic_tags else []):
            cid = f"concept:{_slugify(t)}"
            add_node(cid, t, "concept", 0.9)
            add_edge(did, cid, "tagged", 0.9)

    notes = (
        db.query(models.Note)
        .filter(models.Note.user_id == user_id, models.Note.is_deleted == False)
        .order_by(models.Note.updated_at.desc())
        .limit(140)
        .all()
    )
    for n in notes:
        nid = f"note:{n.id}"
        title = (n.title or f"Note {n.id}")
        add_node(nid, title, "note", 0.95)
        add_edge("cat:notes", nid, "contains", 1.0)
        topics = _topic_candidates_from_text(f"{title}. {n.content or ''}", limit=5)
        for t in topics:
            cid = f"concept:{_slugify(t)}"
            add_node(cid, t, "concept", 0.9)
            add_edge(nid, cid, "mentions", 0.9)

    sets = (
        db.query(models.FlashcardSet)
        .filter(models.FlashcardSet.user_id == user_id)
        .order_by(models.FlashcardSet.updated_at.desc())
        .limit(120)
        .all()
    )
    for fs in sets:
        sid = f"fset:{fs.id}"
        add_node(sid, fs.title or f"Flashcards {fs.id}", "flashcard_set", 1.0)
        add_edge("cat:flashcards", sid, "contains", 1.0)
        for c in (fs.flashcards[:26] if fs.flashcards else []):
            if c.category:
                cid = f"concept:{_slugify(c.category)}"
                add_node(cid, c.category, "concept", 0.9)
                add_edge(sid, cid, "covers", 0.9)
            question_topics = _topic_candidates_from_text(c.question or "", limit=2)
            for qt in question_topics:
                cid = f"concept:{_slugify(qt)}"
                add_node(cid, qt, "concept", 0.88)
                add_edge(sid, cid, "mentions", 0.8)

    qsets = (
        db.query(models.QuestionSet)
        .filter(models.QuestionSet.user_id == user_id)
        .order_by(models.QuestionSet.updated_at.desc())
        .limit(120)
        .all()
    )
    for qs in qsets:
        qid = f"qset:{qs.id}"
        add_node(qid, qs.title or f"Question Set {qs.id}", "question_set", 1.0)
        add_edge("cat:question_sets", qid, "contains", 1.0)
        for q in (qs.questions[:30] if qs.questions else []):
            if q.topic:
                cid = f"concept:{_slugify(q.topic)}"
                add_node(cid, q.topic, "concept", 0.9)
                add_edge(qid, cid, "tests", 0.95)

    sessions = (
        db.query(models.QuestionSession)
        .filter(models.QuestionSession.user_id == user_id)
        .order_by(models.QuestionSession.completed_at.desc())
        .limit(100)
        .all()
    )
    for s in sessions:
        sid = f"qsession:{s.id}"
        add_node(sid, f"Session {s.id}", "quiz_session", 0.92)
        add_edge("cat:quiz_history", sid, "contains", 0.95)
        if s.question_set_id:
            qid = f"qset:{s.question_set_id}"
            if qid in node_map:
                add_edge(sid, qid, "from_set", 0.85)

    activities = (
        db.query(models.Activity)
        .filter(models.Activity.user_id == user_id)
        .order_by(models.Activity.timestamp.desc())
        .limit(150)
        .all()
    )
    for a in activities:
        aid = f"quiz:{a.id}"
        add_node(aid, a.topic or f"Quiz {a.id}", "quiz_activity", 0.9)
        add_edge("cat:quiz_history", aid, "contains", 0.9)
        if a.topic:
            cid = f"concept:{_slugify(a.topic)}"
            add_node(cid, a.topic, "concept", 0.9)
            add_edge(aid, cid, "about", 0.85)

    pages = (
        db.query(models.AtlasWikiPage)
        .filter(models.AtlasWikiPage.user_id == user_id)
        .order_by(models.AtlasWikiPage.updated_at.desc())
        .limit(220)
        .all()
    )
    for p in pages:
        pid = f"wiki:{p.path}"
        add_node(pid, p.title or p.path, "wiki_page", 0.95)
        add_edge("cat:wiki_pages", pid, "contains", 1.0)
        add_edge("hub:oracle", pid, "consults", 0.8)

        if p.page_type == "concept":
            cid = f"concept:{_slugify(p.title or p.path)}"
            add_node(cid, p.title or p.path, "concept", 1.0)
            add_edge("cat:concepts", cid, "contains", 1.0)
            add_edge(pid, cid, "defines", 1.0)

        for out in _loads_list(p.outbound_links)[:20]:
            tid = f"wiki:{out}"
            if tid in node_map:
                add_edge(pid, tid, "links", 0.6)

        for t in _loads_list(p.tags)[:8]:
            cid = f"concept:{_slugify(t)}"
            add_node(cid, t, "concept", 0.9)
            add_edge(pid, cid, "mentions", 0.7)

    concept_nodes = [n for n in nodes if n["type"] == "concept"]
    concept_labels = [(n["id"], n["label"].lower().split()) for n in concept_nodes]
    for i in range(len(concept_labels)):
        a_id, a_toks = concept_labels[i]
        if not a_toks:
            continue
        for j in range(i + 1, min(i + 16, len(concept_labels))):
            b_id, b_toks = concept_labels[j]
            if not b_toks:
                continue
            if set(a_toks) & set(b_toks):
                add_edge(a_id, b_id, "related", 0.45)

    return {
        "nodes": nodes,
        "edges": edges,
        "counts": {
            "nodes": len(nodes),
            "edges": len(edges),
            "documents": len(docs),
            "notes": len(notes),
            "flashcard_sets": len(sets),
            "question_sets": len(qsets),
            "activities": len(activities),
            "wiki_pages": len(pages),
        },
    }

def lint_wiki(db: Session, user_id: int) -> dict[str, Any]:
    ensure_user_wiki(db, user_id)
    refresh_link_counts(db, user_id)

    pages = db.query(models.AtlasWikiPage).filter(models.AtlasWikiPage.user_id == user_id).all()
    now = _now()
    stale_cutoff = now - timedelta(days=30)

    issues: list[dict[str, Any]] = []
    orphan_count = 0
    stale_count = 0
    weak_links_count = 0

    for p in pages:
        if p.path not in CORE_PAGES and (p.inbound_links_count or 0) == 0:
            orphan_count += 1
            issues.append(
                {
                    "type": "orphan",
                    "severity": "medium",
                    "path": p.path,
                    "title": p.title,
                    "message": "Page has no inbound links.",
                }
            )

        out = _loads_list(p.outbound_links)
        if p.page_type in {"concept", "entity", "source", "analysis"} and len(out) == 0:
            weak_links_count += 1
            issues.append(
                {
                    "type": "missing_crossrefs",
                    "severity": "low",
                    "path": p.path,
                    "title": p.title,
                    "message": "Page has no outbound cross-references.",
                }
            )

        if p.page_type in {"source", "concept", "entity", "analysis"} and p.updated_at and p.updated_at < stale_cutoff:
            stale_count += 1
            issues.append(
                {
                    "type": "stale",
                    "severity": "low",
                    "path": p.path,
                    "title": p.title,
                    "message": "Page is older than 30 days.",
                }
            )

    open_contradictions = (
        db.query(models.AtlasWikiContradiction)
        .filter(
            models.AtlasWikiContradiction.user_id == user_id,
            models.AtlasWikiContradiction.status == "open",
        )
        .count()
    )

    if open_contradictions:
        issues.append(
            {
                "type": "contradictions",
                "severity": "high",
                "path": "",
                "title": "Open contradictions",
                "message": f"{open_contradictions} unresolved contradiction(s) found.",
            }
        )

    suggestions = []
    if orphan_count:
        suggestions.append("Add backlinks to orphan pages from concept and overview pages.")
    if weak_links_count:
        suggestions.append("Add related links in concept/entity/source pages.")
    if stale_count:
        suggestions.append("Re-compile stale pages from latest sources.")
    if open_contradictions:
        suggestions.append("Review and resolve open contradiction records.")
    if not suggestions:
        suggestions.append("Wiki health is good. Keep ingesting new sources and run lint weekly.")

    append_event(
        db,
        user_id,
        "lint",
        "Wiki lint completed",
        {
            "issues": len(issues),
            "orphan_pages": orphan_count,
            "stale_pages": stale_count,
            "weak_links": weak_links_count,
            "open_contradictions": open_contradictions,
        },
    )

    return {
        "issues": issues,
        "summary": {
            "total_pages": len(pages),
            "orphan_pages": orphan_count,
            "stale_pages": stale_count,
            "weak_links": weak_links_count,
            "open_contradictions": open_contradictions,
            "issue_count": len(issues),
        },
        "suggestions": suggestions,
    }
