from typing import Dict, List, Optional
from pydantic import BaseModel


class PDFUploadRequest(BaseModel):
    user_id: str


class QuestionGenerationRequest(BaseModel):
    user_id: str
    source_type: str
    source_id: Optional[int] = None
    content: Optional[str] = None
    question_count: int = 10
    difficulty_mix: Dict[str, int] = {"easy": 3, "medium": 5, "hard": 2}
    question_types: List[str] = ["multiple_choice", "true_false", "short_answer"]
    topics: Optional[List[str]] = None
    title: Optional[str] = None
    custom_prompt: Optional[str] = None
    session_id: Optional[str] = None
    # When true, difficulty_mix (above) is ignored and overwritten server-side with a
    # single difficulty chosen by ContentDifficultyBandit for this student+topic --
    # see generate_from_pdf's resolution step right before the source_type dispatch.
    adaptive_difficulty: bool = False


class AnswerSubmission(BaseModel):
    user_id: str
    question_set_id: int
    answers: Dict[str, str]
    time_taken_seconds: Optional[int] = None


class SimilarQuestionRequest(BaseModel):
    user_id: str
    question_id: int
    difficulty: Optional[str] = None


class MultiPDFGenerationRequest(BaseModel):
    user_id: str
    source_ids: List[int]
    question_count: int = 10
    difficulty_mix: Dict[str, int] = {"easy": 3, "medium": 5, "hard": 2}
    question_types: List[str] = ["multiple_choice", "true_false", "short_answer"]
    topics: Optional[List[str]] = None
    title: Optional[str] = None
    custom_prompt: Optional[str] = None
    reference_document_id: Optional[int] = None
    content_document_ids: Optional[List[int]] = None
    session_id: Optional[str] = None
    adaptive_difficulty: bool = False


class SourceSelection(BaseModel):
    type: str
    id: int
    title: Optional[str] = None


class MultiSourceGenerationRequest(BaseModel):
    user_id: str
    sources: List[SourceSelection]
    question_count: int = 10
    difficulty_mix: Dict[str, int] = {"easy": 3, "medium": 5, "hard": 2}
    question_types: List[str] = ["multiple_choice", "true_false", "short_answer"]
    topics: Optional[List[str]] = None
    title: Optional[str] = None
    custom_prompt: Optional[str] = None
    session_id: Optional[str] = None
    adaptive_difficulty: bool = False


class RelatedPDFGenerationRequest(BaseModel):
    user_id: str
    source_ids: List[int]
    question_count: int = 10
    difficulty_mix: Dict[str, int] = {"easy": 3, "medium": 5, "hard": 2}
    question_types: List[str] = ["multiple_choice", "true_false", "short_answer"]
    topics: Optional[List[str]] = None
    title: Optional[str] = None
    session_id: Optional[str] = None
