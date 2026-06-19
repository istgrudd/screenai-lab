"""DeepSeek V4 LLM client wrapper (OpenAI-compatible).

Provides structured JSON output with retry logic for the
recruitment screening pipeline.
"""

import asyncio
import json
import logging
import time

from openai import AsyncOpenAI, OpenAI

from backend.config import settings

logger = logging.getLogger(__name__)

# Explicit client limits. The OpenAI SDK defaults to a 600 s timeout with 2
# internal retries; combined with the app-level retry loops below, a single
# slow/failing DeepSeek call could pin a request for many minutes. SDK
# retries stay at 0 because call_llm / call_llm_async / call_khs_llm_parser
# already implement their own 3-attempt backoff.
LLM_TIMEOUT_SECONDS = 90.0
LLM_MAX_RETRIES = 0

# Module-level singleton
_client: OpenAI | None = None
_async_client: AsyncOpenAI | None = None


class EmptyLLMResponseError(ValueError):
    """Raised when the LLM returns empty / whitespace-only content.

    Distinct from a JSON error so callers can record a precise
    ``processing_error`` instead of a generic parse failure.
    """


class LLMJsonError(ValueError):
    """Raised when the LLM response cannot be parsed as a JSON object."""


def get_llm_client() -> OpenAI:
    """Return the OpenAI-compatible client for DeepSeek V4."""
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
            timeout=LLM_TIMEOUT_SECONDS,
            max_retries=LLM_MAX_RETRIES,
        )
    return _client


def get_async_llm_client() -> AsyncOpenAI:
    """Return the async OpenAI-compatible client for DeepSeek V4."""
    global _async_client
    if _async_client is None:
        _async_client = AsyncOpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
            timeout=LLM_TIMEOUT_SECONDS,
            max_retries=LLM_MAX_RETRIES,
        )
    return _async_client


def call_llm(
    system_prompt: str,
    user_prompt: str,
    model: str = "deepseek-v4-pro",
    temperature: float = 0.1,
    max_tokens: int = 4096,
    max_retries: int = 3,
) -> str:
    """Call the DeepSeek V4 Pro LLM and return the response text.

    Args:
        system_prompt: System-level instruction.
        user_prompt: User message (CV + rubric context).
        model: Model name (default: deepseek-v4-pro).
        temperature: Low for deterministic scoring output.
        max_tokens: Maximum response length.
        max_retries: Number of retries on failure.

    Returns:
        The raw response text from the LLM.

    Raises:
        RuntimeError: If all retries are exhausted.
    """
    client = get_llm_client()
    last_error = None

    for attempt in range(1, max_retries + 1):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content

        except Exception as e:
            last_error = e
            logger.warning("[LLM] Attempt %d/%d failed: %s", attempt, max_retries, e)
            if attempt < max_retries:
                wait = 2 ** attempt  # exponential backoff: 2, 4, 8 seconds
                logger.info("[LLM] Retrying in %ds...", wait)
                time.sleep(wait)

    raise RuntimeError(
        f"LLM call failed after {max_retries} attempts. Last error: {last_error}"
    )


def call_llm_json(
    system_prompt: str,
    user_prompt: str,
    **kwargs,
) -> dict:
    """Call the LLM and parse the response as JSON.

    Handles markdown code fences (```json ... ```) that LLMs
    sometimes wrap around JSON output.

    Args:
        system_prompt: System instruction requesting JSON output.
        user_prompt: User message.
        **kwargs: Passed to call_llm().

    Returns:
        Parsed JSON as a dict.

    Raises:
        ValueError: If the response cannot be parsed as JSON after retries.
    """
    max_retries = kwargs.pop("max_retries", 3)

    for attempt in range(1, max_retries + 1):
        raw = call_llm(system_prompt, user_prompt, max_retries=1, **kwargs)

        try:
            return _parse_json_response(raw)
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(
                "[LLM] JSON parse attempt %d/%d failed: %s", attempt, max_retries, e
            )
            if attempt < max_retries:
                logger.info("[LLM] Retrying with stricter prompt...")

    raise ValueError(
        f"Failed to get valid JSON from LLM after {max_retries} attempts. "
        f"Last raw response: {raw[:500]}"
    )


async def call_llm_async(
    system_prompt: str,
    user_prompt: str,
    model: str = "deepseek-v4-pro",
    temperature: float = 0.1,
    max_tokens: int = 4096,
    max_retries: int = 3,
) -> str:
    """Call the DeepSeek V4 Pro LLM asynchronously and return response text.

    Mirrors call_llm(), but uses AsyncOpenAI and non-blocking retry backoff so
    batch evaluation coroutines can overlap while waiting on DeepSeek I/O.
    """
    client = get_async_llm_client()
    last_error = None

    for attempt in range(1, max_retries + 1):
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content

        except Exception as e:
            last_error = e
            logger.warning("[LLM] Attempt %d/%d failed: %s", attempt, max_retries, e)
            if attempt < max_retries:
                wait = 2 ** attempt  # exponential backoff: 2, 4, 8 seconds
                logger.info("[LLM] Retrying in %ds...", wait)
                await asyncio.sleep(wait)

    raise RuntimeError(
        f"LLM call failed after {max_retries} attempts. Last error: {last_error}"
    )


async def call_llm_json_async(
    system_prompt: str,
    user_prompt: str,
    **kwargs,
) -> dict:
    """Call the LLM asynchronously and parse the response as JSON."""
    max_retries = kwargs.pop("max_retries", 3)

    for attempt in range(1, max_retries + 1):
        raw = await call_llm_async(
            system_prompt,
            user_prompt,
            max_retries=1,
            **kwargs,
        )

        try:
            return _parse_json_response(raw)
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(
                "[LLM] JSON parse attempt %d/%d failed: %s", attempt, max_retries, e
            )
            if attempt < max_retries:
                logger.info("[LLM] Retrying with stricter prompt...")

    raise ValueError(
        f"Failed to get valid JSON from LLM after {max_retries} attempts. "
        f"Last raw response: {raw[:500]}"
    )


KHS_LLM_MODEL = "deepseek-v4-flash"


def _khs_chat_completion(
    client: OpenAI,
    *,
    model: str,
    messages: list[dict],
    temperature: float,
    max_tokens: int,
):
    """Create a chat completion tuned for strict KHS JSON parsing.

    Uses ``response_format={"type": "json_object"}`` so DeepSeek returns a bare
    JSON object, and disables the model's thinking mode via ``extra_body`` (the
    OpenAI SDK forwards unknown body fields to the API). If the SDK or API
    rejects the ``thinking`` field, we retry once without it but keep
    ``response_format``.
    """
    base_kwargs = dict(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
    )
    try:
        return client.chat.completions.create(
            **base_kwargs,
            extra_body={"thinking": {"type": "disabled"}},
        )
    except Exception as exc:  # noqa: BLE001 - inspect to decide on fallback
        if not _looks_like_thinking_rejection(exc):
            raise
        logger.warning(
            "[KHS LLM] 'thinking' parameter rejected (%s: %s); retrying without it",
            exc.__class__.__name__,
            exc,
        )
        return client.chat.completions.create(**base_kwargs)


def _looks_like_thinking_rejection(exc: Exception) -> bool:
    """Best-effort detection of an SDK/API rejection of the thinking field."""
    text = str(exc).lower()
    return (
        isinstance(exc, TypeError)
        or "thinking" in text
        or "extra_body" in text
    )


def call_khs_llm_parser(
    system_prompt: str,
    user_prompt: str,
    *,
    model: str = KHS_LLM_MODEL,
    temperature: float = 0.0,
    max_tokens: int = 8192,
    max_retries: int = 3,
) -> dict:
    """Call DeepSeek for KHS parsing and return a parsed JSON object.

    Dedicated to the KHS parser instead of the generic ``call_llm_json`` so it
    can enforce ``response_format``, disable thinking mode, and guard against an
    empty ``message.content`` before attempting to parse JSON.

    Raises:
        EmptyLLMResponseError: The model returned empty/whitespace content.
        LLMJsonError: The content could not be parsed as a JSON object.
        Exception: Transient SDK/API errors after retries are exhausted.
    """
    client = get_llm_client()
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    last_error: Exception | None = None

    for attempt in range(1, max_retries + 1):
        try:
            response = _khs_chat_completion(
                client,
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except Exception as exc:  # noqa: BLE001 - transient SDK/API error
            last_error = exc
            logger.warning(
                "[KHS LLM] call attempt %d/%d failed: %s: %s",
                attempt,
                max_retries,
                exc.__class__.__name__,
                exc,
            )
            if attempt < max_retries:
                wait = 2 ** attempt
                logger.info("[KHS LLM] retrying in %ds...", wait)
                time.sleep(wait)
            continue

        choice = response.choices[0]
        content = choice.message.content
        finish_reason = getattr(choice, "finish_reason", None)

        if not content or not content.strip():
            last_error = EmptyLLMResponseError(
                f"LLM returned empty content. finish_reason={finish_reason!r}, "
                f"model={model!r}, message={choice.message!r}"
            )
            logger.warning(
                "[KHS LLM] empty content attempt %d/%d: %s",
                attempt,
                max_retries,
                last_error,
            )
            if attempt < max_retries:
                continue
            raise last_error

        try:
            return _parse_json_response(content)
        except (json.JSONDecodeError, ValueError) as exc:
            preview = content[:1000]
            last_error = LLMJsonError(
                f"LLM returned invalid JSON (model={model!r}, "
                f"finish_reason={finish_reason!r}): {exc} | raw preview: {preview!r}"
            )
            logger.warning(
                "[KHS LLM] invalid JSON attempt %d/%d: %s", attempt, max_retries, exc
            )
            if attempt < max_retries:
                logger.info(
                    "[KHS LLM] retrying with strict json_object response_format..."
                )
                continue
            raise last_error

    # Transient errors exhausted all retries without ever yielding content.
    raise last_error if last_error else RuntimeError("KHS LLM parser failed")


def _parse_json_response(raw: str | None) -> dict:
    """Parse a JSON response defensively.

    Handles ``None``, empty/whitespace strings, markdown code fences, and a
    JSON object preceded/followed by stray text. It is deliberately not
    permissive beyond extracting the first balanced ``{...}`` object.
    """
    if raw is None:
        raise ValueError("LLM response was None (no content returned)")

    text = raw.strip()
    if not text:
        raise ValueError("LLM response was empty after stripping whitespace")

    # Strip a markdown code fence if present (```json ... ``` or ``` ... ```).
    if text.startswith("```"):
        newline = text.find("\n")
        text = text[newline + 1:] if newline != -1 else text[3:]
        fence = text.rfind("```")
        if fence != -1:
            text = text[:fence]
        text = text.strip()

    # Fast path: the whole payload is valid JSON.
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Fallback: extract the first balanced JSON object if the model wrapped it
    # in explanatory text. Anything more permissive risks accepting garbage.
    candidate = _extract_json_object(text)
    if candidate is not None:
        return json.loads(candidate)

    preview = text[:500]
    raise ValueError(
        f"Response is not valid JSON and no JSON object could be extracted. "
        f"Preview: {preview!r}"
    )


def _extract_json_object(text: str) -> str | None:
    """Return the first balanced ``{...}`` substring, honoring string escapes."""
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start:index + 1]
    return None
