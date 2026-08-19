import os
import json
import html
import tempfile
import subprocess
import shutil
from typing import Dict, List, Optional, Any
from datetime import datetime
import asyncio
import logging
from env_loader import load_backend_env
from activity_logger import log_ai_tokens
from services.ai_usage import estimate_usage, extract_usage_from_openai_like, extract_usage_from_gemini_payload
from services.api_key_pool import (
    ApiKeyPoolExhausted,
    build_key_pool,
    is_provider_quota_error,
    provider_limit_exhausted,
    record_provider_usage,
)

try:
    from langdetect import detect, LangDetectException
except ImportError:
    detect = None
    LangDetectException = Exception

try:
    import pycountry
except ImportError:
    pycountry = None

try:
    from google import genai
    GEMINI_AVAILABLE = True
except ImportError:
    genai = None
    GEMINI_AVAILABLE = False

# "gemini-2.0-flash-exp" (the experimental preview model this used to target)
# has been retired by Google and now 404s on every call -- this Gemini
# fallback path was silently dead. Using the same stable model as deps.py.
GEMINI_MODEL_NAME = "gemini-2.0-flash"

try:
    from groq import Groq
    GROQ_AVAILABLE = True
except ImportError:
    Groq = None
    GROQ_AVAILABLE = False

try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    AudioSegment = None
    PYDUB_AVAILABLE = False

from services.youtube_api_service import youtube_service
from services.rate_limiter import rate_limiter
from services.ytdlp_utils import (
    classify_ytdlp_error,
    get_ytdlp_common_args,
    summarize_ytdlp_error,
    ytdlp_auth_args,
)

logger = logging.getLogger(__name__)

load_backend_env()

GEMINI_API_KEY = os.getenv("GOOGLE_GENERATIVE_AI_KEY") or os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_AVAILABLE and GEMINI_API_KEY else None

groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_AVAILABLE and GROQ_API_KEY else None

class AIMediaProcessor:

    def __init__(self):
        self.youtube_service = youtube_service
        self.groq_key_pool = build_key_pool("groq", ("GROQ_API_KEYS", "GROQ_API_KEY"))
        self.groq_client = (
            Groq(api_key=self.groq_key_pool.entries[0].token)
            if GROQ_AVAILABLE and self.groq_key_pool.enabled
            else groq_client
        )

        if gemini_client is not None:
            self.gemini_client = gemini_client
            logger.info("Gemini available as fallback (Groq is primary)")
        else:
            self.gemini_client = None
            logger.info("Using Groq exclusively for AI processing")

    def _is_groq_quota_error(self, error: Exception) -> bool:
        return is_provider_quota_error(error)

    def _estimate_groq_request_tokens(self, prompt: str, max_tokens: int) -> int:
        prompt_tokens = max(1, len(prompt or "") // 8)
        completion_budget = max(500, max_tokens // 2)
        return min(9000, prompt_tokens + completion_budget)

    async def _create_groq_chat_completion(
        self,
        *,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
        estimated_tokens: int,
        user_id: Optional[int],
        usage_extra: Dict,
    ):
        if not GROQ_AVAILABLE:
            raise ValueError("Groq package not available")

        last_error = None
        tried_keys = 0

        while True:
            lease = None
            try:
                if self.groq_key_pool.enabled:
                    lease = self.groq_key_pool.reserve(estimated_tokens)
                    tried_keys += 1
                    client = Groq(api_key=lease.token)
                elif self.groq_client:
                    client = self.groq_client
                    tried_keys += 1
                else:
                    raise ValueError("Groq client not available")

                can_call, wait_time = rate_limiter.can_call_groq()
                if not can_call:
                    logger.warning(f"Groq request rate limit check: waiting {wait_time:.1f} seconds...")
                    await asyncio.sleep(wait_time + 1)

                rate_limiter.record_groq_call()
                response = client.chat.completions.create(
                    model="openai/gpt-oss-120b",
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                usage = extract_usage_from_openai_like(response) or {}
                if lease:
                    self.groq_key_pool.record_success(lease, usage.get("total_tokens"))
                self._log_groq_usage(
                    user_id,
                    "media_notes_ai",
                    response,
                    usage_extra,
                    prompt=json.dumps(messages),
                    key_pool_recorded=bool(lease),
                )
                return response

            except ApiKeyPoolExhausted:
                if last_error:
                    raise last_error
                raise
            except Exception as e:
                last_error = e
                if lease:
                    if self._is_groq_quota_error(e):
                        logger.warning(
                            "Groq key hit provider quota/rate limit; rotating to next configured key: %s",
                            str(e),
                        )
                        self.groq_key_pool.mark_exhausted(lease, cooldown_seconds=3600)
                        continue
                    self.groq_key_pool.release(lease)
                if self._is_groq_quota_error(e) and tried_keys <= 1:
                    raise
                raise

    def _log_groq_usage(
        self,
        user_id: Optional[int],
        tool_name: str,
        response,
        extra: Dict = None,
        prompt: str = "",
        key_pool_recorded: bool = False,
    ):
        if not user_id:
            return
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
            if token_source == "model_usage" and not key_pool_recorded:
                record_provider_usage("groq", usage.get("total_tokens", 0))
            metadata = {"provider": "groq", "source": "media_processing"}
            if extra:
                metadata.update(extra)
            metadata["token_source"] = token_source
            log_ai_tokens(
                user_id=user_id,
                tool_name=tool_name,
                prompt_tokens=usage.get("prompt_tokens", 0),
                completion_tokens=usage.get("completion_tokens", 0),
                total_tokens=usage.get("total_tokens", 0),
                model="openai/gpt-oss-120b",
                metadata=metadata
            )
        except Exception:
            pass

    def _log_gemini_usage(self, user_id: Optional[int], tool_name: str, response, extra: Dict = None, prompt: str = ""):
        if not user_id:
            return
        completion = getattr(response, "text", "") or ""
        usage = extract_usage_from_gemini_payload(response)
        token_source = "model_usage" if usage else "estimated"
        usage = usage or estimate_usage(prompt, completion)
        if not usage.get("total_tokens"):
            return
        try:
            if token_source == "model_usage":
                record_provider_usage("gemini", usage.get("total_tokens", 0))
            metadata = {"provider": "gemini", "source": "media_processing"}
            if extra:
                metadata.update(extra)
            metadata["token_source"] = token_source
            log_ai_tokens(
                user_id=user_id,
                tool_name=tool_name,
                prompt_tokens=usage.get("prompt_tokens", 0),
                completion_tokens=usage.get("completion_tokens", 0),
                total_tokens=usage.get("total_tokens", 0),
                model=GEMINI_MODEL_NAME,
                metadata=metadata
            )
        except Exception:
            pass
    
    async def process_youtube_video(self, url: str, options: Dict = None) -> Dict:
        try:
            logger.info(f"Processing YouTube URL with audio-first flow: {url}")
            
            if not url or url.strip() == "":
                raise ValueError("YouTube URL is empty")

            normalized_url = url.strip()
            download_result = await self._download_youtube_audio(normalized_url)
            primary_error = download_result.get("error")

            if download_result.get("success"):
                temp_dir = download_result.get("temp_dir")
                audio_path = download_result.get("audio_path")
                metadata = download_result.get("metadata", {})
                video_id = download_result.get("video_id")

                try:
                    transcription_result = await self.transcribe_audio_groq(audio_path)
                finally:
                    if temp_dir and os.path.isdir(temp_dir):
                        shutil.rmtree(temp_dir, ignore_errors=True)

                if transcription_result.get("success"):
                    transcript_text = transcription_result.get("transcript", "")
                    language = transcription_result.get("language", "en")
                    if detect and transcript_text:
                        try:
                            language = detect(transcript_text[:500])
                        except Exception:
                            pass

                    duration = transcription_result.get("duration") or metadata.get("duration", 0)
                    thumbnail = metadata.get("thumbnail")
                    if not thumbnail and video_id:
                        thumbnail = f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"

                    return {
                        "success": True,
                        "video_info": {
                            "title": metadata.get("title", "YouTube Video"),
                            "author": metadata.get("uploader") or metadata.get("channel", "Unknown"),
                            "length": duration,
                            "description": (metadata.get("description") or "")[:500],
                            "thumbnail": thumbnail or ""
                        },
                        "transcript": transcript_text,
                        "segments": transcription_result.get("segments", []),
                        "language": language,
                        "duration": duration,
                        "has_timestamps": transcription_result.get("has_timestamps", False),
                        "is_auto_generated": False
                    }

                logger.warning(
                    "Primary audio transcription failed, trying caption fallback: %s",
                    transcription_result.get("error", "Unknown transcription error")
                )
            else:
                logger.warning(
                    "Primary YouTube audio download failed, trying caption fallback: %s",
                    primary_error or "Unknown download error"
                )

            caption_result = await self.youtube_service.process_video(normalized_url)
            if not caption_result.get("success"):
                error_msg = caption_result.get("error", "Failed to process YouTube video")
                logger.error(f"Caption fallback failed: {error_msg}")
                if primary_error and primary_error != error_msg:
                    raise ValueError(f"{error_msg}. Audio path failed first: {primary_error}")
                raise ValueError(error_msg)

            video_info = caption_result.get("video_info", {})
            language = caption_result.get("language", "en")
            if detect and caption_result.get("transcript"):
                try:
                    language = detect(caption_result["transcript"][:500])
                except Exception:
                    pass

            return {
                "success": True,
                "video_info": {
                    "title": video_info.get("title", "YouTube Video"),
                    "author": video_info.get("author", "Unknown"),
                    "length": video_info.get("length", caption_result.get("duration", 0)),
                    "description": video_info.get("description", ""),
                    "thumbnail": video_info.get("thumbnail", "")
                },
                "transcript": caption_result.get("transcript", ""),
                "segments": caption_result.get("segments", []),
                "language": language,
                "duration": caption_result.get("duration", video_info.get("length", 0)),
                "has_timestamps": caption_result.get("has_timestamps", True),
                "is_auto_generated": caption_result.get("is_auto_generated", False)
            }
            
        except ApiKeyPoolExhausted:
            raise
        except Exception as e:
            logger.error(f"YouTube processing error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    async def _download_youtube_audio(self, url: str) -> Dict:
        temp_dir = tempfile.mkdtemp(prefix="yt_audio_")
        output_template = os.path.join(temp_dir, "%(id)s.%(ext)s")
        format_attempts = [
            ["-f", "bestaudio/best"],
            ["-f", "best"],
            []
        ]

        try:
            loop = asyncio.get_event_loop()
            final_error = "yt-dlp failed to download audio"
            final_error_code = "unknown"
            terminal_codes = {
                "age_restricted",
                "bot_challenge",
                "signin_required",
                "rate_limited",
                "video_unavailable",
                "geo_restricted",
                "forbidden",
                "extractor_error",
                "network_error",
            }

            with ytdlp_auth_args(logger) as auth_args:
                base_cmd = [
                    "yt-dlp",
                    "--no-playlist",
                    "--restrict-filenames",
                    *get_ytdlp_common_args(),
                    *auth_args,
                    "--print-json",
                    "-o",
                    output_template,
                ]

                for fmt_args in format_attempts:
                    cmd = base_cmd + fmt_args + [url]
                    process = await loop.run_in_executor(
                        None,
                        lambda: subprocess.run(
                            cmd,
                            capture_output=True,
                            text=True,
                            timeout=180
                        )
                    )

                    if process.returncode != 0:
                        error_msg = (process.stderr or process.stdout or "yt-dlp failed").strip()
                        classified = classify_ytdlp_error(error_msg)
                        logger.warning(
                            "yt-dlp audio attempt failed (%s) code=%s detail=%s",
                            " ".join(fmt_args) or "default",
                            classified["code"],
                            summarize_ytdlp_error(error_msg),
                        )

                        final_error = classified["message"]
                        final_error_code = classified["code"]
                        if classified["code"] in terminal_codes:
                            break
                        continue

                    metadata = {}
                    for line in reversed(process.stdout.splitlines()):
                        line = line.strip()
                        if line.startswith("{") and line.endswith("}"):
                            try:
                                metadata = json.loads(line)
                                break
                            except json.JSONDecodeError:
                                continue

                    audio_candidates = [
                        p for p in os.listdir(temp_dir)
                        if os.path.isfile(os.path.join(temp_dir, p))
                        and not p.endswith(".part")
                        and not p.endswith(".ytdl")
                        and os.path.splitext(p)[1].lower() in {".m4a", ".webm", ".mp3", ".wav", ".ogg", ".opus", ".mp4"}
                    ]

                    if not audio_candidates:
                        final_error = "Downloaded audio file not found"
                        final_error_code = "missing_output"
                        continue

                    audio_candidates.sort(
                        key=lambda name: os.path.getmtime(os.path.join(temp_dir, name)),
                        reverse=True
                    )
                    audio_path = os.path.join(temp_dir, audio_candidates[0])

                    video_id = metadata.get("id") or self.youtube_service.extract_video_id(url)
                    return {
                        "success": True,
                        "audio_path": audio_path,
                        "temp_dir": temp_dir,
                        "metadata": metadata,
                        "video_id": video_id
                    }

            shutil.rmtree(temp_dir, ignore_errors=True)
            return {"success": False, "error": final_error, "error_code": final_error_code}
        except subprocess.TimeoutExpired:
            shutil.rmtree(temp_dir, ignore_errors=True)
            return {"success": False, "error": "Audio download timed out", "error_code": "timeout"}
        except FileNotFoundError:
            shutil.rmtree(temp_dir, ignore_errors=True)
            return {
                "success": False,
                "error": "yt-dlp not installed. Please install it: pip install yt-dlp",
                "error_code": "missing_binary",
            }
        except Exception as e:
            logger.error(f"YouTube audio download error: {str(e)}", exc_info=True)
            shutil.rmtree(temp_dir, ignore_errors=True)
            return {"success": False, "error": str(e), "error_code": "exception"}
    
    async def transcribe_audio_groq(self, audio_path: str) -> Dict:
        try:
            if not self.groq_client:
                raise ValueError("Groq client not available - check GROQ_API_KEY")
            
            with open(audio_path, "rb") as audio_file:
                transcription = self.groq_client.audio.transcriptions.create(
                    file=audio_file,
                    model="whisper-large-v3",
                    response_format="verbose_json",
                    temperature=0.0
                )
            
            segments = []
            if hasattr(transcription, 'segments'):
                for seg in transcription.segments:
                    segments.append({
                        "start": seg.get('start', 0),
                        "end": seg.get('end', 0),
                        "text": seg.get('text', ''),
                        "confidence": seg.get('confidence', 0.0)
                    })
            
            language = transcription.language if hasattr(transcription, 'language') else 'en'
            
            duration = 0
            if segments:
                duration = int(segments[-1].get("end", 0))
            
            return {
                "success": True,
                "transcript": transcription.text,
                "segments": segments,
                "language": language,
                "duration": duration,
                "has_timestamps": len(segments) > 0
            }
            
        except Exception as e:
            if self._is_groq_quota_error(e):
                raise provider_limit_exhausted("groq") from e
            logger.error(f"Groq transcription error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def analyze_transcript_ai(self, transcript: str, options: Dict = None, user_id: Optional[int] = None) -> Dict:
        try:
            if self.groq_client:
                try:
                    can_call, wait_time = rate_limiter.can_call_groq()
                    if not can_call:
                        logger.warning(f"Groq rate limit reached, waiting {wait_time:.1f} seconds...")
                        await asyncio.sleep(wait_time + 1)
                    
                    options = options or {}
                    subject = options.get('subject', 'general')
                    difficulty = options.get('difficulty', 'intermediate')
                    
                    transcript_sample = transcript[:30000]
                    
                    prompt = f"""Analyze this transcript and provide a comprehensive analysis:

Transcript: {transcript_sample}

Provide a JSON response with:
1. key_concepts: Array of main concepts (max 20)
2. topics: Array of topics covered
3. difficulty_level: beginner/intermediate/advanced
4. estimated_study_time: minutes needed to study this
5. summary: Comprehensive 5-7 sentence summary covering all major points
6. action_items: Things to remember or do
7. questions: 10 study questions covering different sections
8. language: detected language code

Format as valid JSON."""

                    response = await self._create_groq_chat_completion(
                        messages=[
                            {"role": "system", "content": "You are an expert educational content analyzer. Always respond with valid JSON."},
                            {"role": "user", "content": prompt}
                        ],
                        temperature=0.7,
                        max_tokens=4000,
                        estimated_tokens=self._estimate_groq_request_tokens(prompt, 4000),
                        user_id=user_id,
                        usage_extra={"task": "analyze_transcript"},
                    )
                    
                    result_text = response.choices[0].message.content
                    
                    try:
                        if "```json" in result_text:
                            result_text = result_text.split("```json")[1].split("```")[0]
                        elif "```" in result_text:
                            result_text = result_text.split("```")[1].split("```")[0]
                        
                        analysis = json.loads(result_text.strip())
                    except Exception as parse_error:
                        logger.warning(f"JSON parse error: {parse_error}, creating fallback response")
                        analysis = {
                            "key_concepts": self._extract_concepts(transcript),
                            "topics": [subject],
                            "difficulty_level": difficulty,
                            "estimated_study_time": max(10, len(transcript.split()) // 150),
                            "summary": result_text[:500] if result_text else "Content analysis",
                            "action_items": [],
                            "questions": [],
                            "language": "en"
                        }
                    
                    return {
                        "success": True,
                        "analysis": analysis
                    }
                    
                except ApiKeyPoolExhausted:
                    raise
                except Exception as groq_error:
                    error_msg = str(groq_error)
                    if "429" in error_msg or "rate_limit" in error_msg.lower():
                        logger.warning(f"Groq rate limit hit, falling back to Gemini: {error_msg}")
                    else:
                        raise
            
            if self.gemini_client:
                logger.info("Using Gemini as fallback for analysis")
                options = options or {}
                subject = options.get('subject', 'general')
                difficulty = options.get('difficulty', 'intermediate')
                transcript_sample = transcript[:30000]
                
                prompt = f"""Analyze this transcript and provide a comprehensive analysis in JSON format:

Transcript: {transcript_sample}

Provide a JSON response with:
1. key_concepts: Array of main concepts (max 20)
2. topics: Array of topics covered
3. difficulty_level: beginner/intermediate/advanced
4. estimated_study_time: minutes needed to study this
5. summary: Comprehensive 5-7 sentence summary
6. action_items: Things to remember or do
7. questions: 10 study questions
8. language: detected language code"""

                response = self.gemini_client.models.generate_content(model=GEMINI_MODEL_NAME, contents=prompt)
                self._log_gemini_usage(user_id, "media_notes_ai", response, {"task": "analyze_transcript"}, prompt=prompt)
                result_text = response.text
                
                try:
                    if "```json" in result_text:
                        result_text = result_text.split("```json")[1].split("```")[0]
                    elif "```" in result_text:
                        result_text = result_text.split("```")[1].split("```")[0]
                    
                    analysis = json.loads(result_text.strip())
                except:
                    analysis = {
                        "key_concepts": self._extract_concepts(transcript),
                        "topics": [subject],
                        "difficulty_level": difficulty,
                        "estimated_study_time": max(10, len(transcript.split()) // 150),
                        "summary": result_text[:500] if result_text else "Content analysis",
                        "action_items": [],
                        "questions": [],
                        "language": "en"
                    }
                
                return {
                    "success": True,
                    "analysis": analysis
                }
            
            raise ValueError("No AI service available (both Groq and Gemini unavailable)")
            
        except ApiKeyPoolExhausted:
            raise
        except Exception as e:
            logger.error(f"AI analysis error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def generate_notes_ai(self, transcript: str, analysis: Dict, style: str = "detailed", options: Dict = None, user_id: Optional[int] = None) -> Dict:
        try:
            options = options or {}
            difficulty = options.get('difficulty', 'intermediate')
            subject = options.get('subject', 'general')
            custom_instructions = options.get('custom_instructions', '')
            
            word_count = len(transcript.split())
            logger.info(f"Transcript word count: {word_count}, style: {style}, difficulty: {difficulty}")
            
            if word_count > 12000 and style == "detailed":
                logger.info("Using chunked processing for long transcript")
                chunked_result = await self._generate_notes_chunked_groq(transcript, analysis, difficulty, subject, custom_instructions, user_id=user_id)
                if chunked_result.get("success"):
                    return chunked_result
                logger.warning("Chunked Groq notes failed, trying fallback generation: %s", chunked_result.get("error"))
            
            prompt = self._get_style_prompt(style, transcript, analysis, difficulty, subject, custom_instructions, word_count)
            system_prompt = self._get_system_prompt(style)

            groq_error = None
            if self.groq_client:
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        can_call, wait_time = rate_limiter.can_call_groq()
                        if not can_call:
                            logger.warning(f"Groq notes rate limit check: waiting {wait_time:.1f} seconds...")
                            await asyncio.sleep(wait_time + 1)

                        response = await self._create_groq_chat_completion(
                            messages=[
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": prompt}
                            ],
                            temperature=0.7,
                            max_tokens=8000,
                            estimated_tokens=self._estimate_groq_request_tokens(prompt, 8000),
                            user_id=user_id,
                            usage_extra={"task": "generate_notes", "style": style},
                        )

                        html_content = self._strip_code_fences(response.choices[0].message.content)
                        return {
                            "success": True,
                            "content": html_content.strip(),
                            "style": style
                        }
                    except ApiKeyPoolExhausted:
                        raise
                    except Exception as e:
                        groq_error = str(e)
                        is_retryable = "429" in groq_error or "rate" in groq_error.lower() or "timeout" in groq_error.lower()
                        if is_retryable and attempt < max_retries - 1:
                            wait_seconds = (attempt + 1) * 8
                            logger.warning(f"Groq note generation retry {attempt + 1}/{max_retries} after {wait_seconds}s: {groq_error}")
                            await asyncio.sleep(wait_seconds)
                            continue
                        logger.warning(f"Groq note generation failed: {groq_error}")
                        break
            else:
                groq_error = "Groq client not available"

            if self.gemini_client:
                try:
                    can_call, wait_time = rate_limiter.can_call_gemini()
                    if not can_call:
                        logger.warning(f"Gemini notes rate limit check: waiting {wait_time:.1f} seconds...")
                        await asyncio.sleep(wait_time + 1)

                    rate_limiter.record_gemini_call()
                    response = self.gemini_client.models.generate_content(
                        model=GEMINI_MODEL_NAME,
                        contents=f"{system_prompt}\n\n{prompt}",
                    )
                    self._log_gemini_usage(
                        user_id,
                        "media_notes_ai",
                        response,
                        {"task": "generate_notes", "style": style, "fallback": "gemini"},
                        prompt=f"{system_prompt}\n\n{prompt}",
                    )
                    html_content = self._strip_code_fences(response.text)
                    return {
                        "success": True,
                        "content": html_content.strip(),
                        "style": style,
                        "provider": "gemini"
                    }
                except Exception as gemini_error:
                    logger.warning(f"Gemini note generation failed: {str(gemini_error)}")

            logger.warning("Using local media notes fallback after AI generation failed: %s", groq_error)
            return {
                "success": True,
                "content": self._build_fallback_notes_html(transcript, analysis, subject, difficulty),
                "style": style,
                "provider": "local_fallback"
            }
            
        except ApiKeyPoolExhausted:
            raise
        except Exception as e:
            logger.error(f"Note generation error: {str(e)}")
            return {
                "success": True,
                "content": self._build_fallback_notes_html(transcript, analysis or {}, (options or {}).get('subject', 'general'), (options or {}).get('difficulty', 'intermediate')),
                "style": style,
                "provider": "local_fallback",
                "warning": str(e)
            }

    def _strip_code_fences(self, content: str) -> str:
        content = content or ""
        if "```html" in content:
            return content.split("```html", 1)[1].split("```", 1)[0]
        if "```" in content:
            return content.split("```", 1)[1].split("```", 1)[0]
        return content

    def _build_fallback_notes_html(self, transcript: str, analysis: Dict, subject: str, difficulty: str) -> str:
        transcript = transcript or ""
        analysis = analysis or {}
        key_concepts = analysis.get("key_concepts") or self._extract_concepts(transcript)
        summary = analysis.get("summary") or "These notes were generated from the media transcript."
        action_items = analysis.get("action_items") or []
        questions = analysis.get("questions") or []
        words = transcript.split()
        excerpt_words = words[:900]
        excerpt = " ".join(excerpt_words)

        concept_items = "\n".join(
            f"<li><strong>{html.escape(str(concept))}</strong></li>"
            for concept in key_concepts[:12]
        ) or "<li><strong>Main ideas</strong> from the transcript</li>"

        action_items_html = "\n".join(
            f"<li>{html.escape(str(item))}</li>"
            for item in action_items[:8]
        )

        questions_html = "\n".join(
            f"<li>{html.escape(str(question))}</li>"
            for question in questions[:8]
        )

        sections = [
            "<div class=\"lecture-notes media-notes-fallback\">",
            f"<h1>{html.escape(subject.title() if subject else 'Media')} Notes</h1>",
            f"<p><em>Difficulty: {html.escape(difficulty.title() if difficulty else 'Intermediate')} &middot; Transcript length: {len(words)} words</em></p>",
            "<h2>Overview</h2>",
            f"<p>{html.escape(str(summary))}</p>",
            "<h2>Key Concepts</h2>",
            f"<ul>{concept_items}</ul>",
            "<h2>Transcript-Based Notes</h2>",
            f"<p>{html.escape(excerpt)}</p>",
        ]

        if len(words) > len(excerpt_words):
            sections.append("<p><em>The transcript is long; use the full transcript section below for complete context.</em></p>")
        if action_items_html:
            sections.extend(["<h2>Things To Remember</h2>", f"<ul>{action_items_html}</ul>"])
        if questions_html:
            sections.extend(["<h2>Study Questions</h2>", f"<ol>{questions_html}</ol>"])

        sections.extend([
            "<h2>Full Transcript</h2>",
            f"<p>{html.escape(transcript)}</p>",
            "</div>",
        ])
        return "\n".join(sections)
    
    def _get_system_prompt(self, style: str) -> str:
        prompts = {
            "detailed": "You are an expert educational content writer who creates thorough, comprehensive study notes. You never summarize - you always expand and explain concepts in detail.",
            "bullet_points": "You are an expert at creating clear, organized bullet point notes that capture key information in a scannable, easy-to-review format.",
            "mind_map": "You are an expert at creating hierarchical mind maps that show relationships between concepts visually and help students see the big picture.",
            "cornell": "You are an expert at creating Cornell-style notes with cues, notes, and summaries for effective studying and review.",
            "outline": "You are an expert at creating structured outlines that organize information hierarchically for clear understanding.",
            "qa": "You are an expert at creating question-and-answer study materials that help students test their knowledge and prepare for exams.",
            "summary": "You are an expert at creating concise summaries that capture the essential points while remaining clear and comprehensive."
        }
        return prompts.get(style, prompts["detailed"])
    
    def _get_style_prompt(self, style: str, transcript: str, analysis: Dict, difficulty: str, subject: str, custom_instructions: str, word_count: int) -> str:
        
        key_concepts = json.dumps(analysis.get('key_concepts', []))
        
        difficulty_instructions = {
            "beginner": "Use simple language, explain all terms, provide many examples, and avoid jargon.",
            "intermediate": "Balance technical accuracy with clarity, explain complex terms, and provide relevant examples.",
            "advanced": "Use technical terminology, assume prior knowledge, focus on advanced concepts and nuances."
        }
        difficulty_instruction = difficulty_instructions.get(difficulty, difficulty_instructions["intermediate"])
        
        if style == "bullet_points":
            return f"""Create organized BULLET POINT notes from this lecture.

LECTURE DETAILS:
- Subject: {subject}
- Difficulty: {difficulty}
- Transcript Length: {word_count} words
{f'- Special Instructions: {custom_instructions}' if custom_instructions else ''}

DIFFICULTY LEVEL: {difficulty_instruction}

KEY CONCEPTS TO COVER:
{key_concepts}

COMPLETE LECTURE TRANSCRIPT:
{transcript}

CREATE DETAILED BULLET POINT NOTES:

FORMAT REQUIREMENTS:
- Use <h2> for main topics/sections
- Use <h3> for subtopics
- Use <ul> and <li> for bullet points
- Use nested <ul> for sub-bullets (up to 3 levels deep)
- Use <strong> for key terms and important concepts
- Each bullet should be concise but complete (1-2 sentences max)
- Group related points under appropriate headings
- Include 4-6 main sections with 5-10 bullets each

STRUCTURE:
1. <h2>Introduction/Overview</h2> (3-5 bullets summarizing main themes)
2. <h2>Main Topics</h2> (multiple sections with detailed bullets)
3. <h2>Key Takeaways</h2> (5-7 bullets with main points)

IMPORTANT: 
- Base notes ONLY on transcript content
- Adjust complexity for {difficulty} level
- Make bullets scannable and easy to review

Return ONLY HTML content (no markdown code blocks)."""

        elif style == "mind_map":
            return f"""Create a HIERARCHICAL MIND MAP from this lecture.

LECTURE DETAILS:
- Subject: {subject}
- Difficulty: {difficulty}
- Transcript Length: {word_count} words
{f'- Special Instructions: {custom_instructions}' if custom_instructions else ''}

DIFFICULTY LEVEL: {difficulty_instruction}

KEY CONCEPTS TO MAP:
{key_concepts}

COMPLETE LECTURE TRANSCRIPT:
{transcript}

CREATE A MIND MAP STRUCTURE:

FORMAT REQUIREMENTS:
- Use <div class="mind-map"> as container
- Use <h2> for the central topic
- Use <div class="branch"> for main branches (4-6 branches)
- Use <h3> for branch titles
- Use <ul> and <li> for sub-branches
- Use nested <ul> for deeper levels (up to 4 levels)
- Use <strong> for key concepts
- Use <em> for connections/relationships
- Add <span class="connection">→</span> to show relationships between concepts

EXAMPLE STRUCTURE:
<div class="mind-map">
  <h2>Central Topic: {subject}</h2>
  
  <div class="branch">
    <h3>Main Branch 1</h3>
    <ul>
      <li><strong>Sub-concept</strong>
        <ul>
          <li>Detail 1</li>
          <li>Detail 2</li>
        </ul>
      </li>
    </ul>
  </div>
</div>

Create 4-6 main branches with 3-5 sub-concepts each.
Adjust complexity for {difficulty} level.

IMPORTANT: Base mind map ONLY on transcript content.

Return ONLY HTML content (no markdown code blocks)."""

        elif style == "cornell":
            return f"""Create CORNELL-STYLE NOTES from this lecture.

LECTURE DETAILS:
- Subject: {subject}
- Difficulty: {difficulty}
- Transcript Length: {word_count} words
{f'- Special Instructions: {custom_instructions}' if custom_instructions else ''}

DIFFICULTY LEVEL: {difficulty_instruction}

KEY CONCEPTS:
{key_concepts}

COMPLETE LECTURE TRANSCRIPT:
{transcript}

CREATE CORNELL NOTES:

FORMAT REQUIREMENTS:
<div class="cornell-notes">
  <div class="cornell-header">
    <h2>{subject} - Lecture Notes</h2>
    <p>Difficulty: {difficulty.title()}</p>
  </div>
  
  <div class="cornell-row">
    <div class="cue-column">
      <h4>Cues/Questions</h4>
      <ul>
        <li>Key question about the topic?</li>
        <li>Important term to remember?</li>
      </ul>
    </div>
    <div class="notes-column">
      <h3>Topic Name</h3>
      <p>Detailed notes with explanations adjusted for {difficulty} level...</p>
      <ul>
        <li>Supporting point 1</li>
        <li>Supporting point 2</li>
      </ul>
    </div>
  </div>
  
  <div class="cornell-summary">
    <h4>Summary</h4>
    <p>Comprehensive summary of all concepts covered...</p>
  </div>
</div>

STRUCTURE:
1. Create 5-8 cornell-row sections for different topics
2. Cue column (left, 30%): Questions, key terms, prompts for recall
3. Notes column (right, 70%): Detailed explanations adjusted for {difficulty} level
4. Summary (bottom): 2-3 paragraph summary of entire lecture

IMPORTANT: Base notes ONLY on transcript content.

Return ONLY HTML content (no markdown code blocks)."""

        elif style == "outline":
            return f"""Create a STRUCTURED OUTLINE from this lecture.

LECTURE DETAILS:
- Subject: {subject}
- Difficulty: {difficulty}
- Transcript Length: {word_count} words
{f'- Special Instructions: {custom_instructions}' if custom_instructions else ''}

DIFFICULTY LEVEL: {difficulty_instruction}

KEY CONCEPTS:
{key_concepts}

COMPLETE LECTURE TRANSCRIPT:
{transcript}

CREATE A DETAILED OUTLINE:

FORMAT REQUIREMENTS:
- Use <h2> for main sections (I, II, III, etc.)
- Use <h3> for subsections (A, B, C, etc.)
- Use <h4> for sub-subsections (1, 2, 3, etc.)
- Use <ul> and <li> for points under each section
- Use <strong> for key terms
- Include brief explanations (1-2 sentences) for each point
- Adjust complexity for {difficulty} level

EXAMPLE STRUCTURE:
<div class="outline-notes">
  <h1>{subject} - Outline</h1>
  
  <h2>I. Introduction</h2>
  <ul>
    <li><strong>Main Topic:</strong> Brief explanation</li>
  </ul>
  
  <h2>II. Main Topic</h2>
  <h3>A. Subtopic</h3>
  <ul>
    <li><strong>Concept:</strong> Explanation adjusted for {difficulty} level</li>
  </ul>
  <h3>B. Another Subtopic</h3>
  <h4>1. Detail</h4>
  <ul>
    <li>Supporting point</li>
  </ul>
</div>

Create 4-6 main sections with 2-4 subsections each.

IMPORTANT: Base outline ONLY on transcript content.

Return ONLY HTML content (no markdown code blocks)."""

        elif style == "qa":
            return f"""Create QUESTION-AND-ANSWER study notes from this lecture.

LECTURE DETAILS:
- Subject: {subject}
- Difficulty: {difficulty}
- Transcript Length: {word_count} words
{f'- Special Instructions: {custom_instructions}' if custom_instructions else ''}

DIFFICULTY LEVEL: {difficulty_instruction}

KEY CONCEPTS:
{key_concepts}

COMPLETE LECTURE TRANSCRIPT:
{transcript}

CREATE Q&A STUDY NOTES:

FORMAT REQUIREMENTS:
<div class="qa-notes">
  <h1>{subject} - Study Questions</h1>
  
  <h2>Topic 1: [Topic Name]</h2>
  
  <div class="qa-pair">
    <h3 class="question">Q: What is [concept]?</h3>
    <div class="answer">
      <p><strong>A:</strong> Detailed answer adjusted for {difficulty} level...</p>
      <ul>
        <li>Key point 1</li>
        <li>Key point 2</li>
      </ul>
    </div>
  </div>
</div>

QUESTION TYPES TO INCLUDE (adjust difficulty for {difficulty} level):
- What is...? (definitions)
- How does...? (processes/mechanisms)
- Why is...? (reasoning/importance)
- Compare/contrast... (relationships)
- What are the applications of...? (practical use)
- Explain the significance of... (deeper understanding)

Create 15-25 questions total:
- 4-6 topic sections
- 3-5 questions per section
- Mix question types
- Adjust question complexity for {difficulty} level

IMPORTANT: Base Q&A ONLY on transcript content.

Return ONLY HTML content (no markdown code blocks)."""

        elif style == "summary":
            return f"""Create a CONCISE SUMMARY of this lecture.

LECTURE DETAILS:
- Subject: {subject}
- Difficulty: {difficulty}
- Transcript Length: {word_count} words
{f'- Special Instructions: {custom_instructions}' if custom_instructions else ''}

DIFFICULTY LEVEL: {difficulty_instruction}

KEY CONCEPTS:
{key_concepts}

COMPLETE LECTURE TRANSCRIPT:
{transcript}

CREATE A SUMMARY:

FORMAT REQUIREMENTS:
- Use <h2> for main sections
- Use <p> for paragraphs (2-4 sentences each)
- Use <ul> for key points lists
- Use <strong> for important terms
- Keep it concise but comprehensive
- Adjust language for {difficulty} level

STRUCTURE:
1. <h2>Overview</h2> (1-2 paragraphs)
2. <h2>Key Points</h2> (bullet list of 5-8 main points)
3. <h2>Main Takeaways</h2> (1-2 paragraphs)

Target length: 300-500 words

IMPORTANT: Base summary ONLY on transcript content.

Return ONLY HTML content (no markdown code blocks)."""

        else:
            return f"""You are an expert professor creating comprehensive lecture notes for students.

LECTURE DETAILS:
- Subject: {subject}
- Difficulty: {difficulty}
- Transcript Length: {word_count} words
{f'- Special Instructions: {custom_instructions}' if custom_instructions else ''}

DIFFICULTY LEVEL: {difficulty_instruction}

YOUR TASK:
Create EXTREMELY DETAILED study notes that cover EVERY important point from this lecture.
Your notes should be AT LEAST 2500-3500 words and include:

1. COMPREHENSIVE COVERAGE: Don't skip any major topics or concepts
2. DETAILED EXPLANATIONS: Explain each concept thoroughly (4-6 sentences per concept)
3. EXAMPLES & CONTEXT: Provide examples, analogies, and real-world applications
4. STRUCTURED FORMAT: Use clear sections and subsections
5. KEY TERMS: Highlight and define important terminology
6. CONNECTIONS: Show how concepts relate to each other
7. DIFFICULTY ADJUSTMENT: {difficulty_instruction}

KEY CONCEPTS TO ELABORATE ON:
{key_concepts}

COMPLETE LECTURE TRANSCRIPT:
{transcript}

IMPORTANT INSTRUCTIONS:
1. Base your notes ONLY on the content from the transcript above
2. Do NOT add information that wasn't mentioned in the lecture
3. Organize and explain what the lecturer actually said
4. You can rephrase for clarity, but stay true to the source material
5. If the lecturer gives examples, include them
6. If concepts are explained in the video, use those explanations
7. Adjust complexity and explanations for {difficulty} level

FORMAT YOUR NOTES AS HTML:
- Use <h2> for main sections (e.g., "Introduction", "Core Concepts", "Applications")
- Use <h3> for major topics within sections
- Use <h4> for subtopics and specific concepts
- Use <strong> for key terms and important points
- Use <ul> or <ol> for lists
- Use <p> for explanatory paragraphs (write MULTIPLE paragraphs per concept)
- Use <blockquote> for important quotes or key takeaways
- Use <em> for emphasis

CRITICAL: Make these notes COMPREHENSIVE and DETAILED. Students should be able to study from these notes alone. Do NOT just summarize - EXPAND and EXPLAIN thoroughly.

Return ONLY the HTML content (no markdown code blocks, no ```html tags)."""
    
    async def _generate_notes_chunked_groq(self, transcript: str, analysis: Dict, difficulty: str, subject: str, custom_instructions: str, user_id: Optional[int] = None) -> Dict:
        try:
            words = transcript.split()
            chunk_size = 10000
            chunks = []
            
            for i in range(0, len(words), chunk_size):
                chunk = ' '.join(words[i:i + chunk_size])
                chunks.append(chunk)
            
            logger.info(f"Processing {len(chunks)} chunks with Groq (rate limit: 30 req/min)")
            
            all_notes = []
            for idx, chunk in enumerate(chunks):
                logger.info(f"Processing chunk {idx + 1}/{len(chunks)}")
                
                if idx > 0:
                    logger.info("Waiting 3 seconds to avoid rate limits...")
                    await asyncio.sleep(3)
                
                prompt = f"""Create comprehensive study notes for PART {idx + 1} of {len(chunks)} of a lecture.

Subject: {subject}
Difficulty: {difficulty}
Key Concepts: {json.dumps(analysis.get('key_concepts', []))}

LECTURE CONTENT (Part {idx + 1}/{len(chunks)}):
{chunk}

IMPORTANT: Base your notes ONLY on the content from this transcript section. Do NOT add information that wasn't mentioned. Organize and explain what was actually said in the lecture.

Create DETAILED HTML notes for this section:
- Use <h3> for main topics
- Use <h4> for subtopics  
- Write thorough explanations (4-6 sentences per concept)
- Include examples and context
- Use <strong> for key terms
- Use <ul>/<ol> for lists
- Use <p> for detailed paragraphs

Make this comprehensive - students should understand the material from your notes alone.

Return ONLY HTML content (no markdown)."""

                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        can_call, wait_time = rate_limiter.can_call_groq()
                        if not can_call:
                            logger.warning(f"Rate limit check: waiting {wait_time:.1f} seconds...")
                            await asyncio.sleep(wait_time + 1)
                        
                        response = await self._create_groq_chat_completion(
                            messages=[
                                {"role": "system", "content": "You are an expert educational content writer creating detailed study notes."},
                                {"role": "user", "content": prompt}
                            ],
                            temperature=0.7,
                            max_tokens=8000,
                            estimated_tokens=self._estimate_groq_request_tokens(prompt, 8000),
                            user_id=user_id,
                            usage_extra={"task": "generate_notes_chunk", "chunk": idx + 1},
                        )
                        
                        all_notes.append(response.choices[0].message.content)
                        break
                        
                    except ApiKeyPoolExhausted:
                        raise
                    except Exception as e:
                        if "429" in str(e) or "rate" in str(e).lower():
                            if attempt < max_retries - 1:
                                wait_time = (attempt + 1) * 10
                                logger.warning(f"Rate limit hit, waiting {wait_time} seconds...")
                                await asyncio.sleep(wait_time)
                            else:
                                raise Exception("Groq rate limit exceeded. Please wait 1 minute and try again.")
                        else:
                            raise
            
            combined_html = f"""<div class="lecture-notes">
<h1>{subject} - Comprehensive Lecture Notes</h1>
<p><em>Generated from {len(words)}-word lecture transcript</em></p>
"""
            
            for idx, note_html in enumerate(all_notes):
                if "```html" in note_html:
                    note_html = note_html.split("```html")[1].split("```")[0]
                elif "```" in note_html:
                    note_html = note_html.split("```")[1].split("```")[0]
                
                combined_html += f"""
<section class="lecture-section">
<h2>Part {idx + 1} of {len(chunks)}</h2>
{note_html}
</section>
"""
            
            combined_html += "</div>"
            
            return {
                "success": True,
                "content": combined_html.strip(),
                "style": "detailed",
                "chunks_processed": len(chunks)
            }
            
        except ApiKeyPoolExhausted:
            raise
        except Exception as e:
            logger.error(f"Chunked note generation error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def generate_flashcards_ai(self, transcript: str, analysis: Dict, count: int = 10, user_id: Optional[int] = None) -> Dict:
        try:
            if not self.groq_client:
                raise ValueError("Groq client not available")
            
            prompt = f"""Generate {count} flashcards from this content.

Key Concepts: {json.dumps(analysis.get('key_concepts', []))}

Content: {transcript[:5000]}

Create flashcards as JSON array:
[
  {{"question": "...", "answer": "...", "difficulty": "easy/medium/hard"}},
  ...
]

Return ONLY valid JSON array."""

            response = self.groq_client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[
                    {"role": "system", "content": "You are an expert at creating educational flashcards. Always respond with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=2000
            )
            self._log_groq_usage(user_id, "flashcards_ai", response, {"task": "media_flashcards"}, prompt=prompt)
            
            result_text = response.choices[0].message.content
            
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0]
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0]
            
            flashcards = json.loads(result_text.strip())
            
            return {
                "success": True,
                "flashcards": flashcards[:count]
            }
            
        except Exception as e:
            if self._is_groq_quota_error(e):
                raise provider_limit_exhausted("groq") from e
            logger.error(f"Flashcard generation error: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "flashcards": []
            }
    
    async def generate_quiz_ai(self, transcript: str, analysis: Dict, count: int = 10, user_id: Optional[int] = None) -> Dict:
        try:
            if not self.groq_client:
                raise ValueError("Groq client not available")
            
            prompt = f"""Generate {count} multiple-choice quiz questions from this content.

Key Concepts: {json.dumps(analysis.get('key_concepts', []))}

Content: {transcript[:5000]}

CRITICAL: Each option MUST contain the FULL ANSWER TEXT, not just letter labels like "A", "B", "C", "D".

Create questions as JSON array:
[
  {{
    "question": "...",
    "options": ["First option with full answer text", "Second option with full answer text", "Third option with full answer text", "Fourth option with full answer text"],
    "correct_answer": 0,
    "explanation": "...",
    "difficulty": "easy/medium/hard"
  }},
  ...
]

Return ONLY valid JSON array."""

            response = self.groq_client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[
                    {"role": "system", "content": "You are an expert at creating educational quiz questions. Always respond with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=3000
            )
            self._log_groq_usage(user_id, "quiz_ai", response, {"task": "media_quiz"}, prompt=prompt)
            
            result_text = response.choices[0].message.content
            
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0]
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0]
            
            questions = json.loads(result_text.strip())
            
            return {
                "success": True,
                "questions": questions[:count]
            }
            
        except Exception as e:
            if self._is_groq_quota_error(e):
                raise provider_limit_exhausted("groq") from e
            logger.error(f"Quiz generation error: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "questions": []
            }
    
    async def extract_key_moments(self, segments: List[Dict], analysis: Dict) -> List[Dict]:
        try:
            key_concepts = analysis.get('key_concepts', [])
            key_moments = []
            
            for segment in segments:
                text = segment.get('text', '').lower()
                importance = 0
                
                for concept in key_concepts:
                    if concept.lower() in text:
                        importance += 1
                
                important_phrases = ['important', 'key point', 'remember', 'crucial', 'essential', 'main idea']
                for phrase in important_phrases:
                    if phrase in text:
                        importance += 2
                
                if importance > 0:
                    key_moments.append({
                        "timestamp": segment.get('start', 0),
                        "text": segment.get('text', ''),
                        "importance": importance
                    })
            
            key_moments.sort(key=lambda x: x['importance'], reverse=True)
            return key_moments[:10]
            
        except Exception as e:
            logger.error(f"Key moments extraction error: {str(e)}")
            return []
    
    def _extract_concepts(self, text: str, max_concepts: int = 10) -> List[str]:
        words = text.split()
        concepts = [w for w in words if len(w) > 3 and w[0].isupper()]
        concepts = list(set(concepts))[:max_concepts]
        return concepts
    
    async def convert_audio_format(self, input_path: str, output_format: str = "mp3") -> str:
        try:
            if not PYDUB_AVAILABLE:
                logger.warning("pydub not available for audio conversion")
                return input_path
            
            audio = AudioSegment.from_file(input_path)
            output_path = input_path.rsplit('.', 1)[0] + f'.{output_format}'
            audio.export(output_path, format=output_format)
            return output_path
        except Exception as e:
            logger.error(f"Audio conversion error: {str(e)}")
            return input_path
    
    def estimate_processing_cost(self, duration_seconds: int, file_size_mb: float) -> Dict:
        return {
            "transcription_cost": 0.0,
            "ai_analysis_cost": 0.0,
            "total_cost": 0.0,
            "note": "Using free tier APIs"
        }
    
    def get_language_name(self, language_code: str) -> str:
        try:
            if pycountry:
                lang = pycountry.languages.get(alpha_2=language_code)
                return lang.name if lang else language_code
            return language_code
        except:
            return language_code

ai_media_processor = AIMediaProcessor()
