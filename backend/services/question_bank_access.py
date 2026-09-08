"""Resource ownership applies even when a question-bank request omits user_id."""
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from deps import get_current_user
import models


async def enforce_question_bank_resources(request: Request, db: Session = Depends(get_db), user=Depends(get_current_user)):
    data = {**dict(request.query_params), **request.path_params}
    if 'application/json' in request.headers.get('content-type', ''):
        try:
            body = await request.json()
            if isinstance(body, dict): data.update(body)
        except ValueError:
            return
    mapping = {
        'set_id': models.QuestionSet, 'set_ids': models.QuestionSet, 'question_set_id': models.QuestionSet,
        'doc_id': models.UploadedDocument, 'document_id': models.UploadedDocument, 'source_ids': models.UploadedDocument,
        'reference_document_id': models.UploadedDocument, 'content_document_ids': models.UploadedDocument,
        'weak_area_id': models.UserWeakArea, 'wrong_answer_id': models.WrongAnswerLog,
        'question_id': models.Question,
    }
    checks = []
    for key, model in mapping.items():
        value = data.get(key)
        if value is not None:
            checks.extend((model, ident) for ident in (value if isinstance(value, list) else [value]))
    for model, ident in checks:
        if model == models.Question:
            found = db.query(model.id).join(models.QuestionSet).filter(model.id == ident, models.QuestionSet.user_id == user.id).first()
        else:
            found = db.query(model.id).filter(model.id == ident, model.user_id == user.id).first()
        if not found:
            raise HTTPException(status_code=404, detail="Resource not found")
