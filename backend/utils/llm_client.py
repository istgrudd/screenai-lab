"""DeepSeek V4 LLM client wrapper (OpenAI-compatible).

Provides structured JSON output with retry logic for the
recruitment screening pipeline.
"""

import json
import time

from openai import OpenAI

from backend.config import settings


# Module-level singleton
_client: OpenAI | None = None


def get_llm_client() -> OpenAI:
    """Return the OpenAI-compatible client for DeepSeek V4."""
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
        )
    return _client


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
            print(f"[LLM] Attempt {attempt}/{max_retries} failed: {e}")
            if attempt < max_retries:
                wait = 2 ** attempt  # exponential backoff: 2, 4, 8 seconds
                print(f"[LLM] Retrying in {wait}s...")
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
            print(f"[LLM] JSON parse attempt {attempt}/{max_retries} failed: {e}")
            if attempt < max_retries:
                print("[LLM] Retrying with stricter prompt...")

    raise ValueError(
        f"Failed to get valid JSON from LLM after {max_retries} attempts. "
        f"Last raw response: {raw[:500]}"
    )


def _parse_json_response(raw: str) -> dict:
    """Parse a JSON response, handling markdown code fences."""
    text = raw.strip()

    # Strip markdown code fence if present
    if text.startswith("```"):
        # Remove opening fence (```json or ```)
        first_newline = text.index("\n")
        text = text[first_newline + 1:]
        # Remove closing fence
        if text.endswith("```"):
            text = text[:-3].strip()

    return json.loads(text)
