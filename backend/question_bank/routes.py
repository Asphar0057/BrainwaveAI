import json
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import HTTPException, Depends, UploadFile, File, Query, Body
from sqlalchemy import text
from sqlalchemy.orm import Session

from deps import enforce_request_user_scope, get_current_user

from .models import (
    QuestionGenerationRequest,
    AnswerSubmission,
    SimilarQuestionRequest,
    MultiPDFGenerationRequest,
    MultiSourceGenerationRequest,
    RelatedPDFGenerationRequest,
)
from .agents import (
    PDFProcessorAgent,
    QuestionGeneratorAgent,
    DifficultyClassifierAgent,
    AdaptiveDifficultyAgent,
    MLPredictorAgent,
    ChatSlideProcessorAgent,
    PromptEnhancerAgent,
    TopicExtractorAgent,
    QuestionQualityAgent,
    BloomTaxonomyAgent,
    DuplicateDetectorAgent,
    AdaptiveGeneratorAgent,
    RelatedQuestionAgent,
    ExplanationEnhancerAgent,
    QuestionPreviewAgent,
    _normalize_document_type,
    infer_document_type,
    repair_text_spacing_artifacts,
    resolve_document_type,
)
from .pdf_utils import generate_question_set_pdf
from services.storage_service import StorageService
from services.answer_validation import answers_equivalent
from .utils import (
    _update_weak_areas,
    _compute_topic_performance_from_sessions,
    _merge_topics,
    _collect_universal_personalization,
    _merge_request_topics,
    _build_universal_personalization_prompt,
)

logger = logging.getLogger(__name__)

_QB_AUTH_DEPENDENCIES = [
    Depends(get_current_user),
    Depends(enforce_request_user_scope),
]

def _safe_storage_filename(filename: str) -> str:
    return re.sub(r"[^\w.\-]", "_", filename or "upload")[:180] or "upload"

def _store_question_bank_original(file_bytes: bytes, *, user_id: int, document_id: int, filename: str, content_type: str = "") -> dict:
    storage = StorageService.get_storage()
    safe_name = _safe_storage_filename(filename)
    storage_key = f"question_bank_documents/{user_id}/{document_id}/{safe_name}"
    result = storage.upload_bytes(file_bytes, storage_key, content_type or "application/pdf")
    storage_path = result.get("storage_path") or storage_key
    return {
        "storage_path": (
            storage.uri_for_path(storage_path)
            if hasattr(storage, "uri_for_path") and getattr(storage, "storage_type", "local") != "local"
            else storage_path
        ),
        "storage_type": result.get("storage_type") or getattr(storage, "storage_type", "local"),
        "storage_url": result.get("url") or "",
    }

def register_question_bank_api(app, unified_ai, get_db_func):

    agents = {
        "pdf_processor": PDFProcessorAgent(unified_ai),
        "question_generator": QuestionGeneratorAgent(unified_ai),
        "difficulty_classifier": DifficultyClassifierAgent(unified_ai),
        "adaptive_difficulty": AdaptiveDifficultyAgent(),
        "ml_predictor": MLPredictorAgent(),
        "chat_slide_processor": ChatSlideProcessorAgent(unified_ai),
        "prompt_enhancer": PromptEnhancerAgent(unified_ai),
        "topic_extractor": TopicExtractorAgent(unified_ai),
        "quality_scorer": QuestionQualityAgent(unified_ai),
        "bloom_tagger": BloomTaxonomyAgent(unified_ai),
        "duplicate_detector": DuplicateDetectorAgent(unified_ai),
        "adaptive_generator": AdaptiveGeneratorAgent(unified_ai),
        "related_question_agent": RelatedQuestionAgent(unified_ai),
        "explanation_enhancer": ExplanationEnhancerAgent(unified_ai),
        "question_preview": QuestionPreviewAgent(unified_ai)
    }

    def _resolve_user_identifier(models, db: Session, user_id: str):
        user_query = db.query(models.User)
        if str(user_id).isdigit():
            return user_query.filter(
                (models.User.id == int(user_id)) |
                (models.User.username == user_id) |
                (models.User.email == user_id)
            ).first()

        return user_query.filter(
            (models.User.username == user_id) | (models.User.email == user_id)
        ).first()

    def _extract_slide_text(models, db: Session, slide):
        content = (getattr(slide, "extracted_text", None) or "").strip()
        if content:
            return content

        analysis = db.query(models.SlideAnalysis).filter(
            models.SlideAnalysis.slide_id == slide.id
        ).first()
        if not analysis or not analysis.analysis_data:
            return ""

        try:
            analysis_data = json.loads(analysis.analysis_data)
        except (TypeError, json.JSONDecodeError):
            return str(analysis.analysis_data).strip()

        text_parts = []
        if isinstance(analysis_data, dict):
            for key in ("summary", "text", "extracted_text", "content"):
                value = analysis_data.get(key)
                if isinstance(value, str) and value.strip():
                    text_parts.append(value.strip())

            slides = analysis_data.get("slides")
            if isinstance(slides, list):
                for item in slides:
                    if isinstance(item, dict):
                        for key in ("text", "content", "summary", "notes"):
                            value = item.get(key)
                            if isinstance(value, str) and value.strip():
                                text_parts.append(value.strip())

        return "\n\n".join(text_parts).strip()

    def _slide_title(slide, fallback: Optional[str] = None):
        return (
            fallback
            or getattr(slide, "title", None)
            or getattr(slide, "original_filename", None)
            or getattr(slide, "filename", None)
            or f"Slide {slide.id}"
        )

    def _clean_question_payload_text(question_data: dict) -> dict:
        cleaned = dict(question_data or {})
        cleaned["question_text"] = repair_text_spacing_artifacts(
            cleaned.get("question_text") or cleaned.get("question")
        )
        cleaned["correct_answer"] = repair_text_spacing_artifacts(cleaned.get("correct_answer"))
        cleaned["topic"] = repair_text_spacing_artifacts(cleaned.get("topic") or "")
        cleaned["explanation"] = repair_text_spacing_artifacts(cleaned.get("explanation") or "")
        options = cleaned.get("options", [])
        cleaned["options"] = [
            repair_text_spacing_artifacts(option)
            for option in options
        ] if isinstance(options, list) else []

        question_type = str(cleaned.get("question_type") or "").strip().lower().strip("$")
        if question_type not in {"multiple_choice", "true_false", "short_answer", "fill_blank"}:
            question_type = (
                "true_false"
                if len(cleaned["options"]) == 2
                and {str(option).strip().lower() for option in cleaned["options"]} == {"true", "false"}
                else ("multiple_choice" if cleaned["options"] else "short_answer")
            )
        cleaned["question_type"] = question_type

        answer = str(cleaned.get("correct_answer") or "").strip()
        if cleaned.get("question_type") == "multiple_choice":
            answer_match = re.fullmatch(r"(?:option\s*)?([A-Da-d])(?:[).:-])?", answer, re.IGNORECASE)
            if answer_match:
                answer_index = ord(answer_match.group(1).upper()) - ord("A")
                if answer_index < len(cleaned["options"]):
                    cleaned["correct_answer"] = cleaned["options"][answer_index]
        return cleaned

    def _apply_adaptive_difficulty(db, user_id: int, request, topic_key: str):
        if not getattr(request, "adaptive_difficulty", False):
            return None, None

        stable_topic_key = (topic_key or "general").strip()[:50] or "general"
        try:
            from services.content_bandit import get_content_bandit

            selection = get_content_bandit().select_difficulty(
                db, str(user_id), "quiz", stable_topic_key,
            )
            request.difficulty_mix = {
                difficulty: int(difficulty == selection.difficulty)
                for difficulty in ("easy", "medium", "hard")
            }
            logger.info(
                "[QB_GENERATE] adaptive difficulty=%s method=%s topic=%r",
                selection.difficulty,
                selection.selection_method,
                stable_topic_key,
            )
            return selection, stable_topic_key
        except Exception as exc:
            logger.warning(
                "[QB_GENERATE] content bandit selection failed; using requested mix: %s",
                exc,
            )
            return None, None

    @app.post("/api/qb/upload_pdf", dependencies=_QB_AUTH_DEPENDENCIES)
    async def upload_pdf(
        file: UploadFile = File(...),
        user_id: str = Query(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            logger.info(f"Starting PDF upload for user: {user_id}, file: {file.filename}")

            if not file.filename.lower().endswith('.pdf'):
                raise HTTPException(status_code=400, detail="File must be a PDF")

            user_query = db.query(models.User)
            if str(user_id).isdigit():
                user = user_query.filter(
                    (models.User.id == int(user_id)) |
                    (models.User.username == user_id) |
                    (models.User.email == user_id)
                ).first()
            else:
                user = user_query.filter(
                    (models.User.username == user_id) | (models.User.email == user_id)
                ).first()

            if not user:
                logger.warning(f"User not found for identifier: {user_id[:20]}")
                raise HTTPException(status_code=404, detail="User not found")

            logger.info(f"Reading PDF file: {file.filename}")
            pdf_content = await file.read()

            if not pdf_content:
                raise HTTPException(status_code=400, detail="PDF file is empty")

            logger.info(f"Extracting text from PDF...")
            text = await agents["pdf_processor"].extract_text_from_pdf(pdf_content)

            if not text or len(text.strip()) == 0:
                raise HTTPException(status_code=400, detail="No text could be extracted from PDF")

            logger.info(f"Analyzing document content...")
            analysis = await agents["pdf_processor"].analyze_document(text, file.filename)
            document_type = resolve_document_type(analysis.get("document_type"), text, file.filename)
            analysis["document_type"] = document_type

            logger.info(f"Creating document record in database...")
            document = models.UploadedDocument(
                user_id=user.id,
                filename=file.filename,
                document_type=document_type,
                content=text,
                document_metadata=json.dumps(analysis)
            )

            db.add(document)
            db.commit()
            db.refresh(document)

            storage_info = _store_question_bank_original(
                pdf_content,
                user_id=user.id,
                document_id=document.id,
                filename=file.filename,
                content_type=file.content_type or "application/pdf",
            )
            document.storage_path = storage_info["storage_path"]
            document.storage_type = storage_info["storage_type"]
            document.storage_url = storage_info["storage_url"][:1000] if storage_info["storage_url"] else ""
            db.commit()
            db.refresh(document)

            logger.info(f"PDF uploaded successfully: document_id={document.id}")
            return {
                "status": "success",
                "document_id": document.id,
                "filename": file.filename,
                "analysis": analysis
            }

        except HTTPException as http_e:
            logger.error(f"HTTP Error uploading PDF: {http_e.detail}")
            try:
                db.rollback()
            except:
                pass
            raise http_e
        except Exception as e:
            logger.error(f"Unexpected error uploading PDF: {e}", exc_info=True)
            try:
                db.rollback()
            except:
                pass
            raise HTTPException(status_code=500, detail=f"Error uploading PDF: {str(e)}")

    @app.get("/api/qb/get_uploaded_documents", dependencies=_QB_AUTH_DEPENDENCIES)
    async def get_uploaded_documents(
        user_id: str = Query(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user_query = db.query(models.User)
            if str(user_id).isdigit():
                user = user_query.filter(
                    (models.User.id == int(user_id)) |
                    (models.User.username == user_id) |
                    (models.User.email == user_id)
                ).first()
            else:
                user = user_query.filter(
                    (models.User.username == user_id) | (models.User.email == user_id)
                ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            documents = db.query(models.UploadedDocument).filter(
                models.UploadedDocument.user_id == user.id
            ).order_by(models.UploadedDocument.created_at.desc()).all()

            documents_payload = []
            for doc in documents:
                analysis = json.loads(doc.document_metadata) if doc.document_metadata else {}
                document_type = resolve_document_type(
                    doc.document_type or analysis.get("document_type"),
                    doc.content or "",
                    doc.filename or ""
                )
                if analysis.get("document_type") != document_type:
                    analysis["document_type"] = document_type

                documents_payload.append({
                    "id": doc.id,
                    "filename": doc.filename,
                    "document_type": document_type,
                    "created_at": doc.created_at.isoformat(),
                    "analysis": analysis
                })

            return {
                "documents": documents_payload
            }

        except Exception as e:
            logger.error(f"Error fetching documents: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.delete("/api/qb/delete_document/{doc_id}", dependencies=_QB_AUTH_DEPENDENCIES)
    async def delete_document(
        doc_id: int,
        user_id: str = Query(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user = db.query(models.User).filter(
                (models.User.username == user_id) | (models.User.email == user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            document = db.query(models.UploadedDocument).filter(
                models.UploadedDocument.id == doc_id,
                models.UploadedDocument.user_id == user.id
            ).first()

            if not document:
                raise HTTPException(status_code=404, detail="Document not found")

            db.delete(document)
            db.commit()

            logger.info(f"Document {doc_id} deleted successfully for user {user_id}")
            return {"status": "success", "message": "Document deleted successfully"}

        except HTTPException as http_e:
            raise http_e
        except Exception as e:
            logger.error(f"Error deleting document: {e}")
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/generate_from_pdf", dependencies=_QB_AUTH_DEPENDENCIES)
    async def generate_from_pdf(
        request: QuestionGenerationRequest,
        db: Session = Depends(get_db_func)
    ):
        try:
            import models
            if request.session_id:
                logger.info(f"QB generate_from_pdf session_id={request.session_id}")

            user = _resolve_user_identifier(models, db, request.user_id)

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            personalization = _collect_universal_personalization(db, user, models)
            effective_topics = _merge_request_topics(request.topics, personalization, limit=10)
            effective_prompt = _build_universal_personalization_prompt(
                request.custom_prompt,
                personalization,
                "question generation from PDF/custom content"
            )

            adaptive_selection, bandit_topic_key = _apply_adaptive_difficulty(
                db,
                user.id,
                request,
                (
                    (effective_topics[0] if effective_topics else "")
                    or request.title
                    or (f"document:{request.source_id}" if request.source_id else "custom-content")
                ),
            )

            if request.source_id:
                document = db.query(models.UploadedDocument).filter(
                    models.UploadedDocument.id == request.source_id,
                    models.UploadedDocument.user_id == user.id
                ).first()

                if not document:
                    raise HTTPException(status_code=404, detail="Document not found")

                content = document.content
                metadata = json.loads(document.document_metadata) if document.document_metadata else {}
                title = request.title or f"Questions from {document.filename}"

                if metadata.get("document_type") == "questions":
                    existing_questions = await agents["question_generator"].extract_questions_from_pdf(content)

                    if existing_questions:
                        reference_lines = []
                        for idx, q in enumerate(existing_questions[:20], 1):
                            q_text = q.get("question_text", "")
                            q_type = q.get("question_type", "")
                            q_diff = q.get("difficulty", "")
                            options = q.get("options", []) if isinstance(q.get("options"), list) else []
                            option_text = " | ".join(options[:6]) if options else ""
                            reference_lines.append(
                                f"{idx}. [{q_type}/{q_diff}] {q_text}\nOptions: {option_text}".strip()
                            )
                        reference_content = "\n\n".join(reference_lines)
                        style_instruction = "Generate new questions that match the style and structure of the reference questions."
                        merged_custom_prompt = (
                            f"{style_instruction}\n\n{effective_prompt}".strip()
                            if effective_prompt else style_instruction
                        )
                        questions = await agents["question_generator"].generate_questions(
                            content,
                            request.question_count,
                            request.question_types,
                            request.difficulty_mix,
                            effective_topics,
                            custom_prompt=merged_custom_prompt,
                            reference_content=reference_content
                        )
                        if not questions:
                            logger.warning("Question-style generation returned no results; falling back to similar-question generation")
                            similar_questions = []
                            for orig_q in existing_questions[:request.question_count]:
                                similar = await agents["question_generator"].generate_similar_question(
                                    orig_q,
                                    difficulty=None
                                )
                                similar_questions.append(similar)
                            questions = similar_questions
                    else:
                        questions = await agents["question_generator"].generate_questions(
                            content,
                            request.question_count,
                            request.question_types,
                            request.difficulty_mix,
                            effective_topics,
                            custom_prompt=effective_prompt
                        )
                else:
                    questions = await agents["question_generator"].generate_questions(
                        content,
                        request.question_count,
                        request.question_types,
                        request.difficulty_mix,
                        effective_topics,
                        custom_prompt=effective_prompt
                    )

                source_type = "pdf"
            elif request.content:
                content = request.content
                title = request.title or "Custom Question Set"
                questions = await agents["question_generator"].generate_questions(
                    content,
                    request.question_count,
                    request.question_types,
                    request.difficulty_mix,
                    effective_topics,
                    custom_prompt=effective_prompt
                )
                source_type = "custom"
            else:
                raise HTTPException(status_code=400, detail="Must provide either source_id or content")

            if not questions:
                raise HTTPException(status_code=500, detail="Failed to generate questions")

            question_set = models.QuestionSet(
                user_id=user.id,
                title=title,
                description=f"Generated from {source_type}",
                source_type=source_type,
                source_id=request.source_id,
                bandit_episode_id=adaptive_selection.episode_id if adaptive_selection else None,
                bandit_topic_key=bandit_topic_key,
                total_questions=len(questions)
            )

            db.add(question_set)
            db.flush()

            for idx, q in enumerate(questions):
                q = _clean_question_payload_text(q)
                question = models.Question(
                    question_set_id=question_set.id,
                    question_text=q.get("question_text"),
                    question_type=q.get("question_type"),
                    difficulty=q.get("difficulty"),
                    topic=q.get("topic"),
                    correct_answer=q.get("correct_answer"),
                    options=json.dumps(q.get("options", [])),
                    explanation=q.get("explanation"),
                    points=q.get("points", 1),
                    order_index=idx
                )
                db.add(question)

            db.commit()
            db.refresh(question_set)

            return {
                "success": True,
                "status": "success",
                "question_set_id": question_set.id,
                "question_count": len(questions),
                "title": title,
                "personalization": {
                    "weak_topics": personalization.get("weak_topics", []),
                    "strong_topics": personalization.get("strong_topics", []),
                    "focus_topics": personalization.get("focus_topics", [])
                },
                "session_id": request.session_id
            }

        except Exception as e:
            logger.error(f"Error generating questions from PDF: {e}")
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/generate_from_multiple_pdfs", dependencies=_QB_AUTH_DEPENDENCIES)
    async def generate_from_multiple_pdfs(
        request: MultiPDFGenerationRequest,
        db: Session = Depends(get_db_func)
    ):
        try:
            import models
            if request.session_id:
                logger.info(f"QB generate_from_multiple_pdfs session_id={request.session_id}")

            logger.info(f"Generating questions from {len(request.source_ids)} PDFs for user {request.user_id}")

            user = _resolve_user_identifier(models, db, request.user_id)

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            personalization = _collect_universal_personalization(db, user, models)
            effective_topics = _merge_request_topics(request.topics, personalization, limit=10)
            effective_prompt = _build_universal_personalization_prompt(
                request.custom_prompt,
                personalization,
                "multi-PDF question generation"
            )

            if not request.source_ids or len(request.source_ids) == 0:
                raise HTTPException(status_code=400, detail="At least one PDF source is required")

            documents = db.query(models.UploadedDocument).filter(
                models.UploadedDocument.id.in_(request.source_ids),
                models.UploadedDocument.user_id == user.id
            ).all()

            if len(documents) == 0:
                raise HTTPException(status_code=404, detail="No documents found")

            if len(documents) != len(request.source_ids):
                logger.warning(f"Some documents not found. Requested: {len(request.source_ids)}, Found: {len(documents)}")

            combined_content_parts = []
            document_names = []

            for doc in documents:
                document_names.append(doc.filename)
                combined_content_parts.append(f"=== Document: {doc.filename} ===\n{doc.content}")

            combined_content = "\n\n".join(combined_content_parts)
            logger.info(f"Combined content from {len(documents)} documents: {len(combined_content)} chars")

            if request.title:
                title = request.title
            elif len(document_names) == 1:
                title = f"Questions from {document_names[0]}"
            elif len(document_names) <= 3:
                title = f"Questions from {', '.join(document_names)}"
            else:
                title = f"Questions from {len(document_names)} documents"

            reference_content = None
            main_content = combined_content

            if request.reference_document_id:
                reference_doc = next((d for d in documents if d.id == request.reference_document_id), None)
                if request.content_document_ids:
                    content_docs = [d for d in documents if d.id in request.content_document_ids]
                else:
                    content_docs = [d for d in documents if d.id != request.reference_document_id]

                if reference_doc:
                    reference_content = f"=== Reference: {reference_doc.filename} ===\n{reference_doc.content}"
                    logger.info(f"Using {reference_doc.filename} as reference/sample questions")

                if content_docs:
                    main_content = "\n\n".join([
                        f"=== Content: {d.filename} ===\n{d.content}" for d in content_docs
                    ])
                    logger.info(f"Using {len(content_docs)} documents as main content")

            if request.custom_prompt:
                logger.info(f"Custom prompt provided: {request.custom_prompt[:100]}...")

            adaptive_selection, bandit_topic_key = _apply_adaptive_difficulty(
                db,
                user.id,
                request,
                (
                    (effective_topics[0] if effective_topics else "")
                    or request.title
                    or "documents:" + ",".join(str(doc_id) for doc_id in sorted(request.source_ids))
                ),
            )

            questions = await agents["question_generator"].generate_questions(
                main_content,
                request.question_count,
                request.question_types,
                request.difficulty_mix,
                effective_topics,
                custom_prompt=effective_prompt,
                reference_content=reference_content
            )

            if not questions:
                raise HTTPException(status_code=500, detail="Failed to generate questions from the provided documents")

            description_parts = [f"Generated from {len(documents)} PDF documents"]
            if request.custom_prompt:
                description_parts.append("with custom instructions")
            if reference_content:
                description_parts.append("using reference style")
            description = f"{'. '.join(description_parts)}: {', '.join(document_names[:3])}{'...' if len(document_names) > 3 else ''}"

            question_set = models.QuestionSet(
                user_id=user.id,
                title=title,
                description=description,
                source_type="multi_pdf",
                source_id=None,
                bandit_episode_id=adaptive_selection.episode_id if adaptive_selection else None,
                bandit_topic_key=bandit_topic_key,
                total_questions=len(questions)
            )

            db.add(question_set)
            db.flush()

            for idx, q in enumerate(questions):
                q = _clean_question_payload_text(q)
                question = models.Question(
                    question_set_id=question_set.id,
                    question_text=q.get("question_text"),
                    question_type=q.get("question_type"),
                    difficulty=q.get("difficulty"),
                    topic=q.get("topic"),
                    correct_answer=q.get("correct_answer"),
                    options=json.dumps(q.get("options", [])),
                    explanation=q.get("explanation"),
                    points=q.get("points", 1),
                    order_index=idx
                )
                db.add(question)

            db.commit()
            db.refresh(question_set)

            logger.info(f"Successfully generated {len(questions)} questions from {len(documents)} PDFs")

            return {
                "status": "success",
                "question_set_id": question_set.id,
                "question_count": len(questions),
                "title": title,
                "source_documents": document_names,
                "personalization": {
                    "weak_topics": personalization.get("weak_topics", []),
                    "strong_topics": personalization.get("strong_topics", []),
                    "focus_topics": personalization.get("focus_topics", [])
                },
                "session_id": request.session_id
            }

        except HTTPException as http_e:
            raise http_e
        except Exception as e:
            logger.error(f"Error generating questions from multiple PDFs: {e}", exc_info=True)
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/generate_related_from_pdf", dependencies=_QB_AUTH_DEPENDENCIES)
    async def generate_related_from_pdf(
        request: RelatedPDFGenerationRequest,
        db: Session = Depends(get_db_func)
    ):
        try:
            import models
            if request.session_id:
                logger.info(f"QB generate_related_from_pdf session_id={request.session_id}")

            logger.info(
                f"Generating related questions from {len(request.source_ids)} PDFs for user {request.user_id}"
            )

            user = _resolve_user_identifier(models, db, request.user_id)

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            personalization = _collect_universal_personalization(db, user, models)

            if not request.source_ids:
                raise HTTPException(status_code=400, detail="At least one PDF source is required")

            documents = db.query(models.UploadedDocument).filter(
                models.UploadedDocument.id.in_(request.source_ids),
                models.UploadedDocument.user_id == user.id
            ).all()

            if not documents:
                raise HTTPException(status_code=404, detail="No documents found")

            combined_content_parts = []
            document_names = []
            for doc in documents:
                document_names.append(doc.filename)
                combined_content_parts.append(f"=== Document: {doc.filename} ===\n{doc.content}")

            combined_content = "\n\n".join(combined_content_parts)
            logger.info(f"Combined content length: {len(combined_content)} chars")

            weak_areas = db.query(models.UserWeakArea).filter(
                models.UserWeakArea.user_id == user.id,
                models.UserWeakArea.status != "mastered"
            ).order_by(
                models.UserWeakArea.priority.desc(),
                models.UserWeakArea.weakness_score.desc()
            ).limit(5).all()
            weak_topics = [wa.topic for wa in weak_areas if wa.topic]

            chroma_weak_topics = []
            try:
                from tutor import chroma_store
                if chroma_store.available():
                    chroma_weak_topics = chroma_store.get_weak_quiz_topics(str(user.id), top_k=5)
            except Exception as e:
                logger.warning(f"Chroma weak topic retrieval failed: {e}")

            sessions = db.query(models.QuestionSession).filter(
                models.QuestionSession.user_id == user.id
            ).order_by(models.QuestionSession.completed_at.desc()).limit(50).all()

            topic_performance = _compute_topic_performance_from_sessions(sessions)

            analytics_weak_topics = []
            if topic_performance:
                analytics_weak_topics = [t["topic"] for t in topic_performance if t["accuracy"] < 60][:5]

            weak_topics = _merge_topics(
                weak_topics,
                chroma_weak_topics,
                analytics_weak_topics,
                personalization.get("weak_topics", []),
                limit=8
            )

            strong_topics = [
                t["topic"]
                for t in sorted(topic_performance, key=lambda x: -x["accuracy"])
                if t["accuracy"] >= 80
                and t["total_questions"] >= 3
                and t["topic"] not in weak_topics
            ][:5]

            strong_topics = _merge_topics(strong_topics, personalization.get("strong_topics", []), limit=5)

            related_prompt = agents["related_question_agent"].build_prompt(
                weak_topics, strong_topics
            )
            personalized_prompt = _build_universal_personalization_prompt(
                related_prompt,
                personalization,
                "related generation from PDFs"
            )

            effective_topics = _merge_topics(
                request.topics or [],
                weak_topics,
                personalization.get("preferred_topics", []),
                limit=10
            )

            questions = await agents["question_generator"].generate_questions(
                combined_content,
                request.question_count,
                request.question_types,
                request.difficulty_mix,
                effective_topics or None,
                custom_prompt=personalized_prompt
            )

            if not questions:
                raise HTTPException(status_code=500, detail="Failed to generate related questions")

            title = request.title or (
                f"Related Questions from {document_names[0]}"
                if len(document_names) == 1
                else f"Related Questions from {len(document_names)} documents"
            )

            return {
                "status": "success",
                "questions": questions,
                "title": title,
                "personalization": {
                    "weak_topics": weak_topics,
                    "strong_topics": strong_topics,
                    "focus_topics": personalization.get("focus_topics", [])
                },
                "session_id": request.session_id
            }

        except HTTPException as http_e:
            raise http_e
        except Exception as e:
            logger.error(f"Error generating related questions from PDFs: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/smart_generate", dependencies=_QB_AUTH_DEPENDENCIES)
    async def smart_generate_questions(
        request: MultiPDFGenerationRequest,
        db: Session = Depends(get_db_func)
    ):
        try:
            import models
            if request.session_id:
                logger.info(f"QB smart_generate session_id={request.session_id}")

            logger.info(f"Smart generation for user {request.user_id} with {len(request.source_ids)} sources")
            if request.custom_prompt:
                logger.info(f"Custom prompt: {request.custom_prompt[:100]}...")

            user = _resolve_user_identifier(models, db, request.user_id)

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            personalization = _collect_universal_personalization(db, user, models)
            effective_topics = _merge_request_topics(request.topics, personalization, limit=10)
            effective_prompt = _build_universal_personalization_prompt(
                request.custom_prompt,
                personalization,
                "smart multi-document generation"
            )

            documents = db.query(models.UploadedDocument).filter(
                models.UploadedDocument.id.in_(request.source_ids),
                models.UploadedDocument.user_id == user.id
            ).all()

            if not documents:
                raise HTTPException(status_code=404, detail="No documents found")

            doc_map = {d.id: d for d in documents}
            document_names = [d.filename for d in documents]

            reference_content = None
            main_content_parts = []

            if request.reference_document_id and request.reference_document_id in doc_map:
                ref_doc = doc_map[request.reference_document_id]
                reference_content = f"=== REFERENCE DOCUMENT: {ref_doc.filename} ===\n{ref_doc.content}"
                logger.info(f"Reference document: {ref_doc.filename}")

            content_ids = request.content_document_ids or [
                d.id for d in documents if d.id != request.reference_document_id
            ]

            for doc_id in content_ids:
                if doc_id in doc_map:
                    doc = doc_map[doc_id]
                    main_content_parts.append(f"=== CONTENT: {doc.filename} ===\n{doc.content}")

            if not main_content_parts:
                for doc in documents:
                    if doc.id != request.reference_document_id:
                        main_content_parts.append(f"=== CONTENT: {doc.filename} ===\n{doc.content}")

            main_content = "\n\n".join(main_content_parts)

            if not main_content.strip():
                raise HTTPException(status_code=400, detail="No content to generate questions from")

            logger.info(f"Main content: {len(main_content)} chars from {len(main_content_parts)} docs")

            title = request.title or f"Smart Questions from {len(documents)} documents"

            adaptive_selection, bandit_topic_key = _apply_adaptive_difficulty(
                db,
                user.id,
                request,
                (
                    (effective_topics[0] if effective_topics else "")
                    or title
                    or "documents:" + ",".join(str(doc_id) for doc_id in sorted(request.source_ids))
                ),
            )

            questions = await agents["question_generator"].generate_questions(
                main_content,
                request.question_count,
                request.question_types,
                request.difficulty_mix,
                effective_topics,
                custom_prompt=effective_prompt,
                reference_content=reference_content
            )

            if not questions:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to generate questions. The AI response could not be parsed. Please try again with a simpler prompt or fewer documents."
                )

            desc_parts = []
            if request.custom_prompt:
                desc_parts.append(f"Custom: {request.custom_prompt[:50]}...")
            if reference_content:
                desc_parts.append("Style matched to reference")
            desc_parts.append(f"Sources: {', '.join(document_names[:3])}")

            question_set = models.QuestionSet(
                user_id=user.id,
                title=title,
                description=" | ".join(desc_parts),
                source_type="smart_multi_pdf",
                source_id=None,
                bandit_episode_id=adaptive_selection.episode_id if adaptive_selection else None,
                bandit_topic_key=bandit_topic_key,
                total_questions=len(questions)
            )

            db.add(question_set)
            db.flush()

            for idx, q in enumerate(questions):
                q = _clean_question_payload_text(q)
                question = models.Question(
                    question_set_id=question_set.id,
                    question_text=q.get("question_text"),
                    question_type=q.get("question_type"),
                    difficulty=q.get("difficulty"),
                    topic=q.get("topic"),
                    correct_answer=q.get("correct_answer"),
                    options=json.dumps(q.get("options", [])),
                    explanation=q.get("explanation"),
                    points=q.get("points", 1),
                    order_index=idx
                )
                db.add(question)

            db.commit()
            db.refresh(question_set)

            logger.info(f"Smart generation complete: {len(questions)} questions")

            return {
                "status": "success",
                "question_set_id": question_set.id,
                "question_count": len(questions),
                "title": title,
                "source_documents": document_names,
                "used_reference": reference_content is not None,
                "used_custom_prompt": request.custom_prompt is not None,
                "personalization": {
                    "weak_topics": personalization.get("weak_topics", []),
                    "strong_topics": personalization.get("strong_topics", []),
                    "focus_topics": personalization.get("focus_topics", [])
                },
                "session_id": request.session_id
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Smart generation error: {e}", exc_info=True)
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/generate_from_chat_slides", dependencies=_QB_AUTH_DEPENDENCIES)
    async def generate_from_chat_slides(
        request: QuestionGenerationRequest,
        db: Session = Depends(get_db_func)
    ):
        try:
            import models
            if request.session_id:
                logger.info(f"QB generate_from_chat_slides session_id={request.session_id}")

            user = db.query(models.User).filter(
                (models.User.username == request.user_id) | (models.User.email == request.user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            personalization = _collect_universal_personalization(db, user, models)
            effective_topics = _merge_request_topics(request.topics, personalization, limit=10)
            effective_prompt = _build_universal_personalization_prompt(
                request.custom_prompt,
                personalization,
                "chat/slide question generation"
            )

            content_parts = []
            title_parts = []

            request_source_type = (request.source_type or "").lower().strip()

            if request_source_type == "chat":
                chat = db.query(models.ChatSession).filter(
                    models.ChatSession.id == request.source_id,
                    models.ChatSession.user_id == user.id
                ).first()

                if not chat:
                    raise HTTPException(status_code=404, detail="Chat session not found")

                messages = db.query(models.ChatMessage).filter(
                    models.ChatMessage.chat_session_id == chat.id
                ).order_by(models.ChatMessage.timestamp.asc()).all()

                chat_content = await agents["chat_slide_processor"].extract_content_from_chat([
                    {"user_message": m.user_message, "ai_response": m.ai_response}
                    for m in messages
                ])
                content_parts.append(chat_content)
                title_parts.append(chat.title)

            elif request_source_type in ("slide", "slides", "presentation"):
                slide = db.query(models.UploadedSlide).filter(
                    models.UploadedSlide.id == request.source_id,
                    models.UploadedSlide.user_id == user.id
                ).first()

                if not slide:
                    raise HTTPException(status_code=404, detail="Slide not found")

                slide_content = _extract_slide_text(models, db, slide)
                if not slide_content:
                    raise HTTPException(
                        status_code=400,
                        detail=f"No readable text found in slide file: {_slide_title(slide)}"
                    )

                content_parts.append(slide_content)
                title_parts.append(_slide_title(slide))

            combined_content = "\n\n".join(content_parts)
            title = request.title or f"Questions from {', '.join(title_parts)}"

            questions = await agents["question_generator"].generate_questions(
                combined_content,
                request.question_count,
                request.question_types,
                request.difficulty_mix,
                effective_topics,
                custom_prompt=effective_prompt
            )

            if not questions:
                raise HTTPException(status_code=500, detail="Failed to generate questions")

            question_set = models.QuestionSet(
                user_id=user.id,
                title=title,
                description=f"Generated from {request.source_type}",
                source_type=request.source_type,
                source_id=request.source_id,
                total_questions=len(questions)
            )

            db.add(question_set)
            db.flush()

            for idx, q in enumerate(questions):
                q = _clean_question_payload_text(q)
                question = models.Question(
                    question_set_id=question_set.id,
                    question_text=q.get("question_text"),
                    question_type=q.get("question_type"),
                    difficulty=q.get("difficulty"),
                    topic=q.get("topic"),
                    correct_answer=q.get("correct_answer"),
                    options=json.dumps(q.get("options", [])),
                    explanation=q.get("explanation"),
                    points=q.get("points", 1),
                    order_index=idx
                )
                db.add(question)

            db.commit()
            db.refresh(question_set)

            return {
                "status": "success",
                "question_set_id": question_set.id,
                "question_count": len(questions),
                "title": title,
                "personalization": {
                    "weak_topics": personalization.get("weak_topics", []),
                    "strong_topics": personalization.get("strong_topics", []),
                    "focus_topics": personalization.get("focus_topics", [])
                },
                "session_id": request.session_id
            }

        except Exception as e:
            logger.error(f"Error generating questions: {e}")
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/generate_from_sources", dependencies=_QB_AUTH_DEPENDENCIES)
    async def generate_from_sources(
        request: MultiSourceGenerationRequest,
        db: Session = Depends(get_db_func)
    ):
        try:
            import models
            if request.session_id:
                logger.info(f"QB generate_from_sources session_id={request.session_id}")

            user = db.query(models.User).filter(
                (models.User.username == request.user_id) | (models.User.email == request.user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            personalization = _collect_universal_personalization(db, user, models)
            effective_topics = _merge_request_topics(request.topics, personalization, limit=10)
            effective_prompt = _build_universal_personalization_prompt(
                request.custom_prompt,
                personalization,
                "multi-source question generation"
            )

            if not request.sources:
                raise HTTPException(status_code=400, detail="At least one source is required")

            content_parts = []
            title_parts = []

            for source in request.sources:
                source_type = (source.type or "").lower().strip()

                if source_type == "chat":
                    chat = db.query(models.ChatSession).filter(
                        models.ChatSession.id == source.id,
                        models.ChatSession.user_id == user.id
                    ).first()

                    if not chat:
                        logger.warning(f"Chat source not found or unauthorized: {source.id}")
                        continue

                    messages = db.query(models.ChatMessage).filter(
                        models.ChatMessage.chat_session_id == chat.id
                    ).order_by(models.ChatMessage.timestamp.asc()).all()

                    chat_content = await agents["chat_slide_processor"].extract_content_from_chat([
                        {"user_message": m.user_message, "ai_response": m.ai_response}
                        for m in messages
                    ])
                    content_parts.append(chat_content)
                    title_parts.append(chat.title or source.title or f"Chat {source.id}")

                elif source_type in ("slide", "slides", "presentation"):
                    slide = db.query(models.UploadedSlide).filter(
                        models.UploadedSlide.id == source.id,
                        models.UploadedSlide.user_id == user.id
                    ).first()

                    if not slide:
                        logger.warning(f"Slide source not found or unauthorized: {source.id}")
                        continue

                    slide_content = _extract_slide_text(models, db, slide)
                    if not slide_content:
                        logger.warning(f"Slide source has no readable text: {source.id}")
                        continue

                    content_parts.append(slide_content)
                    title_parts.append(_slide_title(slide, source.title))

                else:
                    logger.warning(f"Unsupported source type skipped: {source.type}")

            combined_content = "\n\n".join([c for c in content_parts if c and c.strip()])
            if not combined_content.strip():
                raise HTTPException(
                    status_code=400,
                    detail="No readable text found in the selected slides/sources. Try a text-based PDF/PPTX or re-upload the slide file."
                )

            title = request.title or (
                f"Questions from {title_parts[0]}"
                if len(title_parts) == 1 else f"Questions from {len(title_parts)} sources"
            )

            adaptive_selection, bandit_topic_key = _apply_adaptive_difficulty(
                db,
                user.id,
                request,
                (effective_topics[0] if effective_topics else "") or title,
            )

            questions = await agents["question_generator"].generate_questions(
                combined_content,
                request.question_count,
                request.question_types,
                request.difficulty_mix,
                effective_topics,
                custom_prompt=effective_prompt
            )

            if not questions:
                raise HTTPException(status_code=500, detail="Failed to generate questions")

            question_set = models.QuestionSet(
                user_id=user.id,
                title=title,
                description=f"Generated from {len(title_parts)} source(s)",
                source_type="multi_source",
                source_id=None,
                bandit_episode_id=adaptive_selection.episode_id if adaptive_selection else None,
                bandit_topic_key=bandit_topic_key,
                total_questions=len(questions)
            )

            db.add(question_set)
            db.flush()

            for idx, q in enumerate(questions):
                q = _clean_question_payload_text(q)
                question = models.Question(
                    question_set_id=question_set.id,
                    question_text=q.get("question_text"),
                    question_type=q.get("question_type"),
                    difficulty=q.get("difficulty"),
                    topic=q.get("topic"),
                    correct_answer=q.get("correct_answer"),
                    options=json.dumps(q.get("options", [])),
                    explanation=q.get("explanation"),
                    points=q.get("points", 1),
                    order_index=idx
                )
                db.add(question)

            db.commit()
            db.refresh(question_set)

            return {
                "status": "success",
                "success": True,
                "question_set_id": question_set.id,
                "question_count": len(questions),
                "title": title,
                "personalization": {
                    "weak_topics": personalization.get("weak_topics", []),
                    "strong_topics": personalization.get("strong_topics", []),
                    "focus_topics": personalization.get("focus_topics", [])
                },
                "session_id": request.session_id
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error generating from sources: {e}", exc_info=True)
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/qb/get_question_sets", dependencies=_QB_AUTH_DEPENDENCIES)
    async def get_question_sets(
        user_id: str = Query(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user = db.query(models.User).filter(
                (models.User.username == user_id) | (models.User.email == user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            question_sets = db.query(models.QuestionSet).filter(
                models.QuestionSet.user_id == user.id
            ).order_by(models.QuestionSet.created_at.desc()).all()

            return {
                "question_sets": [
                    {
                        "id": qs.id,
                        "title": qs.title,
                        "description": qs.description,
                        "source_type": qs.source_type,
                        "total_questions": qs.total_questions,
                        "best_score": qs.best_score,
                        "attempts": qs.attempts,
                        "created_at": qs.created_at.isoformat(),
                        "updated_at": qs.updated_at.isoformat()
                    }
                    for qs in question_sets
                ]
            }

        except Exception as e:
            logger.error(f"Error fetching question sets: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/qb/get_question_set/{set_id}", dependencies=_QB_AUTH_DEPENDENCIES)
    async def get_question_set_detail(
        set_id: int,
        user_id: str = Query(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            logger.info(f"get_question_set_detail called: set_id={set_id}, user_id={user_id}")

            user = db.query(models.User).filter(
                (models.User.username == user_id) | (models.User.email == user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            logger.info(f"Found user: {user.id}")

            question_set = db.query(models.QuestionSet).filter(
                models.QuestionSet.id == set_id,
                models.QuestionSet.user_id == user.id
            ).first()

            if not question_set:
                raise HTTPException(status_code=404, detail="Question set not found")

            logger.info(f"Found question set: {question_set.id}, title={question_set.title}")

            questions = db.query(models.Question).filter(
                models.Question.question_set_id == set_id
            ).order_by(models.Question.order_index).all()

            seen_question_signatures = set()
            unique_questions = []
            for q in questions:
                try:
                    normalized_options = json.dumps(
                        [str(option).strip().lower() for option in (json.loads(q.options) if q.options else [])],
                        sort_keys=True
                    )
                except Exception:
                    normalized_options = str(q.options or "").strip().lower()

                signature = (
                    str(q.question_text or "").strip().lower(),
                    str(q.correct_answer or "").strip().lower(),
                    normalized_options
                )
                if signature[0] and signature not in seen_question_signatures:
                    seen_question_signatures.add(signature)
                    unique_questions.append(q)

            logger.info(f"Found {len(questions)} questions for set {set_id}, {len(unique_questions)} unique")

            raw_count = db.execute(text("SELECT COUNT(*) FROM questions WHERE question_set_id = :set_id"), {"set_id": set_id}).scalar()
            logger.info(f"Raw SQL count: {raw_count} questions for set {set_id}")

            result = {
                "id": question_set.id,
                "title": question_set.title,
                "description": question_set.description,
                "source_type": question_set.source_type,
                "total_questions": len(unique_questions),
                "best_score": question_set.best_score,
                "attempts": question_set.attempts,
                "created_at": question_set.created_at.isoformat(),
                "questions": [
                    _clean_question_payload_text({
                        "id": q.id,
                        "question_text": q.question_text,
                        "question_type": q.question_type,
                        "difficulty": q.difficulty,
                        "topic": q.topic,
                        "correct_answer": q.correct_answer,
                        "options": json.loads(q.options) if q.options else [],
                        "explanation": q.explanation,
                        "points": q.points
                    })
                    for q in unique_questions
                ]
            }

            logger.info(f"Returning question set {set_id} with {len(questions)} questions")
            if questions:
                logger.info(f"First question options raw: {questions[0].options}")

            return result

        except Exception as e:
            logger.error(f"Error fetching question set: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.delete("/api/qb/delete_question_set/{set_id}", dependencies=_QB_AUTH_DEPENDENCIES)
    async def delete_question_set(
        set_id: int,
        user_id: str = Query(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user_query = db.query(models.User)
            if str(user_id).isdigit():
                user = user_query.filter(
                    (models.User.id == int(user_id)) |
                    (models.User.username == user_id) |
                    (models.User.email == user_id)
                ).first()
            else:
                user = user_query.filter(
                    (models.User.username == user_id) | (models.User.email == user_id)
                ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            question_set = db.query(models.QuestionSet).filter(
                models.QuestionSet.id == set_id,
                models.QuestionSet.user_id == user.id
            ).first()

            if not question_set:
                raise HTTPException(status_code=404, detail="Question set not found")

            question_ids = [
                row[0]
                for row in db.query(models.Question.id)
                .filter(models.Question.question_set_id == set_id)
                .all()
            ]

            if question_ids and hasattr(models, "QuestionResult"):
                db.query(models.QuestionResult).filter(
                    models.QuestionResult.question_id.in_(question_ids)
                ).delete(synchronize_session=False)

            if hasattr(models, "WrongAnswerLog"):
                db.query(models.WrongAnswerLog).filter(
                    models.WrongAnswerLog.question_set_id == set_id
                ).delete(synchronize_session=False)

            if hasattr(models, "PracticeRecommendation"):
                db.query(models.PracticeRecommendation).filter(
                    models.PracticeRecommendation.question_set_id == set_id
                ).delete(synchronize_session=False)

            if hasattr(models, "QuestionSetSlide"):
                db.query(models.QuestionSetSlide).filter(
                    models.QuestionSetSlide.question_set_id == set_id
                ).delete(synchronize_session=False)

            if hasattr(models, "QuestionAttempt"):
                db.query(models.QuestionAttempt).filter(
                    models.QuestionAttempt.question_set_id == set_id
                ).delete(synchronize_session=False)

            db.query(models.QuestionSession).filter(
                models.QuestionSession.question_set_id == set_id
            ).delete(synchronize_session=False)

            db.query(models.Question).filter(
                models.Question.question_set_id == set_id
            ).delete(synchronize_session=False)

            db.delete(question_set)
            db.commit()

            return {"status": "success", "message": "Question set deleted", "deleted_set_id": set_id}

        except Exception as e:
            logger.error(f"Error deleting question set: {e}")
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @app.patch("/api/qb/question_sets/{set_id}/title", dependencies=_QB_AUTH_DEPENDENCIES)
    async def rename_question_set(
        set_id: int,
        payload: dict = Body(...),
        user_id: str = Query(...),
        db: Session = Depends(get_db_func),
    ):
        """Rename a question set while enforcing ownership through the request user."""
        try:
            import models

            title = " ".join(str(payload.get("title") or "").split())
            if not title:
                raise HTTPException(status_code=422, detail="A question set name is required")
            if len(title) > 120:
                raise HTTPException(status_code=422, detail="Keep the question set name under 120 characters")

            user_query = db.query(models.User)
            if str(user_id).isdigit():
                user = user_query.filter(
                    (models.User.id == int(user_id)) |
                    (models.User.username == user_id) |
                    (models.User.email == user_id)
                ).first()
            else:
                user = user_query.filter(
                    (models.User.username == user_id) | (models.User.email == user_id)
                ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            question_set = db.query(models.QuestionSet).filter(
                models.QuestionSet.id == set_id,
                models.QuestionSet.user_id == user.id,
            ).first()
            if not question_set:
                raise HTTPException(status_code=404, detail="Question set not found")

            question_set.title = title
            question_set.updated_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(question_set)

            return {
                "status": "success",
                "id": question_set.id,
                "title": question_set.title,
                "updated_at": question_set.updated_at.isoformat(),
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error renaming question set: {e}")
            db.rollback()
            raise HTTPException(status_code=500, detail="Unable to rename question set")

    @app.post("/api/qb/submit_answers", dependencies=_QB_AUTH_DEPENDENCIES)
    async def submit_answers(
        request: AnswerSubmission,
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user = db.query(models.User).filter(
                (models.User.username == request.user_id) | (models.User.email == request.user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            question_set = db.query(models.QuestionSet).filter(
                models.QuestionSet.id == request.question_set_id
            ).first()

            if not question_set:
                raise HTTPException(status_code=404, detail="Question set not found")

            already_completed = db.query(models.QuestionSession.id).filter(
                models.QuestionSession.user_id == user.id,
                models.QuestionSession.question_set_id == request.question_set_id
            ).first() is not None

            questions = db.query(models.Question).filter(
                models.Question.question_set_id == request.question_set_id
            ).all()

            results = []
            correct_count = 0
            total_points = 0
            earned_points = 0

            for question in questions:
                user_answer = request.answers.get(str(question.id), "")
                correct_answer = str(question.correct_answer).strip().lower()
                user_answer_normalized = str(user_answer).strip().lower()

                if question.question_type in ['short_answer', 'fill_blank']:
                    correct_clean = re.sub(r'[^\w\s]', '', correct_answer).strip()
                    user_clean = re.sub(r'[^\w\s]', '', user_answer_normalized).strip()

                    is_correct = user_clean == correct_clean

                    if not is_correct and correct_clean:
                        correct_words = set(correct_clean.split())
                        user_words = set(user_clean.split())
                        if correct_words and len(correct_words & user_words) / len(correct_words) >= 0.8:
                            is_correct = True
                else:
                    try:
                        answer_options = json.loads(question.options) if question.options else []
                    except (TypeError, ValueError, json.JSONDecodeError):
                        answer_options = []
                    is_correct = answers_equivalent(user_answer, question.correct_answer, answer_options)

                if is_correct:
                    correct_count += 1
                    earned_points += question.points

                total_points += question.points

                results.append({
                    "question_id": question.id,
                    "question_set_id": request.question_set_id,
                    "question_text": question.question_text,
                    "user_answer": user_answer,
                    "correct_answer": question.correct_answer,
                    "is_correct": is_correct,
                    "difficulty": question.difficulty,
                    "topic": str(question.topic or question_set.title or "General").strip() or "General",
                    "explanation": question.explanation,
                    "points": question.points
                })

            score = int((earned_points / total_points) * 100) if total_points > 0 else 0

            # New question sets persist the exact selection identity. The topic
            # reconstruction remains only for legacy sets created before that link existed.
            try:
                bandit_topic_key = question_set.bandit_topic_key
                if not bandit_topic_key and results:
                    bandit_topic_key = (results[0].get("topic") or "").strip()[:50]
                if not bandit_topic_key:
                    bandit_topic_key = (question_set.title or "").strip()[:50]
                if bandit_topic_key:
                    from services.content_bandit import get_content_bandit
                    get_content_bandit().resolve_reward(
                        db,
                        str(user.id),
                        "quiz",
                        bandit_topic_key,
                        score / 100.0,
                        episode_id=question_set.bandit_episode_id,
                    )
            except Exception as bandit_err:
                logger.warning(f"[QB_SUBMIT] content bandit reward resolution failed: {bandit_err}")

            adaptive_integration = None
            try:
                from adaptive_learning_integration import get_adaptive_integration
                adaptive_integration = get_adaptive_integration()

                for question in questions:
                    user_answer = request.answers.get(str(question.id))
                    if user_answer:
                        is_correct = user_answer.strip().lower() == question.correct_answer.strip().lower()
                        response_time = request.time_taken_seconds / len(questions) if request.time_taken_seconds else 30

                        adaptive_integration.process_question_bank_answer(
                            db, user.id, question.id, is_correct, response_time
                        )
            except Exception as adaptive_error:
                logger.warning(f"Adaptive answer tracking failed for question bank submission: {adaptive_error}")

            session_record = models.QuestionSession(
                user_id=user.id,
                question_set_id=request.question_set_id,
                score=score,
                total_questions=len(questions),
                correct_count=correct_count,
                results=json.dumps(results),
                time_taken_seconds=request.time_taken_seconds,
                completed_at=datetime.now(timezone.utc)
            )

            db.add(session_record)

            if score > question_set.best_score:
                question_set.best_score = score
            question_set.attempts += 1
            question_set.updated_at = datetime.now(timezone.utc)

            db.commit()
            db.refresh(session_record)

            user_history = db.query(models.QuestionSession).filter(
                models.QuestionSession.user_id == user.id
            ).order_by(models.QuestionSession.completed_at.desc()).limit(10).all()

            history_data = []
            for session in user_history:
                history_data.append({
                    "score": session.score,
                    "results": json.loads(session.results) if session.results else []
                })

            adaptation = agents["adaptive_difficulty"].analyze_performance(history_data)

            adaptive_recommendations = None
            if adaptive_integration:
                try:
                    adaptive_recommendations = adaptive_integration.get_session_recommendations(user.id)
                except Exception as recommendation_error:
                    logger.warning(f"Adaptive recommendations failed for question bank submission: {recommendation_error}")

            try:
                await _update_weak_areas(db, user.id, results, models)
            except Exception as weak_area_error:
                logger.warning(f"Weak area update failed for question bank submission: {weak_area_error}")

            gamification = None
            xp_awarded = False
            if not already_completed:
                try:
                    from services.gamification_system import award_points

                    question_points = award_points(
                        db,
                        user.id,
                        "question_answered",
                        {
                            "count": len(questions),
                            "correct_count": correct_count,
                            "incorrect_count": len(questions) - correct_count,
                            "question_set_id": request.question_set_id,
                            "source": "question_bank_submit"
                        }
                    )

                    quiz_points = award_points(
                        db,
                        user.id,
                        "quiz_completed",
                        {
                            "score": earned_points,
                            "total_questions": len(questions),
                            "score_percentage": score,
                            "question_set_id": request.question_set_id,
                            "source": "question_bank_submit"
                        }
                    )

                    gamification = {
                        "question_answered": question_points,
                        "quiz_completed": quiz_points
                    }
                    xp_awarded = True
                except Exception as gamification_error:
                    logger.warning(f"Gamification tracking failed for question bank submission: {gamification_error}")
            else:
                gamification = {
                    "xp_awarded": False,
                    "reason": "Question set XP is awarded only on the first completion."
                }

            return {
                "status": "success",
                "session_id": session_record.id,
                "score": score,
                "correct_count": correct_count,
                "total_questions": len(questions),
                "earned_points": earned_points,
                "total_points": total_points,
                "details": results,
                "adaptation": adaptation,
                "adaptive_feedback": {
                    "cognitive_load": adaptive_recommendations.get('cognitive_load'),
                    "recommendations": adaptive_recommendations.get('recommendations', []),
                    "performance_trend": adaptive_recommendations.get('performance_trend')
                } if adaptive_recommendations and 'error' not in adaptive_recommendations else None,
                "gamification": gamification,
                "xp_awarded": xp_awarded,
                "already_completed": already_completed
            }

        except Exception as e:
            logger.error(f"Error submitting answers: {e}")
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/generate_similar_question", dependencies=_QB_AUTH_DEPENDENCIES)
    async def generate_similar_question(
        request: SimilarQuestionRequest,
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            logger.info(f"Generating similar question for user: {request.user_id}, question_id: {request.question_id}")

            user = db.query(models.User).filter(
                (models.User.username == request.user_id) | (models.User.email == request.user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            original_question = db.query(models.Question).filter(
                models.Question.id == request.question_id
            ).first()

            if not original_question:
                raise HTTPException(status_code=404, detail="Question not found")

            original_data = {
                "question_text": original_question.question_text,
                "question_type": original_question.question_type,
                "difficulty": original_question.difficulty,
                "topic": original_question.topic,
                "correct_answer": original_question.correct_answer,
                "options": json.loads(original_question.options) if original_question.options else [],
                "explanation": original_question.explanation
            }

            logger.info(f"Calling question generator to create similar question...")
            similar_question = await agents["question_generator"].generate_similar_question(
                original_question=original_data,
                difficulty=request.difficulty
            )

            new_question = models.Question(
                question_set_id=original_question.question_set_id,
                question_text=similar_question.get("question_text"),
                question_type=similar_question.get("question_type"),
                difficulty=similar_question.get("difficulty"),
                topic=similar_question.get("topic"),
                correct_answer=similar_question.get("correct_answer"),
                options=json.dumps(similar_question.get("options", [])),
                explanation=similar_question.get("explanation"),
                points=similar_question.get("points", 1),
                order_index=999
            )

            db.add(new_question)
            db.commit()
            db.refresh(new_question)

            logger.info(f"Similar question generated successfully: question_id={new_question.id}")
            return {
                "status": "success",
                "question": {
                    "id": new_question.id,
                    "question_text": new_question.question_text,
                    "question_type": new_question.question_type,
                    "difficulty": new_question.difficulty,
                    "topic": new_question.topic,
                    "options": json.loads(new_question.options) if new_question.options else [],
                    "explanation": new_question.explanation
                }
            }

        except HTTPException as http_e:
            logger.error(f"HTTP Error generating similar question: {http_e.detail}")
            try:
                db.rollback()
            except:
                pass
            raise http_e
        except Exception as e:
            logger.error(f"Unexpected error generating similar question: {e}", exc_info=True)
            try:
                db.rollback()
            except:
                pass
            raise HTTPException(status_code=500, detail=f"Error generating similar question: {str(e)}")

    @app.get("/api/qb/get_analytics", dependencies=_QB_AUTH_DEPENDENCIES)
    async def get_analytics(
        user_id: str = Query(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user = db.query(models.User).filter(
                (models.User.username == user_id) | (models.User.email == user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            sessions = db.query(models.QuestionSession).filter(
                models.QuestionSession.user_id == user.id
            ).order_by(models.QuestionSession.completed_at.desc()).all()

            total_sessions = len(sessions)
            total_questions_answered = sum(s.total_questions for s in sessions)
            avg_score = sum(s.score for s in sessions) / total_sessions if total_sessions > 0 else 0

            topic_stats = {}
            difficulty_stats = {"easy": {"total": 0, "correct": 0}, "medium": {"total": 0, "correct": 0}, "hard": {"total": 0, "correct": 0}}

            for session in sessions:
                results = json.loads(session.results) if session.results else []
                for result in results:
                    topic = result.get("topic", "Unknown")
                    difficulty = result.get("difficulty", "medium")
                    is_correct = result.get("is_correct", False)

                    if topic not in topic_stats:
                        topic_stats[topic] = {"total": 0, "correct": 0}
                    topic_stats[topic]["total"] += 1
                    if is_correct:
                        topic_stats[topic]["correct"] += 1

                    if difficulty in difficulty_stats:
                        difficulty_stats[difficulty]["total"] += 1
                        if is_correct:
                            difficulty_stats[difficulty]["correct"] += 1

            topic_performance = []
            for topic, stats in topic_stats.items():
                accuracy = (stats["correct"] / stats["total"]) * 100 if stats["total"] > 0 else 0
                topic_performance.append({
                    "topic": topic,
                    "accuracy": round(accuracy, 1),
                    "total_questions": stats["total"],
                    "correct_answers": stats["correct"]
                })

            topic_performance.sort(key=lambda x: x["accuracy"])

            difficulty_performance = []
            for difficulty, stats in difficulty_stats.items():
                accuracy = (stats["correct"] / stats["total"]) * 100 if stats["total"] > 0 else 0
                difficulty_performance.append({
                    "difficulty": difficulty,
                    "accuracy": round(accuracy, 1),
                    "total_questions": stats["total"],
                    "correct_answers": stats["correct"]
                })

            recent_scores = [s.score for s in sessions[:10]]

            user_history = [
                {
                    "score": s.score,
                    "results": json.loads(s.results) if s.results else []
                }
                for s in sessions[:10]
            ]

            adaptation = agents["adaptive_difficulty"].analyze_performance(user_history)

            return {
                "total_sessions": total_sessions,
                "total_questions_answered": total_questions_answered,
                "average_score": round(avg_score, 1),
                "recent_scores": recent_scores,
                "topic_performance": topic_performance,
                "difficulty_performance": difficulty_performance,
                "weak_topics": [t for t in topic_performance if t["accuracy"] < 60][:5],
                "strong_topics": [t for t in sorted(topic_performance, key=lambda x: -x["accuracy"]) if t["accuracy"] >= 80][:5],
                "adaptive_recommendation": adaptation
            }

        except Exception as e:
            logger.error(f"Error fetching analytics: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/qb/export_question_set_pdf/{set_id}", dependencies=_QB_AUTH_DEPENDENCIES)
    async def export_question_set_pdf(
        set_id: int,
        user_id: str = Query(...),
        include_answers: bool = Query(False),
        db: Session = Depends(get_db_func)
    ):
        from fastapi.responses import StreamingResponse
        import io

        try:
            import models

            user = db.query(models.User).filter(
                (models.User.username == user_id) | (models.User.email == user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            question_set = db.query(models.QuestionSet).filter(
                models.QuestionSet.id == set_id,
                models.QuestionSet.user_id == user.id
            ).first()

            if not question_set:
                raise HTTPException(status_code=404, detail="Question set not found")

            questions = db.query(models.Question).filter(
                models.Question.question_set_id == set_id
            ).order_by(models.Question.order_index).all()

            if not questions:
                raise HTTPException(status_code=404, detail="No questions found in this set")

            pdf_buffer = generate_question_set_pdf(
                question_set=question_set,
                questions=questions,
                include_answers=include_answers,
                user_name=user.first_name or user.username
            )

            safe_title = "".join(c for c in question_set.title if c.isalnum() or c in (' ', '-', '_')).strip()
            safe_title = safe_title.replace(' ', '_')[:50]
            filename = f"Question_Set_{safe_title}.pdf"

            return StreamingResponse(
                io.BytesIO(pdf_buffer),
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f"attachment; filename={filename}",
                    "Content-Type": "application/pdf"
                }
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error exporting question set PDF: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/enhance_prompt", dependencies=_QB_AUTH_DEPENDENCIES)
    async def enhance_prompt(
        payload: dict = Body(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            user_prompt = payload.get("prompt", "")
            content_summary = payload.get("content_summary", "")

            if not user_prompt:
                raise HTTPException(status_code=400, detail="Prompt is required")

            result = await agents["prompt_enhancer"].enhance_prompt(user_prompt, content_summary)

            return {
                "status": "success",
                "original_prompt": user_prompt,
                "enhanced": result
            }
        except Exception as e:
            logger.error(f"Prompt enhancement error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/extract_topics", dependencies=_QB_AUTH_DEPENDENCIES)
    async def extract_topics(
        payload: dict = Body(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user_id = payload.get("user_id")
            document_id = payload.get("document_id")
            content = payload.get("content", "")

            if document_id and user_id:
                user = db.query(models.User).filter(
                    (models.User.username == user_id) | (models.User.email == user_id)
                ).first()

                if user:
                    doc = db.query(models.UploadedDocument).filter(
                        models.UploadedDocument.id == document_id,
                        models.UploadedDocument.user_id == user.id
                    ).first()

                    if doc:
                        content = doc.content

            if not content:
                raise HTTPException(status_code=400, detail="Content or document_id is required")

            result = await agents["topic_extractor"].extract_topics(content)

            return {
                "status": "success",
                "topics": result
            }
        except Exception as e:
            logger.error(f"Topic extraction error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/score_questions", dependencies=_QB_AUTH_DEPENDENCIES)
    async def score_questions(
        payload: dict = Body(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            questions = payload.get("questions", [])

            if not questions:
                raise HTTPException(status_code=400, detail="Questions are required")

            scored_questions = await agents["quality_scorer"].batch_score_questions(questions)

            avg_score = sum(q.get('quality_score', 7) for q in scored_questions) / len(scored_questions)

            return {
                "status": "success",
                "questions": scored_questions,
                "average_score": round(avg_score, 2),
                "total_scored": len(scored_questions)
            }
        except Exception as e:
            logger.error(f"Question scoring error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/tag_bloom_taxonomy", dependencies=_QB_AUTH_DEPENDENCIES)
    async def tag_bloom_taxonomy(
        payload: dict = Body(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            questions = payload.get("questions", [])

            if not questions:
                raise HTTPException(status_code=400, detail="Questions are required")

            tagged_questions = await agents["bloom_tagger"].batch_tag_questions(questions)

            level_counts = {}
            for q in tagged_questions:
                level = q.get('bloom_level', 'understand')
                level_counts[level] = level_counts.get(level, 0) + 1

            return {
                "status": "success",
                "questions": tagged_questions,
                "level_distribution": level_counts,
                "bloom_levels": BloomTaxonomyAgent.BLOOM_LEVELS
            }
        except Exception as e:
            logger.error(f"Bloom taxonomy tagging error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/check_duplicates", dependencies=_QB_AUTH_DEPENDENCIES)
    async def check_duplicates(
        payload: dict = Body(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user_id = payload.get("user_id")
            new_question = payload.get("question", "")
            question_set_id = payload.get("question_set_id")

            if not new_question:
                raise HTTPException(status_code=400, detail="Question is required")

            existing_questions = []

            if user_id:
                user = db.query(models.User).filter(
                    (models.User.username == user_id) | (models.User.email == user_id)
                ).first()

                if user:
                    query = db.query(models.Question).join(models.QuestionSet).filter(
                        models.QuestionSet.user_id == user.id
                    )

                    if question_set_id:
                        query = query.filter(models.QuestionSet.id == question_set_id)

                    questions = query.order_by(models.Question.id.desc()).limit(100).all()
                    existing_questions = [q.question_text for q in questions]

            result = await agents["duplicate_detector"].find_duplicates(new_question, existing_questions)

            return {
                "status": "success",
                "result": result
            }
        except Exception as e:
            logger.error(f"Duplicate check error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/analyze_weaknesses", dependencies=_QB_AUTH_DEPENDENCIES)
    async def analyze_weaknesses(
        payload: dict = Body(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user_id = payload.get("user_id")

            if not user_id:
                raise HTTPException(status_code=400, detail="user_id is required")

            user = db.query(models.User).filter(
                (models.User.username == user_id) | (models.User.email == user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            quizzes = db.query(models.SoloQuiz).filter(
                models.SoloQuiz.user_id == user.id,
                models.SoloQuiz.completed == True
            ).order_by(models.SoloQuiz.completed_at.desc()).limit(20).all()

            performance_data = []
            for quiz in quizzes:
                try:
                    answers = json.loads(quiz.answers) if quiz.answers else []
                except Exception:
                    answers = []

                for answer in answers:
                    if not isinstance(answer, dict):
                        continue
                    performance_data.append({
                        "topic": quiz.subject or "General",
                        "difficulty": quiz.difficulty or "medium",
                        "question_text": answer.get("question_text"),
                        "is_correct": answer.get("is_correct"),
                    })

            if not performance_data:
                return {
                    "status": "success",
                    "message": "No performance data available yet",
                    "analysis": None
                }

            analysis = await agents["adaptive_generator"].analyze_weaknesses(performance_data)

            return {
                "status": "success",
                "analysis": analysis,
                "data_points": len(performance_data)
            }
        except Exception as e:
            logger.error(f"Weakness analysis error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/generate_adaptive", dependencies=_QB_AUTH_DEPENDENCIES)
    async def generate_adaptive_questions(
        payload: dict = Body(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user_id = payload.get("user_id")
            document_ids = payload.get("document_ids", [])
            question_count = payload.get("question_count", 10)

            if not user_id:
                raise HTTPException(status_code=400, detail="user_id is required")

            user = db.query(models.User).filter(
                (models.User.username == user_id) | (models.User.email == user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            quizzes = db.query(models.SoloQuiz).filter(
                models.SoloQuiz.user_id == user.id,
                models.SoloQuiz.completed == True
            ).order_by(models.SoloQuiz.completed_at.desc()).limit(20).all()

            performance_data = []
            for quiz in quizzes:
                try:
                    answers = json.loads(quiz.answers) if quiz.answers else []
                except Exception:
                    answers = []

                for answer in answers:
                    if not isinstance(answer, dict):
                        continue
                    performance_data.append({
                        'topic': quiz.subject or 'General',
                        'difficulty': quiz.difficulty or 'medium',
                        'correct': answer.get('is_correct'),
                        'question_text': answer.get('question_text')
                    })

            weakness_analysis = await agents["adaptive_generator"].analyze_weaknesses(performance_data) if performance_data else {}

            chroma_weak_topics = []
            try:
                from tutor import chroma_store
                if chroma_store.available():
                    chroma_weak_topics = chroma_store.get_weak_quiz_topics(str(user.id), top_k=5)
            except Exception as e:
                logger.warning(f"Chroma weak topic retrieval failed: {e}")

            if chroma_weak_topics:
                existing_weak = weakness_analysis.get("weak_topics", []) if isinstance(weakness_analysis, dict) else []
                existing_focus = []
                if isinstance(weakness_analysis, dict):
                    existing_focus = weakness_analysis.get("recommendations", {}).get("focus_topics", []) or []

                weak_topic_names = [t.get("topic") for t in existing_weak if isinstance(t, dict)]
                merged_focus = _merge_topics(weak_topic_names, existing_focus, chroma_weak_topics, limit=8)

                if not isinstance(weakness_analysis, dict):
                    weakness_analysis = {}
                if "recommendations" not in weakness_analysis or not isinstance(weakness_analysis.get("recommendations"), dict):
                    weakness_analysis["recommendations"] = {}

                existing_lower = {str(t).lower() for t in weak_topic_names if t}
                for topic in chroma_weak_topics:
                    if not topic:
                        continue
                    if topic.lower() in existing_lower:
                        continue
                    existing_weak.append({
                        "topic": topic,
                        "accuracy": 0.0,
                        "attempts": 0,
                        "source": "chroma"
                    })
                    existing_lower.add(topic.lower())

                weakness_analysis["weak_topics"] = existing_weak
                weakness_analysis["recommendations"]["focus_topics"] = merged_focus

            content_parts = []
            if document_ids:
                documents = db.query(models.UploadedDocument).filter(
                    models.UploadedDocument.id.in_(document_ids),
                    models.UploadedDocument.user_id == user.id
                ).all()

                for doc in documents:
                    content_parts.append(f"=== {doc.filename} ===\n{doc.content}")

            content = "\n\n".join(content_parts)

            if not content:
                raise HTTPException(status_code=400, detail="No content available for question generation")

            adaptive_prompt = await agents["adaptive_generator"].generate_adaptive_prompt(weakness_analysis, content)

            questions = await agents["question_generator"].generate_questions(
                content,
                question_count,
                weakness_analysis.get('recommendations', {}).get('suggested_question_types', ['multiple_choice', 'short_answer']),
                {"easy": 20, "medium": 50, "hard": 30},
                weakness_analysis.get('recommendations', {}).get('focus_topics'),
                custom_prompt=adaptive_prompt
            )

            return {
                "status": "success",
                "questions": questions,
                "weakness_analysis": weakness_analysis,
                "adaptive_prompt_used": adaptive_prompt
            }
        except Exception as e:
            logger.error(f"Adaptive generation error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/enhance_explanations", dependencies=_QB_AUTH_DEPENDENCIES)
    async def enhance_explanations(
        payload: dict = Body(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            questions = payload.get("questions", [])

            if not questions:
                raise HTTPException(status_code=400, detail="Questions are required")

            enhanced_questions = []
            for q in questions:
                await agents["explanation_enhancer"].enhance_explanation(q)
                enhanced_questions.append(q)

            return {
                "status": "success",
                "questions": enhanced_questions
            }
        except Exception as e:
            logger.error(f"Explanation enhancement error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/regenerate_question", dependencies=_QB_AUTH_DEPENDENCIES)
    async def regenerate_question(
        payload: dict = Body(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user_id = payload.get("user_id")
            original_question = payload.get("question", {})
            feedback = payload.get("feedback", "Make it better")
            document_id = payload.get("document_id")

            if not original_question:
                raise HTTPException(status_code=400, detail="Question is required")

            content = ""
            if document_id and user_id:
                user = db.query(models.User).filter(
                    (models.User.username == user_id) | (models.User.email == user_id)
                ).first()

                if user:
                    doc = db.query(models.UploadedDocument).filter(
                        models.UploadedDocument.id == document_id,
                        models.UploadedDocument.user_id == user.id
                    ).first()

                    if doc:
                        content = doc.content

            new_question = await agents["question_preview"].regenerate_single_question(
                original_question, feedback, content
            )

            return {
                "status": "success",
                "original": original_question,
                "regenerated": new_question,
                "feedback_applied": feedback
            }
        except Exception as e:
            logger.error(f"Question regeneration error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/preview_generate", dependencies=_QB_AUTH_DEPENDENCIES)
    async def preview_generate_questions(
        request: MultiPDFGenerationRequest,
        db: Session = Depends(get_db_func)
    ):
        try:
            import models
            if request.session_id:
                logger.info(f"QB preview_generate session_id={request.session_id}")

            user = db.query(models.User).filter(
                (models.User.username == request.user_id) | (models.User.email == request.user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            personalization = _collect_universal_personalization(db, user, models)
            effective_topics = _merge_request_topics(request.topics, personalization, limit=10)
            personalized_prompt = _build_universal_personalization_prompt(
                request.custom_prompt,
                personalization,
                "preview generation"
            )

            documents = db.query(models.UploadedDocument).filter(
                models.UploadedDocument.id.in_(request.source_ids),
                models.UploadedDocument.user_id == user.id
            ).all()

            if not documents:
                raise HTTPException(status_code=404, detail="No documents found")

            doc_map = {d.id: d for d in documents}
            reference_content = None

            if request.reference_document_id and request.reference_document_id in doc_map:
                ref_doc = doc_map[request.reference_document_id]
                reference_content = f"=== REFERENCE DOCUMENT: {ref_doc.filename} ===\n{ref_doc.content}"

            content_ids = request.content_document_ids or [
                d.id for d in documents if d.id != request.reference_document_id
            ]

            content_parts = []
            for doc_id in content_ids:
                if doc_id in doc_map:
                    doc = doc_map[doc_id]
                    content_parts.append(f"=== CONTENT: {doc.filename} ===\n{doc.content}")

            if not content_parts:
                for doc in documents:
                    if doc.id != request.reference_document_id:
                        content_parts.append(f"=== CONTENT: {doc.filename} ===\n{doc.content}")

            content = "\n\n".join(content_parts)
            if not content.strip():
                raise HTTPException(status_code=400, detail="No content to generate questions from")

            enhanced_prompt = personalized_prompt
            if personalized_prompt:
                enhancement = await agents["prompt_enhancer"].enhance_prompt(
                    personalized_prompt,
                    content[:2000]
                )
                enhanced_prompt = enhancement.get('enhanced_prompt', personalized_prompt)

            questions = await agents["question_generator"].generate_questions(
                content,
                request.question_count,
                request.question_types,
                request.difficulty_mix,
                effective_topics,
                custom_prompt=enhanced_prompt,
                reference_content=reference_content
            )

            if not questions:
                raise HTTPException(status_code=500, detail="Failed to generate questions")

            scored_questions = await agents["quality_scorer"].batch_score_questions(questions)

            tagged_questions = await agents["bloom_tagger"].batch_tag_questions(scored_questions)

            existing_questions = []
            user_questions = db.query(models.Question).join(models.QuestionSet).filter(
                models.QuestionSet.user_id == user.id
            ).order_by(models.Question.id.desc()).limit(100).all()
            existing_questions = [q.question_text for q in user_questions]

            for q in tagged_questions:
                dup_check = await agents["duplicate_detector"].find_duplicates(
                    q.get('question_text', ''),
                    existing_questions
                )
                q['is_potential_duplicate'] = dup_check.get('is_duplicate', False)
                q['duplicate_similarity'] = dup_check.get('similarity_score', 0)

            avg_quality = sum(q.get('quality_score', 7) for q in tagged_questions) / len(tagged_questions)
            bloom_dist = {}
            for q in tagged_questions:
                level = q.get('bloom_level', 'understand')
                bloom_dist[level] = bloom_dist.get(level, 0) + 1

            return {
                "status": "success",
                "questions": tagged_questions,
                "stats": {
                    "total": len(tagged_questions),
                    "average_quality_score": round(avg_quality, 2),
                    "bloom_distribution": bloom_dist,
                    "potential_duplicates": sum(1 for q in tagged_questions if q.get('is_potential_duplicate')),
                    "personalization": {
                        "weak_topics": personalization.get("weak_topics", []),
                        "strong_topics": personalization.get("strong_topics", []),
                        "focus_topics": personalization.get("focus_topics", [])
                    }
                },
                "enhanced_prompt": enhanced_prompt if enhanced_prompt != personalized_prompt else None,
                "source_documents": [d.filename for d in documents],
                "session_id": request.session_id
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Preview generation error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/save_previewed_questions", dependencies=_QB_AUTH_DEPENDENCIES)
    async def save_previewed_questions(
        payload: dict = Body(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user_id = payload.get("user_id")
            questions = payload.get("questions", [])
            title = payload.get("title", "Question Set")
            description = payload.get("description", "")
            source_type = payload.get("source_type", "preview")

            if not user_id or not questions:
                raise HTTPException(status_code=400, detail="user_id and questions are required")

            user = db.query(models.User).filter(
                (models.User.username == user_id) | (models.User.email == user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            question_set = models.QuestionSet(
                user_id=user.id,
                title=title,
                description=description,
                source_type=source_type,
                total_questions=len(questions)
            )

            db.add(question_set)
            db.flush()

            for idx, q in enumerate(questions):
                q = _clean_question_payload_text(q)
                question = models.Question(
                    question_set_id=question_set.id,
                    question_text=q.get("question_text"),
                    question_type=q.get("question_type"),
                    difficulty=q.get("difficulty"),
                    topic=q.get("topic"),
                    correct_answer=q.get("correct_answer"),
                    options=json.dumps(q.get("options", [])),
                    explanation=q.get("enhanced_explanation", q.get("explanation", "")),
                    points=q.get("points", 1),
                    order_index=idx
                )
                db.add(question)

            db.commit()
            db.refresh(question_set)

            return {
                "status": "success",
                "question_set_id": question_set.id,
                "question_count": len(questions),
                "title": title
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Save previewed questions error: {e}")
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/save_question_set", dependencies=_QB_AUTH_DEPENDENCIES)
    async def save_question_set(
        payload: dict = Body(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user_id = payload.get("user_id")
            questions = payload.get("questions", [])
            title = payload.get("title", "Question Set")
            source = payload.get("source", "manual")

            if not user_id or not questions:
                raise HTTPException(status_code=400, detail="user_id and questions are required")

            user = db.query(models.User).filter(
                (models.User.username == user_id) | (models.User.email == user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            seen_question_signatures = set()
            unique_questions = []
            for q in questions:
                q = _clean_question_payload_text(q)
                question_text = str(q.get("question_text") or "").strip().lower()
                correct_answer = str(q.get("correct_answer", "")).strip().lower()
                options = q.get("options", [])
                if isinstance(options, list):
                    normalized_options = json.dumps(
                        [str(option).strip().lower() for option in options],
                        sort_keys=True
                    )
                else:
                    normalized_options = str(options).strip().lower()

                signature = (question_text, correct_answer, normalized_options)
                if not question_text or signature in seen_question_signatures:
                    continue
                seen_question_signatures.add(signature)
                unique_questions.append(q)

            questions = unique_questions
            if not questions:
                raise HTTPException(status_code=400, detail="No unique questions to save")

            question_set = models.QuestionSet(
                user_id=user.id,
                title=title,
                description=f"Generated from {source}",
                source_type=source,
                total_questions=len(questions)
            )

            db.add(question_set)
            db.flush()

            for idx, q in enumerate(questions):
                q = _clean_question_payload_text(q)
                question_text = q.get("question_text")
                options = q.get("options", [])
                correct_answer = q.get("correct_answer", 0)
                explanation = q.get("explanation", "")

                if isinstance(options, list) and len(options) > 0:
                    if isinstance(correct_answer, int) and correct_answer < len(options):
                        correct_answer_text = options[correct_answer]
                    else:
                        correct_answer_text = str(correct_answer)
                else:
                    correct_answer_text = str(correct_answer)

                question = models.Question(
                    question_set_id=question_set.id,
                    question_text=question_text,
                    question_type="multiple_choice",
                    difficulty=q.get("difficulty", "medium"),
                    topic=q.get("topic", title),
                    correct_answer=correct_answer_text,
                    options=json.dumps(options),
                    explanation=explanation,
                    points=q.get("points", 1),
                    order_index=idx
                )
                db.add(question)

            db.commit()
            db.refresh(question_set)

            return {
                "status": "success",
                "set_id": question_set.id,
                "question_count": len(questions),
                "title": title
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Save question set error: {e}")
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/batch_delete", dependencies=_QB_AUTH_DEPENDENCIES)
    async def batch_delete_question_sets(
        payload: dict = Body(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user_id = payload.get("user_id")
            set_ids = payload.get("set_ids", [])

            if not user_id or not set_ids:
                raise HTTPException(status_code=400, detail="user_id and set_ids are required")

            user = db.query(models.User).filter(
                (models.User.username == user_id) | (models.User.email == user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            owned_sets = db.query(models.QuestionSet).filter(
                models.QuestionSet.id.in_(set_ids),
                models.QuestionSet.user_id == user.id
            ).all()
            owned_set_ids = [qs.id for qs in owned_sets]

            if owned_set_ids:
                db.query(models.Question).filter(
                    models.Question.question_set_id.in_(owned_set_ids)
                ).delete(synchronize_session=False)
                db.query(models.QuestionSet).filter(
                    models.QuestionSet.id.in_(owned_set_ids)
                ).delete(synchronize_session=False)

            deleted_count = len(owned_set_ids)
            db.commit()

            return {
                "status": "success",
                "deleted_count": deleted_count,
                "requested_count": len(set_ids)
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Batch delete error: {e}")
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/merge_sets", dependencies=_QB_AUTH_DEPENDENCIES)
    async def merge_question_sets(
        payload: dict = Body(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user_id = payload.get("user_id")
            set_ids = payload.get("set_ids", [])
            new_title = payload.get("title", "Merged Question Set")
            delete_originals = payload.get("delete_originals", False)

            if not user_id or len(set_ids) < 2:
                raise HTTPException(status_code=400, detail="user_id and at least 2 set_ids are required")

            user = db.query(models.User).filter(
                (models.User.username == user_id) | (models.User.email == user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            all_questions = []
            source_titles = []

            owned_sets = db.query(models.QuestionSet).filter(
                models.QuestionSet.id.in_(set_ids),
                models.QuestionSet.user_id == user.id
            ).all()
            owned_sets_by_id = {qs.id: qs for qs in owned_sets}
            owned_set_ids = [qs.id for qs in owned_sets]

            all_source_questions = db.query(models.Question).filter(
                models.Question.question_set_id.in_(owned_set_ids)
            ).all() if owned_set_ids else []
            questions_by_set: dict = {}
            for q in all_source_questions:
                questions_by_set.setdefault(q.question_set_id, []).append(q)

            for set_id in set_ids:
                question_set = owned_sets_by_id.get(set_id)

                if question_set:
                    source_titles.append(question_set.title)
                    questions = questions_by_set.get(set_id, [])

                    for q in questions:
                        all_questions.append({
                            "question_text": q.question_text,
                            "question_type": q.question_type,
                            "difficulty": q.difficulty,
                            "topic": q.topic,
                            "correct_answer": q.correct_answer,
                            "options": json.loads(q.options) if q.options else [],
                            "explanation": q.explanation,
                            "points": q.points
                        })

            if not all_questions:
                raise HTTPException(status_code=400, detail="No questions found in the selected sets")

            merged_set = models.QuestionSet(
                user_id=user.id,
                title=new_title,
                description=f"Merged from: {', '.join(source_titles)}",
                source_type="merged",
                total_questions=len(all_questions)
            )

            db.add(merged_set)
            db.flush()

            for idx, q in enumerate(all_questions):
                q = _clean_question_payload_text(q)
                question = models.Question(
                    question_set_id=merged_set.id,
                    question_text=q["question_text"],
                    question_type=q["question_type"],
                    difficulty=q["difficulty"],
                    topic=q["topic"],
                    correct_answer=q["correct_answer"],
                    options=json.dumps(q["options"]),
                    explanation=q["explanation"],
                    points=q["points"],
                    order_index=idx
                )
                db.add(question)

            if delete_originals and owned_set_ids:
                db.query(models.Question).filter(
                    models.Question.question_set_id.in_(owned_set_ids)
                ).delete(synchronize_session=False)
                db.query(models.QuestionSet).filter(
                    models.QuestionSet.id.in_(owned_set_ids)
                ).delete(synchronize_session=False)

            db.commit()
            db.refresh(merged_set)

            return {
                "status": "success",
                "merged_set_id": merged_set.id,
                "total_questions": len(all_questions),
                "source_sets": source_titles,
                "originals_deleted": delete_originals
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Merge sets error: {e}")
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/qb/weak_areas", dependencies=_QB_AUTH_DEPENDENCIES)
    async def get_weak_areas(
        user_id: str = Query(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user = db.query(models.User).filter(
                (models.User.username == user_id) | (models.User.email == user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            weak_areas = db.query(models.UserWeakArea).filter(
                models.UserWeakArea.user_id == user.id,
                models.UserWeakArea.status != "mastered"
            ).order_by(
                models.UserWeakArea.priority.desc(),
                models.UserWeakArea.weakness_score.desc()
            ).all()

            return {
                "status": "success",
                "weak_areas": [
                    {
                        "id": wa.id,
                        "topic": wa.topic,
                        "subtopic": wa.subtopic,
                        "total_questions": wa.total_questions,
                        "correct_count": wa.correct_count,
                        "incorrect_count": wa.incorrect_count,
                        "accuracy": round(wa.accuracy, 1),
                        "weakness_score": round(wa.weakness_score, 1),
                        "consecutive_wrong": wa.consecutive_wrong,
                        "status": wa.status,
                        "priority": wa.priority,
                        "practice_sessions": wa.practice_sessions,
                        "improvement_rate": round(wa.improvement_rate, 2),
                        "last_practiced": wa.last_practiced.isoformat() if wa.last_practiced else None,
                        "first_identified": wa.first_identified.isoformat() if wa.first_identified else None
                    }
                    for wa in weak_areas
                ],
                "total_weak_areas": len(weak_areas),
                "critical_count": len([wa for wa in weak_areas if wa.priority >= 8]),
                "needs_practice_count": len([wa for wa in weak_areas if wa.status == "needs_practice"])
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Get weak areas error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/qb/wrong_answers", dependencies=_QB_AUTH_DEPENDENCIES)
    async def get_wrong_answers(
        user_id: str = Query(...),
        topic: Optional[str] = Query(None),
        limit: int = Query(50),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user = db.query(models.User).filter(
                (models.User.username == user_id) | (models.User.email == user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            # Scoped to question-bank mistakes only -- this endpoint backs the
            # Question Bank dashboard's "Review Wrong Answers" card, which
            # predates solo-quiz/flashcard mistakes also living in this table
            # (see `source`); those surface instead via the unified
            # /api/weaknesses/recent_mistakes endpoint.
            query = db.query(models.WrongAnswerLog).filter(
                models.WrongAnswerLog.user_id == user.id,
                models.WrongAnswerLog.source == "question_bank",
            )

            if topic:
                query = query.filter(models.WrongAnswerLog.topic == topic)

            wrong_answers = query.order_by(
                models.WrongAnswerLog.answered_at.desc()
            ).limit(limit).all()

            return {
                "status": "success",
                "wrong_answers": [
                    {
                        "id": wa.id,
                        "question_id": wa.question_id,
                        "question_text": wa.question_text,
                        "topic": wa.topic,
                        "difficulty": wa.difficulty,
                        "correct_answer": wa.correct_answer,
                        "user_answer": wa.user_answer,
                        "mistake_type": wa.mistake_type,
                        "reviewed": wa.reviewed,
                        "understood_after_review": wa.understood_after_review,
                        "answered_at": wa.answered_at.isoformat() if wa.answered_at else None
                    }
                    for wa in wrong_answers
                ],
                "total": len(wrong_answers)
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Get wrong answers error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/mark_reviewed", dependencies=_QB_AUTH_DEPENDENCIES)
    async def mark_wrong_answer_reviewed(
        payload: dict = Body(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            wrong_answer_id = payload.get("wrong_answer_id")
            understood = payload.get("understood", True)

            wrong_answer = db.query(models.WrongAnswerLog).filter(
                models.WrongAnswerLog.id == wrong_answer_id
            ).first()

            if not wrong_answer:
                raise HTTPException(status_code=404, detail="Wrong answer not found")

            wrong_answer.reviewed = True
            wrong_answer.reviewed_at = datetime.now(timezone.utc)
            wrong_answer.understood_after_review = understood

            db.commit()

            return {"status": "success", "message": "Marked as reviewed"}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Mark reviewed error: {e}")
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/generate_practice", dependencies=_QB_AUTH_DEPENDENCIES)
    async def generate_practice_questions(
        payload: dict = Body(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user_id = payload.get("user_id")
            topic = payload.get("topic")
            question_count = payload.get("question_count", 10)
            include_review = payload.get("include_review", True)

            user = db.query(models.User).filter(
                (models.User.username == user_id) | (models.User.email == user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            weak_area_query = db.query(models.UserWeakArea).filter(
                models.UserWeakArea.user_id == user.id,
                models.UserWeakArea.status != "mastered"
            )

            if topic:
                weak_area_query = weak_area_query.filter(models.UserWeakArea.topic == topic)

            weak_areas = weak_area_query.order_by(
                models.UserWeakArea.priority.desc()
            ).limit(5).all()

            if not weak_areas:
                return {
                    "status": "success",
                    "message": "No weak areas found! Great job!",
                    "questions": [],
                    "practice_set_id": None
                }

            focus_topics = [wa.topic for wa in weak_areas]

            review_questions = []
            if include_review:
                wrong_logs = db.query(models.WrongAnswerLog).filter(
                    models.WrongAnswerLog.user_id == user.id,
                    models.WrongAnswerLog.source == "question_bank",
                    models.WrongAnswerLog.topic.in_(focus_topics),
                    models.WrongAnswerLog.reviewed == False
                ).order_by(
                    models.WrongAnswerLog.answered_at.desc()
                ).limit(question_count // 2).all()

                questions_by_id = {
                    q.id: q for q in db.query(models.Question).filter(
                        models.Question.id.in_([wl.question_id for wl in wrong_logs])
                    ).all()
                }
                for wl in wrong_logs:
                    question = questions_by_id.get(wl.question_id)
                    if question:
                        review_questions.append({
                            "question_text": question.question_text,
                            "question_type": question.question_type,
                            "difficulty": question.difficulty,
                            "topic": question.topic,
                            "correct_answer": question.correct_answer,
                            "options": json.loads(question.options) if question.options else [],
                            "explanation": question.explanation,
                            "points": question.points,
                            "is_review": True,
                            "original_wrong_answer": wl.user_answer
                        })

            new_question_count = question_count - len(review_questions)
            new_questions = []

            if new_question_count > 0:
                docs = db.query(models.UploadedDocument).filter(
                    models.UploadedDocument.user_id == user.id
                ).limit(3).all()

                if docs:
                    content = "\n\n".join([d.content for d in docs if d.content])[:15000]

                    generated = await agents["question_generator"].generate_questions(
                        content,
                        new_question_count,
                        ["multiple_choice"],
                        {"easy": 40, "medium": 40, "hard": 20},
                        focus_topics,
                        custom_prompt=f"Focus specifically on these weak areas that need practice: {', '.join(focus_topics)}. Create questions that test understanding of these concepts."
                    )

                    for q in generated:
                        q["is_review"] = False
                        new_questions.append(q)

            all_questions = review_questions + new_questions

            if not all_questions:
                return {
                    "status": "success",
                    "message": "Could not generate practice questions. Try uploading more content.",
                    "questions": [],
                    "practice_set_id": None
                }

            practice_set = models.QuestionSet(
                user_id=user.id,
                title=f"Practice: {', '.join(focus_topics[:3])}",
                description=f"Targeted practice for weak areas. {len(review_questions)} review + {len(new_questions)} new questions.",
                source_type="practice",
                total_questions=len(all_questions)
            )

            db.add(practice_set)
            db.flush()

            for idx, q in enumerate(all_questions):
                q = _clean_question_payload_text(q)
                question = models.Question(
                    question_set_id=practice_set.id,
                    question_text=q.get("question_text"),
                    question_type=q.get("question_type", "multiple_choice"),
                    difficulty=q.get("difficulty", "medium"),
                    topic=q.get("topic", focus_topics[0] if focus_topics else "General"),
                    correct_answer=q.get("correct_answer"),
                    options=json.dumps(q.get("options", [])),
                    explanation=q.get("explanation", ""),
                    points=q.get("points", 1),
                    order_index=idx
                )
                db.add(question)

            for wa in weak_areas:
                wa.practice_sessions += 1
                wa.last_practiced = datetime.now(timezone.utc)

            db.commit()
            db.refresh(practice_set)

            return {
                "status": "success",
                "practice_set_id": practice_set.id,
                "total_questions": len(all_questions),
                "review_questions": len(review_questions),
                "new_questions": len(new_questions),
                "focus_topics": focus_topics,
                "questions": all_questions
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Generate practice error: {e}")
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/qb/practice_recommendations", dependencies=_QB_AUTH_DEPENDENCIES)
    async def get_practice_recommendations(
        user_id: str = Query(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            user = db.query(models.User).filter(
                (models.User.username == user_id) | (models.User.email == user_id)
            ).first()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            weak_areas = db.query(models.UserWeakArea).filter(
                models.UserWeakArea.user_id == user.id,
                models.UserWeakArea.status != "mastered"
            ).order_by(models.UserWeakArea.priority.desc()).limit(10).all()

            recent_sessions = db.query(models.QuestionSession).filter(
                models.QuestionSession.user_id == user.id
            ).order_by(models.QuestionSession.completed_at.desc()).limit(10).all()

            recommendations = []

            critical = [wa for wa in weak_areas if wa.priority >= 8]
            if critical:
                recommendations.append({
                    "type": "critical",
                    "title": "Critical Areas Need Attention",
                    "description": f"You have {len(critical)} topics with very low accuracy that need immediate practice.",
                    "topics": [wa.topic for wa in critical],
                    "action": "generate_practice",
                    "priority": 10
                })

            declining = [wa for wa in weak_areas if wa.improvement_rate < -0.1]
            if declining:
                recommendations.append({
                    "type": "declining",
                    "title": "Performance Declining",
                    "description": f"Your performance in {len(declining)} topics is getting worse. Review these concepts.",
                    "topics": [wa.topic for wa in declining],
                    "action": "review_wrong_answers",
                    "priority": 8
                })

            stale_threshold = datetime.now(timezone.utc) - timedelta(days=7)
            stale = [wa for wa in weak_areas if wa.last_practiced and wa.last_practiced < stale_threshold]
            if stale:
                recommendations.append({
                    "type": "stale",
                    "title": "Time to Review",
                    "description": f"{len(stale)} weak topics haven't been practiced in over a week.",
                    "topics": [wa.topic for wa in stale],
                    "action": "generate_practice",
                    "priority": 6
                })

            unreviewed_count = db.query(models.WrongAnswerLog).filter(
                models.WrongAnswerLog.user_id == user.id,
                models.WrongAnswerLog.source == "question_bank",
                models.WrongAnswerLog.reviewed == False
            ).count()

            if unreviewed_count > 5:
                recommendations.append({
                    "type": "review",
                    "title": "Review Your Mistakes",
                    "description": f"You have {unreviewed_count} wrong answers that haven't been reviewed yet.",
                    "action": "review_wrong_answers",
                    "priority": 7
                })

            total_questions_answered = sum(s.total_questions for s in recent_sessions) if recent_sessions else 0
            avg_score = sum(s.score for s in recent_sessions) / len(recent_sessions) if recent_sessions else 0

            return {
                "status": "success",
                "recommendations": sorted(recommendations, key=lambda x: x["priority"], reverse=True),
                "summary": {
                    "total_weak_areas": len(weak_areas),
                    "critical_count": len(critical),
                    "recent_sessions": len(recent_sessions),
                    "total_questions_answered": total_questions_answered,
                    "average_score": round(avg_score, 1),
                    "unreviewed_mistakes": unreviewed_count
                }
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Get recommendations error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/qb/reset_weak_area", dependencies=_QB_AUTH_DEPENDENCIES)
    async def reset_weak_area(
        payload: dict = Body(...),
        db: Session = Depends(get_db_func)
    ):
        try:
            import models

            weak_area_id = payload.get("weak_area_id")
            action = payload.get("action", "mastered")

            weak_area = db.query(models.UserWeakArea).filter(
                models.UserWeakArea.id == weak_area_id
            ).first()

            if not weak_area:
                raise HTTPException(status_code=404, detail="Weak area not found")

            if action == "delete":
                db.delete(weak_area)
            else:
                weak_area.status = "mastered"
                weak_area.priority = 0

            db.commit()

            return {"status": "success", "message": f"Weak area {action}"}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Reset weak area error: {e}")
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    logger.info("Enhanced Question Bank API with sophisticated AI agents registered successfully")
