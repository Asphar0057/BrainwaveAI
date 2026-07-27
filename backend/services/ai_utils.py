import base64
import logging
import json
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests
from activity_context import get_activity_context
from activity_logger import log_ai_tokens
from services.ai_usage import (
    estimate_usage,
    extract_usage_from_openai_like,
    extract_usage_from_gemini_payload,
)
from services.api_key_pool import ApiKeyPool, ApiKeyPoolExhausted

logger = logging.getLogger(__name__)

class NoVisionProviderError(Exception):
    pass

class UnifiedAIClient:

    def __init__(
        self,
        gemini_client=None,
        groq_client=None,
        gemini_model: str = "gemini-2.0-flash",
        groq_model: str = "llama-3.3-70b-versatile",
        gemini_api_key: str = None,
        gemini_key_pool: ApiKeyPool = None,
        groq_key_pool: ApiKeyPool = None,
        openai_compat_api_key: str = None,
        openai_compat_key_pool: ApiKeyPool = None,
        openai_compat_base_url: str = "https://api.openai.com/v1",
        openai_compat_model: str = "gpt-4o-mini",
        groq_vision_model: str = "meta-llama/llama-4-scout-17b-16e-instruct",
        fallback_ai_client=None,
    ):
        self.gemini_module = gemini_client
        self.groq_client = groq_client
        self.gemini_model = gemini_model
        self.groq_model = groq_model
        self.gemini_api_key = gemini_api_key
        self.gemini_key_pool = gemini_key_pool
        self.groq_key_pool = groq_key_pool
        self.openai_compat_api_key = openai_compat_api_key
        self.openai_compat_key_pool = openai_compat_key_pool
        self.openai_compat_base_url = openai_compat_base_url.rstrip("/")
        self.openai_compat_model = openai_compat_model
        self.openai_compat_timeout_seconds = self._env_int(
            "OPENAI_COMPAT_TIMEOUT_SECONDS",
            self._env_int("HS_AI_TIMEOUT_SECONDS", 25, 5, 120),
            5,
            120,
        )
        self.openai_compat_max_attempts = self._env_int(
            "OPENAI_COMPAT_MAX_ATTEMPTS",
            self._env_int("HS_AI_MAX_ATTEMPTS", 1, 1, 3),
            1,
            3,
        )
        self.groq_vision_model = groq_vision_model
        self.fallback_ai_client = fallback_ai_client

        # Note: self.gemini_client (a google-genai Client) is only used here as an
        # "is Gemini configured" signal for the primary_ai branch above/below --
        # actual Gemini generation goes through the raw REST calls in
        # _call_gemini/_call_gemini_vision, not the SDK's own generate_content.
        if (openai_compat_api_key or self._has_pool(openai_compat_key_pool)) and not gemini_client and not groq_client and not self._has_pool(gemini_key_pool) and not self._has_pool(groq_key_pool):
            self.gemini_client = None
            self.primary_ai = "openai_compat"
        elif groq_client or self._has_pool(groq_key_pool):
            self.gemini_client = gemini_client
            self.primary_ai = "groq"
        elif gemini_client or self._has_pool(gemini_key_pool):
            self.gemini_client = gemini_client
            self.primary_ai = "gemini"
        else:
            raise ValueError("At least one AI client (Gemini, Groq, or OpenAI-compat) must be provided")

    @staticmethod
    def _has_pool(pool: ApiKeyPool = None) -> bool:
        return bool(pool and pool.enabled)

    @staticmethod
    def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
        try:
            value = int(os.getenv(name, str(default)) or default)
        except (TypeError, ValueError):
            value = default
        return max(minimum, min(value, maximum))

    def generate(
        self,
        prompt: str,
        max_tokens: int = 2000,
        temperature: float = 0.7,
        use_cache: bool = False,
        conversation_id: str = None,
    ) -> str:
        try:
            if self.primary_ai == "openai_compat" and (self.openai_compat_api_key or self._has_pool(self.openai_compat_key_pool)):
                return self._call_openai_compat(prompt, max_tokens, temperature)
            elif self.primary_ai == "gemini" and (self.gemini_api_key or self._has_pool(self.gemini_key_pool)):
                return self._call_gemini(prompt, max_tokens, temperature)
            elif self.groq_client or self._has_pool(self.groq_key_pool):
                return self._call_groq(prompt, max_tokens, temperature)
            else:
                raise Exception("No AI client available")
        except ApiKeyPoolExhausted as e:
            logger.error(f"Primary AI ({self.primary_ai}) quota exhausted: {e}")
            try:
                return self._fallback(prompt, max_tokens, temperature)
            except ApiKeyPoolExhausted:
                raise
            except Exception:
                raise e
        except Exception as e:
            logger.error(f"Primary AI ({self.primary_ai}) failed: {e}")
            return self._fallback(prompt, max_tokens, temperature)

    def _call_gemini(self, prompt: str, max_tokens: int, temperature: float) -> str:
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        for _ in range(self._pool_attempts(self.gemini_key_pool)):
            lease = None
            try:
                lease, api_key = self._reserve_key(self.gemini_key_pool, self.gemini_api_key, prompt, max_tokens)
                url = (
                    f"https://generativelanguage.googleapis.com/v1beta/models/"
                    f"{self.gemini_model}:generateContent?key={api_key}"
                )
                for attempt in range(3):
                    try:
                        resp = requests.post(url, json=payload, timeout=60)
                        if resp.status_code == 200:
                            data = resp.json()
                            usage = extract_usage_from_gemini_payload(data)
                            self._record_key_success(self.gemini_key_pool, lease, usage)
                            if "candidates" in data and data["candidates"]:
                                text = data["candidates"][0]["content"]["parts"][0]["text"]
                                self._log_usage(usage, model=self.gemini_model, provider="gemini", prompt=prompt, completion=text)
                                return text
                            raise Exception("Gemini response has no candidates")
                        if resp.status_code == 429 or (resp.status_code == 400 and "quota" in resp.text.lower()):
                            if not lease:
                                raise self._provider_limit_error("gemini")
                            self._mark_key_exhausted(self.gemini_key_pool, lease)
                            break
                        if attempt == 2:
                            self._release_key(self.gemini_key_pool, lease)
                            raise Exception(f"Gemini API error: {resp.status_code}")
                        time.sleep(1)
                    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
                        if attempt == 2:
                            self._release_key(self.gemini_key_pool, lease)
                            raise
                        time.sleep(2)
            except ApiKeyPoolExhausted:
                raise
        raise Exception("Gemini request failed after all configured keys were exhausted")

    def _call_groq(self, prompt: str, max_tokens: int, temperature: float) -> str:
        for _ in range(self._pool_attempts(self.groq_key_pool)):
            lease = None
            try:
                client = self.groq_client
                if self._has_pool(self.groq_key_pool):
                    lease, api_key = self._reserve_key(self.groq_key_pool, None, prompt, max_tokens)
                    from groq import Groq
                    client = Groq(api_key=api_key)
                resp = client.chat.completions.create(
                    model=self.groq_model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                usage = extract_usage_from_openai_like(resp)
                self._record_key_success(self.groq_key_pool, lease, usage)
                text = resp.choices[0].message.content.strip()
                self._log_usage(usage, model=self.groq_model, provider="groq", prompt=prompt, completion=text)
                return text
            except Exception as exc:
                if self._is_quota_error(exc) and lease:
                    self._mark_key_exhausted(self.groq_key_pool, lease)
                    continue
                if self._is_quota_error(exc):
                    raise self._provider_limit_error("groq") from exc
                self._release_key(self.groq_key_pool, lease)
                raise
        raise Exception("Groq request failed after all configured keys were exhausted")

    def _call_openai_compat(self, prompt: str, max_tokens: int, temperature: float) -> str:
        url = f"{self.openai_compat_base_url}/chat/completions"
        payload = {
            "model": self.openai_compat_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        for _ in range(self._pool_attempts(self.openai_compat_key_pool)):
            lease = None
            try:
                lease, api_key = self._reserve_key(
                    self.openai_compat_key_pool,
                    self.openai_compat_api_key,
                    prompt,
                    max_tokens,
                )
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                }
                for attempt in range(self.openai_compat_max_attempts):
                    try:
                        started = time.perf_counter()
                        resp = requests.post(
                            url,
                            json=payload,
                            headers=headers,
                            timeout=self.openai_compat_timeout_seconds,
                        )
                        elapsed = time.perf_counter() - started
                        if resp.status_code == 200:
                            data = resp.json()
                            usage = extract_usage_from_openai_like(data)
                            self._record_key_success(self.openai_compat_key_pool, lease, usage)
                            text = data["choices"][0]["message"]["content"].strip()
                            logger.info(
                                "OpenAI-compatible AI completed provider=hs_context "
                                "model=%s elapsed=%.2fs prompt_chars=%s max_tokens=%s",
                                self.openai_compat_model,
                                elapsed,
                                len(prompt or ""),
                                max_tokens,
                            )
                            self._log_usage(usage, model=self.openai_compat_model, provider="hs_context", prompt=prompt, completion=text)
                            return text
                        if resp.status_code == 429:
                            if not lease:
                                raise self._provider_limit_error("hs_context")
                            self._mark_key_exhausted(self.openai_compat_key_pool, lease)
                            break
                        self._release_key(self.openai_compat_key_pool, lease)
                        raise Exception(f"HS context AI error {resp.status_code}: {resp.text[:200]}")
                    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
                        is_last_attempt = attempt >= self.openai_compat_max_attempts - 1
                        logger.warning(
                            "OpenAI-compatible AI attempt failed provider=hs_context "
                            "attempt=%s/%s timeout=%ss error=%s",
                            attempt + 1,
                            self.openai_compat_max_attempts,
                            self.openai_compat_timeout_seconds,
                            exc,
                        )
                        if is_last_attempt:
                            self._release_key(self.openai_compat_key_pool, lease)
                            raise
                        time.sleep(2)
            except ApiKeyPoolExhausted:
                raise
        raise Exception("HS context AI request failed after all configured keys were exhausted")

    def _fallback(self, prompt: str, max_tokens: int, temperature: float) -> str:
        if self.fallback_ai_client is not None and self.fallback_ai_client is not self:
            return self.fallback_ai_client.generate(prompt, max_tokens, temperature)
        if self.primary_ai == "openai_compat":
            if self.gemini_api_key or self._has_pool(self.gemini_key_pool):
                return self._call_gemini(prompt, max_tokens, temperature)
            if self.groq_client or self._has_pool(self.groq_key_pool):
                return self._call_groq(prompt, max_tokens, temperature)
        if self.primary_ai == "gemini" and (self.groq_client or self._has_pool(self.groq_key_pool)):
            return self._call_groq(prompt, max_tokens, temperature)
        if self.primary_ai == "groq" and (self.gemini_api_key or self._has_pool(self.gemini_key_pool)):
            return self._call_gemini(prompt, max_tokens, temperature)
        raise Exception("No fallback AI client available")

    def _reserve_key(
        self,
        pool: ApiKeyPool,
        fallback_key: str,
        prompt: str,
        max_tokens: int,
    ):
        if self._has_pool(pool):
            lease = pool.reserve(self._estimate_tokens(prompt, max_tokens))
            return lease, lease.token
        if fallback_key:
            return None, fallback_key
        raise ApiKeyPoolExhausted("No API key is configured")

    def _record_key_success(self, pool: ApiKeyPool, lease, usage) -> None:
        if self._has_pool(pool) and lease:
            pool.record_success(lease, (usage or {}).get("total_tokens"))

    def _release_key(self, pool: ApiKeyPool, lease) -> None:
        if self._has_pool(pool) and lease:
            pool.release(lease)

    def _mark_key_exhausted(self, pool: ApiKeyPool, lease) -> None:
        if self._has_pool(pool) and lease:
            pool.release(lease)
            pool.mark_exhausted(lease)

    def _pool_attempts(self, pool: ApiKeyPool) -> int:
        if self._has_pool(pool):
            return max(1, len(pool.entries))
        return 1

    def _estimate_tokens(self, prompt: str, max_tokens: int) -> int:
        return max(1, (len(prompt or "") // 4) + int(max_tokens or 0))

    def _is_quota_error(self, exc: Exception) -> bool:
        text = str(exc).lower()
        return "429" in text or "quota" in text or "rate limit" in text or "rate_limit" in text

    def _provider_limit_error(self, provider: str) -> ApiKeyPoolExhausted:
        reset_at = self._next_utc_midnight()
        return ApiKeyPoolExhausted(
            f"{provider} API usage limit exhausted",
            provider=provider,
            reset_at=reset_at,
            reset_after_seconds=self._seconds_until(reset_at),
        )

    @staticmethod
    def _next_utc_midnight() -> str:
        now = datetime.now(timezone.utc)
        tomorrow = (now + timedelta(days=1)).date()
        return datetime(tomorrow.year, tomorrow.month, tomorrow.day, tzinfo=timezone.utc).isoformat()

    @staticmethod
    def _seconds_until(reset_at: str) -> int:
        target = datetime.fromisoformat(str(reset_at).replace("Z", "+00:00"))
        if target.tzinfo is None:
            target = target.replace(tzinfo=timezone.utc)
        return max(0, int((target.astimezone(timezone.utc) - datetime.now(timezone.utc)).total_seconds()))

    def generate_with_images(
        self,
        prompt: str,
        images: list[dict],
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> str:
        if not images:
            return self.generate(prompt, max_tokens, temperature)

        errors: list[str] = []
        usage_limit_error: ApiKeyPoolExhausted | None = None
        if self.gemini_api_key or self._has_pool(self.gemini_key_pool):
            try:
                return self._call_gemini_vision(prompt, images, max_tokens, temperature)
            except ApiKeyPoolExhausted as e:
                usage_limit_error = e
                errors.append(f"Gemini: {e}")
                logger.warning(f"Gemini vision quota exhausted: {e}")
            except Exception as e:
                errors.append(f"Gemini: {e}")
                logger.warning(f"Gemini vision failed: {e}")

        if self.groq_client or self._has_pool(self.groq_key_pool):
            try:
                return self._call_groq_vision(prompt, images, max_tokens, temperature)
            except ApiKeyPoolExhausted as e:
                usage_limit_error = e
                errors.append(f"Groq: {e}")
                logger.warning(f"Groq vision quota exhausted: {e}")
            except Exception as e:
                errors.append(f"Groq: {e}")
                logger.warning(f"Groq vision failed: {e}")

        if self.primary_ai == "openai_compat" and (self.openai_compat_api_key or self._has_pool(self.openai_compat_key_pool)):
            try:
                return self._call_openai_compat_vision(prompt, images, max_tokens, temperature)
            except ApiKeyPoolExhausted as e:
                usage_limit_error = e
                errors.append(f"OpenAI-compatible: {e}")
                logger.warning(f"OpenAI-compat vision quota exhausted: {e}")
            except Exception as e:
                errors.append(f"OpenAI-compatible: {e}")
                logger.warning(f"OpenAI-compat vision failed: {e}")

        if usage_limit_error:
            raise usage_limit_error

        detail = "; ".join(errors) if errors else "No vision-capable AI provider is configured"
        raise NoVisionProviderError(detail)

    def _call_groq_vision(
        self,
        prompt: str,
        images: list[dict],
        max_tokens: int,
        temperature: float,
    ) -> str:
        content: list[dict] = [{"type": "text", "text": prompt}]
        for img in images[:5]:
            b64 = base64.b64encode(img["data"]).decode("utf-8")
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{img['mime_type']};base64,{b64}",
                },
            })

        for _ in range(self._pool_attempts(self.groq_key_pool)):
            lease = None
            try:
                client = self.groq_client
                if self._has_pool(self.groq_key_pool):
                    lease, api_key = self._reserve_key(
                        self.groq_key_pool,
                        None,
                        prompt,
                        max_tokens,
                    )
                    from groq import Groq
                    client = Groq(api_key=api_key)
                if client is None:
                    raise NoVisionProviderError("No Groq client is configured")

                response = client.chat.completions.create(
                    model=self.groq_vision_model,
                    messages=[{"role": "user", "content": content}],
                    temperature=temperature,
                    max_completion_tokens=max_tokens,
                )
                usage = extract_usage_from_openai_like(response)
                self._record_key_success(self.groq_key_pool, lease, usage)
                text = (response.choices[0].message.content or "").strip()
                if not text:
                    raise RuntimeError("Groq vision response was empty")
                self._log_usage(
                    usage,
                    model=self.groq_vision_model,
                    provider="groq_vision",
                    prompt=prompt,
                    completion=text,
                )
                return text
            except Exception as exc:
                if self._is_quota_error(exc) and lease:
                    self._mark_key_exhausted(self.groq_key_pool, lease)
                    continue
                if self._is_quota_error(exc):
                    raise self._provider_limit_error("groq") from exc
                self._release_key(self.groq_key_pool, lease)
                raise

        raise RuntimeError("Groq vision request failed after all configured keys were exhausted")

    def _call_gemini_vision(
        self,
        prompt: str,
        images: list[dict],
        max_tokens: int,
        temperature: float,
    ) -> str:
        parts: list = [{"text": prompt}]
        for img in images:
            parts.append({
                "inlineData": {
                    "mimeType": img["mime_type"],
                    "data": base64.b64encode(img["data"]).decode("utf-8"),
                }
            })
        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        for _ in range(self._pool_attempts(self.gemini_key_pool)):
            lease = None
            try:
                lease, api_key = self._reserve_key(self.gemini_key_pool, self.gemini_api_key, prompt, max_tokens)
                url = (
                    f"https://generativelanguage.googleapis.com/v1beta/models/"
                    f"{self.gemini_model}:generateContent?key={api_key}"
                )
                for attempt in range(3):
                    try:
                        resp = requests.post(url, json=payload, timeout=90)
                        if resp.status_code == 200:
                            data = resp.json()
                            usage = extract_usage_from_gemini_payload(data)
                            self._record_key_success(self.gemini_key_pool, lease, usage)
                            if "candidates" in data and data["candidates"]:
                                text = data["candidates"][0]["content"]["parts"][0]["text"]
                                self._log_usage(usage, model=self.gemini_model, provider="gemini_vision", prompt=prompt, completion=text)
                                return text
                            raise Exception("Gemini vision response has no candidates")
                        if resp.status_code == 429 or "quota" in resp.text.lower():
                            if not lease:
                                raise self._provider_limit_error("gemini")
                            self._mark_key_exhausted(self.gemini_key_pool, lease)
                            break
                        if attempt == 2:
                            self._release_key(self.gemini_key_pool, lease)
                            raise Exception(f"Gemini vision API error: {resp.status_code} — {resp.text[:200]}")
                        time.sleep(1)
                    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
                        if attempt == 2:
                            self._release_key(self.gemini_key_pool, lease)
                            raise
                        time.sleep(2)
            except ApiKeyPoolExhausted:
                raise
        raise Exception("Gemini vision request failed after all configured keys were exhausted")

    def _call_openai_compat_vision(
        self,
        prompt: str,
        images: list[dict],
        max_tokens: int,
        temperature: float,
    ) -> str:
        url = f"{self.openai_compat_base_url}/chat/completions"
        content: list = [{"type": "text", "text": prompt}]
        for img in images:
            b64 = base64.b64encode(img["data"]).decode("utf-8")
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:{img['mime_type']};base64,{b64}", "detail": "high"},
            })
        payload = {
            "model": self.openai_compat_model,
            "messages": [{"role": "user", "content": content}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        for _ in range(self._pool_attempts(self.openai_compat_key_pool)):
            lease = None
            try:
                lease, api_key = self._reserve_key(
                    self.openai_compat_key_pool,
                    self.openai_compat_api_key,
                    prompt,
                    max_tokens,
                )
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                }
                for attempt in range(3):
                    try:
                        resp = requests.post(url, json=payload, headers=headers, timeout=120)
                        if resp.status_code == 200:
                            data = resp.json()
                            usage = extract_usage_from_openai_like(data)
                            self._record_key_success(self.openai_compat_key_pool, lease, usage)
                            text = data["choices"][0]["message"]["content"].strip()
                            self._log_usage(usage, model=self.openai_compat_model, provider="openai_vision", prompt=prompt, completion=text)
                            return text
                        if resp.status_code == 429:
                            if not lease:
                                raise self._provider_limit_error("openai")
                            self._mark_key_exhausted(self.openai_compat_key_pool, lease)
                            break
                        self._release_key(self.openai_compat_key_pool, lease)
                        raise Exception(f"OpenAI vision error {resp.status_code}: {resp.text[:200]}")
                    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
                        if attempt == 2:
                            self._release_key(self.openai_compat_key_pool, lease)
                            raise
                        time.sleep(2)
            except ApiKeyPoolExhausted:
                raise
        raise Exception("OpenAI vision request failed after all configured keys were exhausted")

    def generate_stream(self, prompt: str, max_tokens: int = 2000, temperature: float = 0.7):
        if self.groq_client:
            try:
                stream = self.groq_client.chat.completions.create(
                    model=self.groq_model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=temperature,
                    max_tokens=max_tokens,
                    stream=True,
                )
                for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
                return
            except Exception:
                pass

        if self.gemini_api_key:
            full = self.generate(prompt, max_tokens, temperature)
            words = full.split(" ")
            for i, word in enumerate(words):
                yield word + (" " if i < len(words) - 1 else "")
            return

        raise Exception("No AI client available for streaming")

    def _log_usage(self, usage, model: str, provider: str, prompt: str = "", completion: str = ""):
        token_source = "model_usage" if usage else "estimated"
        usage = usage or estimate_usage(prompt, completion)
        try:
            ctx = get_activity_context()
            if not ctx:
                return
            total_tokens = int(usage.get("total_tokens", 0) or 0)
            if total_tokens <= 0:
                return
            log_ai_tokens(
                user_id=ctx.get("user_id"),
                tool_name=ctx.get("tool_name", "ai_unknown"),
                prompt_tokens=usage.get("prompt_tokens", 0),
                completion_tokens=usage.get("completion_tokens", 0),
                total_tokens=total_tokens,
                model=model,
                metadata={
                    "provider": provider,
                    "endpoint": ctx.get("endpoint"),
                    "method": ctx.get("method"),
                    "source_action": ctx.get("action"),
                    "token_source": token_source,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to log AI usage: {e}")
