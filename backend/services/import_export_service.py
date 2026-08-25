
import asyncio
import json
import logging
import html
import re
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from groq import Groq
import os
from activity_logger import log_ai_tokens
from services.ai_usage import estimate_usage, extract_usage_from_openai_like
from services.api_key_pool import (
    ApiKeyPoolExhausted,
    is_provider_quota_error,
    provider_limit_exhausted,
    record_provider_usage,
)

logger = logging.getLogger(__name__)

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

class ImportExportService:
    
    def __init__(self, db: Session):
        self.db = db

    def _combine_titles(self, titles: List[str], max_titles: int = 2, fallback: str = "Untitled") -> str:
        cleaned = []
        seen = set()
        for title in titles:
            if not title:
                continue
            text = str(title).strip()
            if not text:
                continue
            key = text.lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(text)

        if not cleaned:
            return fallback
        if len(cleaned) == 1:
            return cleaned[0]

        head = cleaned[:max_titles]
        rest = len(cleaned) - len(head)
        title = ", ".join(head)
        if rest > 0:
            title = f"{title} +{rest} more"
        return title

    def _log_groq_usage(self, user_id: int, tool_name: str, response, prompt: str = ""):
        completion = ""
        try:
            completion = response.choices[0].message.content or ""
        except Exception:
            completion = ""
        usage = extract_usage_from_openai_like(response)
        token_source = "model_usage" if usage else "estimated"
        usage = usage or estimate_usage(prompt, completion)
        if not usage.get("total_tokens"):
            return
        try:
            if token_source == "model_usage":
                record_provider_usage("groq", usage.get("total_tokens", 0))
            log_ai_tokens(
                user_id=user_id,
                tool_name=tool_name,
                prompt_tokens=usage.get("prompt_tokens", 0),
                completion_tokens=usage.get("completion_tokens", 0),
                total_tokens=usage.get("total_tokens", 0),
                model="openai/gpt-oss-120b",
                metadata={
                    "provider": "groq",
                    "source": "import_export",
                    "token_source": token_source,
                }
            )
        except Exception:
            pass

    def _raise_if_groq_limit(self, error: Exception) -> None:
        if isinstance(error, ApiKeyPoolExhausted):
            raise error
        if is_provider_quota_error(error):
            raise provider_limit_exhausted("groq") from error

    def _strip_html_to_text(self, content: str) -> str:
        if not content:
            return ""

        text = str(content)
        text = re.sub(r"<\s*br\s*/?\s*>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"</\s*(p|div|h1|h2|h3|h4|h5|h6|li|tr|section|article)\s*>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"<\s*li[^>]*>", "- ", text, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", " ", text)
        text = html.unescape(text)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n[ \t]+", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def _build_notes_podcast_analysis(self, notes: List[Any], transcript: str) -> Dict[str, Any]:
        key_concepts: List[str] = []
        seen = set()

        for note in notes:
            title = (getattr(note, "title", "") or "").strip()
            if not title:
                continue
            key = title.lower()
            if key in seen:
                continue
            seen.add(key)
            key_concepts.append(title)
            if len(key_concepts) >= 12:
                break

        summary = transcript[:1200].strip()
        if len(transcript) > 1200:
            summary = f"{summary}..."

        return {
            "summary": summary,
            "key_concepts": key_concepts,
            "topics": key_concepts[:8],
            "source": "notes_conversion",
        }

    def _normalize_multiple_choice_question(self, question_data: Dict[str, Any]) -> Dict[str, Any]:
        raw_options = question_data.get("options") or []
        if not isinstance(raw_options, list):
            raw_options = []

        options = []
        for option in raw_options:
            text = re.sub(r"^\s*[A-Da-d][).:-]\s*", "", str(option or "")).strip()
            if text and text not in options:
                options.append(text)

        if len(options) != 4:
            raise ValueError("AI returned a multiple-choice question without exactly 4 distinct options")

        raw_answer = str(question_data.get("correct_answer") or "").strip()
        answer_match = re.fullmatch(r"(?:option\s*)?([A-Da-d])(?:[).:-])?", raw_answer, re.IGNORECASE)
        if answer_match:
            correct_answer = options[ord(answer_match.group(1).upper()) - ord("A")]
        else:
            cleaned_answer = re.sub(r"^\s*[A-Da-d][).:-]\s*", "", raw_answer).strip()
            correct_answer = next(
                (option for option in options if option.casefold() == cleaned_answer.casefold()),
                cleaned_answer,
            )

        if not correct_answer or correct_answer not in options:
            raise ValueError("AI returned a correct answer that does not match any MCQ option")

        return {
            **question_data,
            "question": str(question_data.get("question") or question_data.get("question_text") or "").strip(),
            "question_type": "multiple_choice",
            "options": options,
            "correct_answer": correct_answer,
        }
        
    
    async def notes_to_flashcards(
        self, 
        note_ids: List[int], 
        user_id: int,
        card_count: int = 10,
        difficulty: str = "medium"
    ) -> Dict[str, Any]:
        from models import Note, FlashcardSet, Flashcard
        
        try:
            notes = self.db.query(Note).filter(
                Note.id.in_(note_ids),
                Note.user_id == user_id
            ).all()
            
            if not notes:
                return {"success": False, "error": "No notes found"}
            
            combined_content = "\n\n".join([
                f"# {note.title}\n{note.content}" for note in notes
            ])
            
            prompt = f"""Generate {card_count} flashcards from these notes.
Difficulty: {difficulty}

Notes:
{combined_content[:4000]}

Return ONLY a JSON array of flashcards with this exact format:
[{{"question": "...", "answer": "..."}}]"""

            response = await asyncio.to_thread(
                groq_client.chat.completions.create,
                model="openai/gpt-oss-120b",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=2000
            )
            self._log_groq_usage(user_id, "flashcards_ai", response, prompt=prompt)
            
            content = response.choices[0].message.content.strip()
            
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            flashcards_data = json.loads(content)
            
            set_title = self._combine_titles([note.title for note in notes], fallback="Flashcards")
            flashcard_set = FlashcardSet(
                user_id=user_id,
                title=set_title,
                description=f"Generated from notes: {', '.join([n.title for n in notes[:3]])}"
            )
            self.db.add(flashcard_set)
            self.db.flush()
            
            for card_data in flashcards_data:
                flashcard = Flashcard(
                    set_id=flashcard_set.id,
                    question=card_data["question"],
                    answer=card_data["answer"]
                )
                self.db.add(flashcard)
            
            self.db.commit()
            
            return {
                "success": True,
                "set_id": flashcard_set.id,
                "set_title": set_title,
                "card_count": len(flashcards_data),
                "flashcards": flashcards_data
            }
            
        except Exception as e:
            self._raise_if_groq_limit(e)
            logger.error(f"Error converting notes to flashcards: {e}")
            self.db.rollback()
            return {"success": False, "error": str(e)}

    
    async def notes_to_questions(
        self,
        note_ids: List[int],
        user_id: int,
        question_count: int = 10,
        difficulty: str = "medium"
    ) -> Dict[str, Any]:
        from models import Note, QuestionSet, Question
        
        try:
            notes = self.db.query(Note).filter(
                Note.id.in_(note_ids),
                Note.user_id == user_id
            ).all()
            
            if not notes:
                return {"success": False, "error": "No notes found"}
            
            combined_content = "\n\n".join([
                f"# {note.title}\n{note.content}" for note in notes
            ])
            
            prompt = f"""Generate {question_count} multiple-choice questions from these notes.
Difficulty: {difficulty}

Notes:
{combined_content[:4000]}

Return ONLY a JSON array with this exact format:
[{{
  "question": "...",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correct_answer": "A",
  "explanation": "..."
}}]"""

            response = await asyncio.to_thread(
                groq_client.chat.completions.create,
                model="openai/gpt-oss-120b",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=3000
            )
            self._log_groq_usage(user_id, "media_notes_ai", response, prompt=prompt)
            self._log_groq_usage(user_id, "quiz_ai", response, prompt=prompt)
            self._log_groq_usage(user_id, "question_bank_ai", response, prompt=prompt)
            
            content = response.choices[0].message.content.strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            raw_questions_data = json.loads(content)
            if not isinstance(raw_questions_data, list):
                raise ValueError("AI response must be a JSON array of questions")
            questions_data = [
                self._normalize_multiple_choice_question(question_data)
                for question_data in raw_questions_data
                if isinstance(question_data, dict)
            ]
            if not questions_data:
                raise ValueError("AI did not return any valid multiple-choice questions")
            
            set_title = self._combine_titles([note.title for note in notes], fallback="Practice Questions")
            question_set = QuestionSet(
                user_id=user_id,
                title=set_title,
                description=f"Generated from notes",
                source_type="notes",
                total_questions=len(questions_data)
            )
            self.db.add(question_set)
            self.db.flush()
            
            for idx, q_data in enumerate(questions_data):
                question = Question(
                    question_set_id=question_set.id,
                    question_text=q_data["question"],
                    question_type="multiple_choice",
                    topic=set_title,
                    options=json.dumps(q_data["options"]),
                    correct_answer=q_data["correct_answer"],
                    explanation=q_data.get("explanation", ""),
                    difficulty=difficulty,
                    order_index=idx
                )
                self.db.add(question)
            
            self.db.commit()
            
            return {
                "success": True,
                "set_id": question_set.id,
                "set_title": set_title,
                "question_count": len(questions_data),
                "questions": questions_data
            }
            
        except Exception as e:
            self._raise_if_groq_limit(e)
            logger.error(f"Error converting notes to questions: {e}")
            self.db.rollback()
            return {"success": False, "error": str(e)}

    async def notes_to_podcast(
        self,
        note_ids: List[int],
        user_id: int,
        voice_mode: str = "coach",
        voice_persona: str = "mentor",
        difficulty: str = "intermediate",
        answer_language: str = "en",
        session_options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        from models import Note

        try:
            normalized_ids: List[int] = []
            for raw_id in note_ids or []:
                try:
                    normalized_ids.append(int(raw_id))
                except (TypeError, ValueError):
                    continue

            if not normalized_ids:
                return {"success": False, "error": "No notes selected"}

            notes = self.db.query(Note).filter(
                Note.id.in_(normalized_ids),
                Note.user_id == user_id
            ).all()

            if not notes:
                return {"success": False, "error": "No notes found"}

            note_map = {note.id: note for note in notes}
            ordered_notes = [note_map[nid] for nid in normalized_ids if nid in note_map]
            if not ordered_notes:
                return {"success": False, "error": "No accessible notes found"}

            transcript_sections: List[str] = []
            for note in ordered_notes:
                plain_text = self._strip_html_to_text(getattr(note, "content", "") or "")
                if not plain_text:
                    continue
                title = (getattr(note, "title", "") or "Untitled").strip()
                transcript_sections.append(f"{title}\n{plain_text}")

            transcript = "\n\n".join(transcript_sections).strip()
            if len(transcript) < 120:
                return {"success": False, "error": "Selected notes do not have enough content for podcast mode"}
            max_transcript_chars = 60000
            was_truncated = len(transcript) > max_transcript_chars
            if was_truncated:
                transcript = transcript[:max_transcript_chars].strip()

            note_title = self._combine_titles(
                [getattr(note, "title", "") for note in ordered_notes],
                fallback="Notes Podcast"
            )
            analysis = self._build_notes_podcast_analysis(ordered_notes, transcript)

            return {
                "success": True,
                "note_ids": [note.id for note in ordered_notes],
                "note_titles": [(getattr(note, "title", "") or "Untitled").strip() for note in ordered_notes],
                "note_count": len(ordered_notes),
                "title": note_title,
                "source_type": "notes",
                "transcript": transcript,
                "analysis": analysis,
                "transcript_truncated": was_truncated,
                "podcast_settings": {
                    "voice_mode": voice_mode or "coach",
                    "voice_persona": voice_persona or "mentor",
                    "difficulty": difficulty or "intermediate",
                    "answer_language": answer_language or "en",
                    "session_options": session_options or {},
                },
            }
        except Exception as e:
            logger.error(f"Error converting notes to podcast payload: {e}")
            self.db.rollback()
            return {"success": False, "error": str(e)}

    
    
    async def flashcards_to_notes(
        self,
        set_ids: List[int],
        user_id: int,
        format_style: str = "structured"
    ) -> Dict[str, Any]:
        from models import FlashcardSet, Flashcard, Note
        
        try:
            flashcard_sets = self.db.query(FlashcardSet).filter(
                FlashcardSet.id.in_(set_ids),
                FlashcardSet.user_id == user_id
            ).all()
            
            if not flashcard_sets:
                return {"success": False, "error": "No flashcard sets found"}
            
            titles_by_set_id = {fset.id: fset.title for fset in flashcard_sets}
            cards_by_set_id: Dict[int, list] = {fset.id: [] for fset in flashcard_sets}
            for card in self.db.query(Flashcard).filter(Flashcard.set_id.in_(set_ids)).all():
                cards_by_set_id.setdefault(card.set_id, []).append(card)

            all_cards = [
                (titles_by_set_id[fset.id], card)
                for fset in flashcard_sets
                for card in cards_by_set_id.get(fset.id, [])
            ]

            if format_style == "structured":
                content = self._format_flashcards_structured(all_cards)
            elif format_style == "qa":
                content = self._format_flashcards_qa(all_cards)
            else:
                content = self._format_flashcards_summary(all_cards)
            
            note_title = self._combine_titles([fs.title for fs in flashcard_sets], fallback="Study Guide")
            note = Note(
                user_id=user_id,
                title=note_title,
                content=content
            )
            self.db.add(note)
            self.db.commit()
            
            return {
                "success": True,
                "note_id": note.id,
                "note_title": note_title,
                "card_count": len(all_cards)
            }
            
        except Exception as e:
            logger.error(f"Error converting flashcards to notes: {e}")
            self.db.rollback()
            return {"success": False, "error": str(e)}
    
    def _format_flashcards_structured(self, cards: List) -> str:
        content = "<h1>Study Guide from Flashcards</h1>\n\n"
        
        current_set = None
        for set_title, card in cards:
            if set_title != current_set:
                content += f"<h2>{set_title}</h2>\n\n"
                current_set = set_title
            
            content += f"<h3>{card.question}</h3>\n"
            content += f"<p>{card.answer}</p>\n\n"
        
        return content
    
    def _format_flashcards_qa(self, cards: List) -> str:
        content = "<h1>Q&A Study Guide</h1>\n\n"
        
        for idx, (set_title, card) in enumerate(cards, 1):
            content += f"<p><strong>Q{idx}:</strong> {card.question}</p>\n"
            content += f"<p><strong>A{idx}:</strong> {card.answer}</p>\n<br>\n"
        
        return content
    
    def _format_flashcards_summary(self, cards: List) -> str:
        content = "<h1>Study Summary</h1>\n\n<ul>\n"
        
        for set_title, card in cards:
            content += f"<li><strong>{card.question}</strong>: {card.answer}</li>\n"
        
        content += "</ul>"
        return content

    
    async def flashcards_to_questions(
        self,
        set_ids: List[int],
        user_id: int
    ) -> Dict[str, Any]:
        from models import FlashcardSet, Flashcard, QuestionSet, Question
        
        try:
            flashcard_sets = self.db.query(FlashcardSet).filter(
                FlashcardSet.id.in_(set_ids),
                FlashcardSet.user_id == user_id
            ).all()
            
            if not flashcard_sets:
                return {"success": False, "error": "No flashcard sets found"}
            
            all_cards = []
            for fset in flashcard_sets:
                cards = self.db.query(Flashcard).filter(
                    Flashcard.set_id == fset.id
                ).all()
                all_cards.extend(cards)
            
            cards_text = "\n".join([
                f"Q: {card.question}\nA: {card.answer}" 
                for card in all_cards[:20]
            ])
            
            prompt = f"""Convert these flashcards into multiple-choice questions.
For each flashcard, create a question with 4 options where one is correct.

Flashcards:
{cards_text}

Return ONLY a JSON array:
[{{
  "question": "...",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correct_answer": "A",
  "explanation": "..."
}}]"""

            response = await asyncio.to_thread(
                groq_client.chat.completions.create,
                model="openai/gpt-oss-120b",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=3000
            )
            self._log_groq_usage(user_id, "quiz_ai", response, prompt=prompt)
            
            content = response.choices[0].message.content.strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            questions_data = json.loads(content)
            
            set_title = self._combine_titles([fs.title for fs in flashcard_sets], fallback="Quiz")
            question_set = QuestionSet(
                user_id=user_id,
                title=set_title,
                description="Generated from flashcards",
                source_type="flashcards",
                total_questions=len(questions_data)
            )
            self.db.add(question_set)
            self.db.flush()
            
            for idx, q_data in enumerate(questions_data):
                question = Question(
                    question_set_id=question_set.id,
                    question_text=q_data["question"],
                    options=json.dumps(q_data["options"]),
                    correct_answer=q_data["correct_answer"],
                    explanation=q_data.get("explanation", ""),
                    order_index=idx
                )
                self.db.add(question)
            
            self.db.commit()
            
            return {
                "success": True,
                "set_id": question_set.id,
                "set_title": set_title,
                "question_count": len(questions_data)
            }
            
        except Exception as e:
            self._raise_if_groq_limit(e)
            logger.error(f"Error converting flashcards to questions: {e}")
            self.db.rollback()
            return {"success": False, "error": str(e)}

    
    
    async def questions_to_flashcards(
        self,
        set_ids: List[int],
        user_id: int
    ) -> Dict[str, Any]:
        from models import QuestionSet, Question, FlashcardSet, Flashcard
        
        try:
            question_sets = self.db.query(QuestionSet).filter(
                QuestionSet.id.in_(set_ids),
                QuestionSet.user_id == user_id
            ).all()
            
            if not question_sets:
                return {"success": False, "error": "No question sets found"}
            
            set_title = self._combine_titles([qs.title for qs in question_sets], fallback="Flashcards")
            flashcard_set = FlashcardSet(
                user_id=user_id,
                title=set_title,
                description="Generated from questions"
            )
            self.db.add(flashcard_set)
            self.db.flush()
            
            all_questions = self.db.query(Question).filter(
                Question.question_set_id.in_(set_ids)
            ).all()

            card_count = 0
            for question in all_questions:
                try:
                    options = json.loads(question.options)
                    correct_letter = question.correct_answer
                    correct_option = next(
                        (opt for opt in options if opt.startswith(correct_letter)),
                        options[0]
                    )
                    answer_text = correct_option.split(") ", 1)[1] if ") " in correct_option else correct_option

                    if question.explanation:
                        answer_text += f"\n\nExplanation: {question.explanation}"

                except:
                    answer_text = f"Correct answer: {question.correct_answer}"

                flashcard = Flashcard(
                    set_id=flashcard_set.id,
                    question=question.question_text,
                    answer=answer_text
                )
                self.db.add(flashcard)
                card_count += 1
            
            flashcard_set.card_count = card_count
            self.db.commit()
            
            return {
                "success": True,
                "set_id": flashcard_set.id,
                "set_title": set_title,
                "card_count": card_count
            }
            
        except Exception as e:
            logger.error(f"Error converting questions to flashcards: {e}")
            self.db.rollback()
            return {"success": False, "error": str(e)}

    
    async def questions_to_notes(
        self,
        set_ids: List[int],
        user_id: int
    ) -> Dict[str, Any]:
        from models import QuestionSet, Question, Note
        
        try:
            question_sets = self.db.query(QuestionSet).filter(
                QuestionSet.id.in_(set_ids),
                QuestionSet.user_id == user_id
            ).all()
            
            if not question_sets:
                return {"success": False, "error": "No question sets found"}
            
            content = "<h1>Study Guide from Questions</h1>\n\n"

            all_questions = self.db.query(Question).filter(
                Question.question_set_id.in_(set_ids)
            ).order_by(Question.question_set_id, Question.order_index).all()
            questions_by_set: Dict[int, list] = {}
            for question in all_questions:
                questions_by_set.setdefault(question.question_set_id, []).append(question)

            for qset in question_sets:
                content += f"<h2>{qset.title}</h2>\n\n"

                questions = questions_by_set.get(qset.id, [])

                for idx, question in enumerate(questions, 1):
                    content += f"<h3>Question {idx}</h3>\n"
                    content += f"<p><strong>{question.question_text}</strong></p>\n"
                    
                    try:
                        options = json.loads(question.options)
                        content += "<ul>\n"
                        for opt in options:
                            is_correct = opt.startswith(question.correct_answer)
                            if is_correct:
                                content += f"<li><strong>✓ {opt}</strong></li>\n"
                            else:
                                content += f"<li>{opt}</li>\n"
                        content += "</ul>\n"
                    except:
                        content += f"<p>Correct Answer: {question.correct_answer}</p>\n"
                    
                    if question.explanation:
                        content += f"<p><em>Explanation: {question.explanation}</em></p>\n"
                    
                    content += "<br>\n"
            
            note_title = self._combine_titles([qs.title for qs in question_sets], fallback="Study Guide")
            note = Note(
                user_id=user_id,
                title=note_title,
                content=content
            )
            self.db.add(note)
            self.db.commit()
            
            return {
                "success": True,
                "note_id": note.id,
                "note_title": note_title
            }
            
        except Exception as e:
            logger.error(f"Error converting questions to notes: {e}")
            self.db.rollback()
            return {"success": False, "error": str(e)}

    
    
    async def media_to_questions(
        self,
        media_ids: List[int],
        user_id: int,
        question_count: int = 10
    ) -> Dict[str, Any]:
        from models import MediaFile, QuestionSet, Question
        
        try:
            media_files = self.db.query(MediaFile).filter(
                MediaFile.id.in_(media_ids),
                MediaFile.user_id == user_id
            ).all()
            
            if not media_files:
                return {"success": False, "error": "No media files found"}
            
            combined_transcript = "\n\n".join([
                f"From {media.original_filename}:\n{media.transcript or ''}"
                for media in media_files if media.transcript
            ])
            
            if not combined_transcript.strip():
                return {"success": False, "error": "No transcripts available"}
            
            prompt = f"""Generate {question_count} multiple-choice questions from this transcript.

Transcript:
{combined_transcript[:4000]}

Return ONLY a JSON array:
[{{
  "question": "...",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correct_answer": "A",
  "explanation": "..."
}}]"""

            response = await asyncio.to_thread(
                groq_client.chat.completions.create,
                model="openai/gpt-oss-120b",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=3000
            )
            self._log_groq_usage(user_id, "quiz_ai", response, prompt=prompt)
            
            content = response.choices[0].message.content.strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            questions_data = json.loads(content)
            
            set_title = self._combine_titles([mf.original_filename for mf in media_files], fallback="Media Questions")
            question_set = QuestionSet(
                user_id=user_id,
                title=set_title,
                description="Generated from media transcripts",
                source_type="media",
                total_questions=len(questions_data)
            )
            self.db.add(question_set)
            self.db.flush()
            
            for idx, q_data in enumerate(questions_data):
                question = Question(
                    question_set_id=question_set.id,
                    question_text=q_data["question"],
                    options=json.dumps(q_data["options"]),
                    correct_answer=q_data["correct_answer"],
                    explanation=q_data.get("explanation", ""),
                    order_index=idx
                )
                self.db.add(question)
            
            self.db.commit()
            
            return {
                "success": True,
                "set_id": question_set.id,
                "set_title": set_title,
                "question_count": len(questions_data)
            }
            
        except Exception as e:
            self._raise_if_groq_limit(e)
            logger.error(f"Error converting media to questions: {e}")
            self.db.rollback()
            return {"success": False, "error": str(e)}

    
    
    async def playlist_to_notes(
        self,
        playlist_id: int,
        user_id: int
    ) -> Dict[str, Any]:
        from models import LearningPlaylist, PlaylistItem, Note
        
        try:
            logger.info(f"Looking for playlist with ID: {playlist_id} (type: {type(playlist_id)})")
            
            playlist = self.db.query(LearningPlaylist).filter(
                LearningPlaylist.id == playlist_id
            ).first()
            
            if not playlist:
                return {"success": False, "error": "Playlist not found"}
            
            logger.info(f"Found playlist: {playlist.title} (ID: {playlist.id})")
            
            items = self.db.query(PlaylistItem).filter(
                PlaylistItem.playlist_id == playlist_id
            ).order_by(PlaylistItem.order_index).all()
            
            logger.info(f"Query returned {len(items)} items for playlist_id={playlist_id}")

            if not items:
                return {"success": False, "error": f"Playlist has no items (checked playlist_id={playlist_id})"}
            
            playlist_context = f"# {playlist.title}\n\n"
            if playlist.description:
                playlist_context += f"{playlist.description}\n\n"
            
            playlist_context += "## Learning Materials:\n\n"
            for idx, item in enumerate(items, 1):
                playlist_context += f"### {idx}. {item.title or 'Untitled'}\n"
                playlist_context += f"**Type:** {item.item_type}\n"
                if item.description:
                    playlist_context += f"**Description:** {item.description}\n"
                if item.notes:
                    playlist_context += f"**Notes:** {item.notes}\n"
                if item.url:
                    playlist_context += f"**Resource:** {item.url}\n"
                if item.duration_minutes:
                    playlist_context += f"**Duration:** {item.duration_minutes} minutes\n"
                playlist_context += "\n"
            
            prompt = f"""You are an expert educator. Create comprehensive, detailed study notes from this learning playlist.

{playlist_context[:4000]}

Write detailed educational content that:
- Explains each topic thoroughly with 3-4 paragraphs minimum per topic
- Includes key concepts, definitions, and explanations
- Provides context and real-world applications
- Uses clear structure with headings and subheadings
- Makes complex topics easy to understand

Output ONLY HTML content with these tags: <h1>, <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>.
Start with <h1>{playlist.title}</h1> then write comprehensive content for each topic.
Write at least 500 words of educational content."""

            response = await asyncio.to_thread(
                groq_client.chat.completions.create,
                model="openai/gpt-oss-120b",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=6000
            )
            self._log_groq_usage(user_id, "notes_ai", response, prompt=prompt)
            
            ai_content = response.choices[0].message.content.strip()
            
            if "```html" in ai_content:
                ai_content = ai_content.split("```html")[1].split("```")[0].strip()
            elif "```" in ai_content:
                parts = ai_content.split("```")
                if len(parts) >= 3:
                    ai_content = parts[1].strip()
            
            if ai_content.startswith("html"):
                ai_content = ai_content[4:].strip()
            
            if not ai_content or len(ai_content) < 100:
                raise Exception(f"AI generated insufficient content (length: {len(ai_content)})")
            
            if not ai_content.startswith("<"):
                ai_content = f"<div>{ai_content}</div>"
            
            note = Note(
                user_id=user_id,
                title=playlist.title or "Study Notes",
                content=ai_content
            )
            self.db.add(note)
            self.db.commit()
            self.db.refresh(note)
            
            if not note.content or len(note.content) < 100:
                raise Exception("Note content was not saved properly")
            
            logger.info(f"Created note {note.id} with {len(note.content)} characters")

            try:
                from tutor import chroma_store
                if chroma_store.available():
                    sample_titles = [item.title for item in items if item.title][:5]
                    topics = "; ".join(sample_titles) if sample_titles else "playlist topics"
                    summary = (
                        f"AI generated study notes from playlist \"{playlist.title}\" "
                        f"with {len(items)} items. Topics: {topics}."
                    )
                    chroma_store.write_episode(
                        user_id=str(user_id),
                        summary=summary,
                        metadata={
                            "source": "note_activity",
                            "action": "ai_generated",
                            "origin": "playlist",
                            "playlist_id": str(playlist.id),
                            "playlist_title": playlist.title[:100],
                            "note_id": str(note.id),
                            "note_title": note.title[:100],
                            "topic": playlist.title[:100],
                            "items_count": str(len(items)),
                        },
                    )
            except Exception as e:
                logger.warning(f"Chroma write failed on playlist notes generation: {e}")
            
            return {
                "success": True,
                "note_id": note.id,
                "note_title": note.title,
                "items_count": len(items)
            }
            
        except Exception as e:
            self._raise_if_groq_limit(e)
            logger.error(f"Error converting playlist to notes: {e}")
            self.db.rollback()
            return {"success": False, "error": str(e)}
    
    async def playlist_to_flashcards(
        self,
        playlist_id: int,
        user_id: int,
        card_count: int = 15
    ) -> Dict[str, Any]:
        from models import LearningPlaylist, PlaylistItem, FlashcardSet, Flashcard
        
        try:
            playlist = self.db.query(LearningPlaylist).filter(
                LearningPlaylist.id == playlist_id
            ).first()
            
            if not playlist:
                return {"success": False, "error": "Playlist not found"}
            
            items = self.db.query(PlaylistItem).filter(
                PlaylistItem.playlist_id == playlist_id
            ).all()

            if not items:
                return {"success": False, "error": "Add at least one playlist item before generating flashcards"}
            
            combined_content = "\n\n".join([
                f"Title: {item.title or 'Untitled'}\n"
                f"Type: {item.item_type}\n"
                f"Description: {item.description or ''}\n"
                f"Notes: {item.notes or ''}\n"
                f"URL: {item.url or ''}"
                for item in items
            ])
            
            prompt = f"""Generate {card_count} flashcards from this playlist content.

Content:
{combined_content[:4000]}

Return ONLY a JSON array:
[{{"question": "...", "answer": "..."}}]"""

            response = await asyncio.to_thread(
                groq_client.chat.completions.create,
                model="openai/gpt-oss-120b",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=2000
            )
            self._log_groq_usage(user_id, "flashcards_ai", response, prompt=prompt)
            
            content = response.choices[0].message.content.strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            flashcards_data = json.loads(content)
            
            flashcard_set = FlashcardSet(
                user_id=user_id,
                title=playlist.title or "Flashcards",
                description=f"From playlist: {playlist.title or 'Untitled'}"
            )
            self.db.add(flashcard_set)
            self.db.flush()
            
            for card_data in flashcards_data:
                flashcard = Flashcard(
                    set_id=flashcard_set.id,
                    question=card_data["question"],
                    answer=card_data["answer"]
                )
                self.db.add(flashcard)
            
            self.db.commit()

            try:
                from tutor import chroma_store
                if chroma_store.available():
                    sample_questions = [c.get("question", "")[:60] for c in flashcards_data[:5]]
                    sample_text = "; ".join([q for q in sample_questions if q])
                    summary = (
                        f"AI generated flashcards from playlist \"{playlist.title}\" "
                        f"with {len(flashcards_data)} cards. "
                        f"Sample questions: {sample_text or 'N/A'}."
                    )
                    chroma_store.write_episode(
                        user_id=str(user_id),
                        summary=summary,
                        metadata={
                            "source": "flashcard_created",
                            "action": "ai_generated",
                            "origin": "playlist",
                            "playlist_id": str(playlist.id),
                            "playlist_title": playlist.title[:100],
                            "set_id": str(flashcard_set.id),
                            "set_title": flashcard_set.title[:100],
                            "topic": playlist.title[:100],
                            "card_count": str(len(flashcards_data)),
                        },
                    )
            except Exception as e:
                logger.warning(f"Chroma write failed on playlist flashcards generation: {e}")
            
            return {
                "success": True,
                "set_id": flashcard_set.id,
                "set_title": flashcard_set.title,
                "card_count": len(flashcards_data)
            }
            
        except Exception as e:
            self._raise_if_groq_limit(e)
            logger.error(f"Error converting playlist to flashcards: {e}")
            self.db.rollback()
            return {"success": False, "error": str(e)}

    
    
    async def merge_notes(
        self,
        note_ids: List[int],
        user_id: int,
        new_title: str = None
    ) -> Dict[str, Any]:
        from models import Note
        
        try:
            notes = self.db.query(Note).filter(
                Note.id.in_(note_ids),
                Note.user_id == user_id
            ).all()
            
            if len(notes) < 2:
                return {"success": False, "error": "Need at least 2 notes to merge"}
            
            merged_content = ""
            for note in notes:
                merged_content += f"<h2>{note.title}</h2>\n{note.content}\n<hr>\n"
            
            title = new_title or f"Merged: {', '.join([n.title[:20] for n in notes[:3]])}"
            merged_note = Note(
                user_id=user_id,
                title=title,
                content=merged_content
            )
            self.db.add(merged_note)
            self.db.commit()
            
            return {
                "success": True,
                "note_id": merged_note.id,
                "note_title": title,
                "merged_count": len(notes)
            }
            
        except Exception as e:
            logger.error(f"Error merging notes: {e}")
            self.db.rollback()
            return {"success": False, "error": str(e)}
    
    
    def export_flashcards_to_csv(
        self,
        set_ids: List[int],
        user_id: int
    ) -> Dict[str, Any]:
        from models import FlashcardSet, Flashcard
        import csv
        import io
        
        try:
            flashcard_sets = self.db.query(FlashcardSet).filter(
                FlashcardSet.id.in_(set_ids),
                FlashcardSet.user_id == user_id
            ).all()
            
            if not flashcard_sets:
                return {"success": False, "error": "No flashcard sets found"}
            
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["Set", "Question", "Answer"])
            
            titles_by_set_id = {fset.id: fset.title for fset in flashcard_sets}
            all_cards = self.db.query(Flashcard).filter(
                Flashcard.set_id.in_(set_ids)
            ).order_by(Flashcard.set_id).all()
            for card in all_cards:
                writer.writerow([titles_by_set_id.get(card.set_id, ""), card.question, card.answer])
            
            csv_content = output.getvalue()
            output.close()
            
            return {
                "success": True,
                "content": csv_content,
                "filename": f"flashcards_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
            }
            
        except Exception as e:
            logger.error(f"Error exporting flashcards to CSV: {e}")
            return {"success": False, "error": str(e)}

    
    def export_questions_to_pdf(
        self,
        set_ids: List[int],
        user_id: int
    ) -> Dict[str, Any]:
        from models import QuestionSet, Question
        
        try:
            question_sets = self.db.query(QuestionSet).filter(
                QuestionSet.id.in_(set_ids),
                QuestionSet.user_id == user_id
            ).all()
            
            if not question_sets:
                return {"success": False, "error": "No question sets found"}
            
            html_content = """
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
                    h2 { color: #34495e; margin-top: 30px; }
                    .question { margin: 20px 0; padding: 15px; background: #f8f9fa; border-left: 4px solid #3498db; }
                    .options { margin: 10px 0; }
                    .option { margin: 5px 0; padding: 5px; }
                    .correct { background: #d4edda; font-weight: bold; }
                    .explanation { margin-top: 10px; padding: 10px; background: #fff3cd; border-left: 3px solid #ffc107; }
                </style>
            </head>
            <body>
                <h1>Question Bank Export</h1>
            """
            
            all_questions = self.db.query(Question).filter(
                Question.question_set_id.in_(set_ids)
            ).order_by(Question.question_set_id, Question.order_index).all()
            questions_by_set: Dict[int, list] = {}
            for question in all_questions:
                questions_by_set.setdefault(question.question_set_id, []).append(question)

            for qset in question_sets:
                html_content += f"<h2>{qset.title}</h2>"

                questions = questions_by_set.get(qset.id, [])

                for idx, question in enumerate(questions, 1):
                    html_content += f'<div class="question">'
                    html_content += f'<strong>Question {idx}:</strong> {question.question_text}'
                    html_content += '<div class="options">'
                    
                    try:
                        options = json.loads(question.options)
                        for opt in options:
                            is_correct = opt.startswith(question.correct_answer)
                            css_class = "option correct" if is_correct else "option"
                            html_content += f'<div class="{css_class}">{opt}</div>'
                    except:
                        html_content += f'<div class="option correct">Correct: {question.correct_answer}</div>'
                    
                    html_content += '</div>'
                    
                    if question.explanation:
                        html_content += f'<div class="explanation"><strong>Explanation:</strong> {question.explanation}</div>'
                    
                    html_content += '</div>'
            
            html_content += "</body></html>"
            
            return {
                "success": True,
                "content": html_content,
                "filename": f"questions_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.html"
            }
            
        except Exception as e:
            logger.error(f"Error exporting questions to PDF: {e}")
            return {"success": False, "error": str(e)}
    
    def export_notes_to_markdown(
        self,
        note_ids: List[int],
        user_id: int
    ) -> Dict[str, Any]:
        from models import Note
        import html2text
        
        try:
            notes = self.db.query(Note).filter(
                Note.id.in_(note_ids),
                Note.user_id == user_id
            ).all()
            
            if not notes:
                return {"success": False, "error": "No notes found"}
            
            h = html2text.HTML2Text()
            h.ignore_links = False
            
            markdown_content = ""
            for note in notes:
                markdown_content += f"# {note.title}\n\n"
                markdown_content += h.handle(note.content)
                markdown_content += "\n\n---\n\n"
            
            return {
                "success": True,
                "content": markdown_content,
                "filename": f"notes_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.md"
            }
            
        except Exception as e:
            logger.error(f"Error exporting notes to markdown: {e}")
            return {"success": False, "error": str(e)}
