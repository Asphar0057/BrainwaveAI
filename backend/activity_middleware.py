import time
import logging
import os
from fastapi import Request
from jose import jwt, JWTError
from starlette.background import BackgroundTasks
from activity_logger import log_activity
from activity_context import set_activity_context, clear_activity_context
from deps import SECRET_KEY, ALGORITHM

logger = logging.getLogger(__name__)

ENDPOINT_TOOL_RULES = [
    ('/api/save_chat_message', 'ai_chat'),
    ('/api/send_message', 'ai_chat'),
    ('/api/rename_chat', 'ai_chat'),
    ('/api/ask_simple', 'ai_chat'),
    ('/api/ask_with_files', 'ai_chat'),
    ('/api/ask/', 'ai_chat'),
    ('/api/chat', 'ai_chat'),
    ('/api/generate_flashcards', 'flashcards_ai'),
    ('/api/convert_to_flashcards', 'flashcards_ai'),
    ('/api/flashcards', 'flashcards'),
    ('/api/generate_notes', 'notes_ai'),
    ('/api/convert_to_notes', 'notes_ai'),
    ('/api/import_export/notes_to_podcast', 'podcast_ai'),
    ('/api/save_note', 'notes'),
    ('/api/notes', 'notes'),
    ('/api/generate_quiz', 'quiz_ai'),
    ('/api/quiz', 'quiz'),
    ('/api/generate_questions', 'question_bank_ai'),
    ('/api/question_bank', 'question_bank'),
    ('/api/analyze_slide/', 'slide_explorer_ai'),
    ('/api/analyze_slides', 'slide_explorer_ai'),
    ('/api/slide_explorer', 'slide_explorer'),
    ('/api/media/process', 'media_notes_ai'),
    ('/api/media/regenerate-notes', 'media_notes_ai'),
    ('/api/media/generate-title', 'media_notes_ai'),
    ('/api/process_media', 'media_notes_ai'),
    ('/api/transcribe_audio/', 'media_notes_ai'),
    ('/api/media/podcast/mcq/start', 'podcast_ai'),
    ('/api/media/podcast/start', 'podcast_ai'),
    ('/api/media/podcast/ask', 'podcast_ai'),
    ('/api/media/podcast/', 'podcast'),
    ('/api/media/', 'media_notes'),
    ('/api/media_notes', 'media_notes'),
    ('/api/upload_media', 'media_notes'),
    ('/api/learning-paths/generate', 'learning_path_ai'),
    ('/api/learning-paths/', 'learning_paths'),
    ('/api/learning_paths', 'learning_paths'),
    ('/api/generate_learning_path', 'learning_path_ai'),
    ('/api/weakness', 'weakness_analysis'),
    ('/api/analyze_weakness', 'weakness_ai'),
    ('/api/study_insights', 'study_insights'),
    ('/api/get_comprehensive_profile', 'profile'),
    ('/api/update_profile', 'profile'),
]

SKIP_ACTIVITY_LOG_PATHS = {
    '/api/account/delete/request',
    '/api/account/delete/confirm',
}

def get_tool_name(path: str) -> str:
    for endpoint, tool in ENDPOINT_TOOL_RULES:
        if path.startswith(endpoint):
            return tool
    cleaned = path.replace('/api/', '').strip('/')
    if not cleaned:
        return 'other'
    segment = cleaned.split('/')[0].replace('-', '_')
    ai_hints = ('generate', 'analyze', 'analysis', 'summarize', 'summary', 'recommend', 'suggest', 'ai')
    if any(hint in path for hint in ai_hints):
        if segment.endswith('_ai'):
            return segment
        return f"{segment}_ai"
    return segment

def get_action(method: str, path: str) -> str:
    if method == 'POST':
        return 'create'
    if method in ('PUT', 'PATCH'):
        return 'update'
    if method == 'DELETE':
        return 'delete'
    if method == 'GET':
        return 'view'
    return 'action'

def is_ai_tool(tool_name: str) -> bool:
    if not tool_name:
        return False
    return tool_name.startswith('ai_') or tool_name.endswith('_ai') or 'ai' in tool_name

def _add_activity_log_task(response, *, user_id, tool_name, action, metadata):
    if response.background is None:
        response.background = BackgroundTasks()

    if hasattr(response.background, "add_task"):
        response.background.add_task(
            log_activity,
            user_id=user_id,
            tool_name=tool_name,
            action=action,
            tokens_used=0,
            metadata=metadata,
        )
        return

    existing_background = response.background
    tasks = BackgroundTasks()
    tasks.add_task(existing_background)
    tasks.add_task(
        log_activity,
        user_id=user_id,
        tool_name=tool_name,
        action=action,
        tokens_used=0,
        metadata=metadata,
    )
    response.background = tasks

async def log_request_activity(request: Request, call_next):
    start_time = time.time()
    should_log_activity = (
        request.url.path.startswith('/api/')
        and not request.url.path.startswith('/api/admin/')
        and request.url.path not in SKIP_ACTIVITY_LOG_PATHS
    )

    user_id = None
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1].strip()
        try:
            payload = jwt.decode(
                token,
                SECRET_KEY,
                algorithms=[ALGORITHM],
                audience="brainwave-client",
                issuer="brainwave-backend",
            )
            user_id = payload.get("sub")
        except JWTError:
            user_id = None

    context_token = None
    if user_id and user_id != 'null' and user_id.strip() and should_log_activity:
        tool_name = get_tool_name(request.url.path)
        action = get_action(request.method, request.url.path)
        context_token = set_activity_context({
            'user_id': user_id,
            'tool_name': tool_name,
            'action': action,
            'endpoint': request.url.path,
            'method': request.method
        })

    try:
        response = await call_next(request)
    finally:
        if context_token is not None:
            clear_activity_context(context_token)

    duration = time.time() - start_time
    if request.url.path.startswith('/api/') and duration >= 1.0:
        logger.warning(
            "Slow API request: %s %s status=%s duration=%.2fs",
            request.method,
            request.url.path,
            response.status_code,
            duration,
        )

    if user_id and user_id != 'null' and user_id.strip() and should_log_activity:
        tool_name = get_tool_name(request.url.path)
        action = get_action(request.method, request.url.path)

        metadata = {
            'endpoint': request.url.path,
            'method': request.method,
            'duration_seconds': round(duration, 2),
            'status_code': response.status_code,
            'is_ai_endpoint': is_ai_tool(tool_name),
            'event_type': 'request'
        }

        if is_ai_tool(tool_name):
            metadata['token_source'] = 'none'

        _add_activity_log_task(
            response,
            user_id=user_id,
            tool_name=tool_name,
            action=action,
            metadata=metadata,
        )

    return response
