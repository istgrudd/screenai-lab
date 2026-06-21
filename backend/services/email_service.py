"""Email provider abstraction with Resend and disabled-mode support."""

from __future__ import annotations

from dataclasses import dataclass
import json
import logging
import random
import time
from typing import Any
from urllib import error, request

from backend.config import settings

logger = logging.getLogger(__name__)

# Resend enforces a per-team per-second rate limit (default ~5 req/s). During a
# bulk announce the router fires one send per candidate in a tight loop, so the
# overflow comes back as HTTP 429. We retry those overflow sends with bounded
# exponential backoff instead of giving up. Kept small so an in-request publish
# can't hang excessively.
_RESEND_MAX_RETRIES = 3  # 4 attempts total
_RESEND_BASE_BACKOFF_SECONDS = 0.5  # ~0.5s, 1s, 2s
_RESEND_MAX_BACKOFF_SECONDS = 5.0


def _retry_after_seconds(exc: error.HTTPError) -> float | None:
    """Parse a Resend ``Retry-After`` header (seconds form) from a 429."""
    try:
        raw = exc.headers.get("Retry-After") if exc.headers else None
    except Exception:  # pragma: no cover - defensive header parsing
        return None
    if not raw:
        return None
    try:
        return float(str(raw).strip())
    except (TypeError, ValueError):
        return None


@dataclass(frozen=True)
class EmailSendResult:
    success: bool
    provider: str
    disabled: bool = False
    captured: bool = False
    message_id: str | None = None
    error: str | None = None


_disabled_email_outbox: list[dict[str, Any]] = []


def clear_disabled_email_outbox() -> None:
    """Clear captured disabled-mode emails for local smoke tests."""
    _disabled_email_outbox.clear()


def get_disabled_email_outbox() -> list[dict[str, Any]]:
    """Return captured disabled-mode emails.

    Full message bodies are captured only in development while
    ``EMAIL_ENABLED=false`` so smoke tests can verify links without sending
    real email. Production disabled mode returns a structured success without
    retaining raw verification URLs in memory.
    """
    return list(_disabled_email_outbox)


def send_email(
    *,
    to_email: str,
    subject: str,
    html: str,
    text: str,
) -> EmailSendResult:
    """Send an email through the configured provider."""
    if not settings.email_enabled:
        captured = settings.environment == "development"
        if captured:
            _disabled_email_outbox.append(
                {
                    "to": to_email,
                    "subject": subject,
                    "html": html,
                    "text": text,
                    "provider": "disabled",
                }
            )

            print(f"[DEV EMAIL] To: {to_email}")
            print(f"[DEV EMAIL] Subject: {subject}")
            print(f"[DEV EMAIL] Text:\n{text}")
        
        return EmailSendResult(
            success=True,
            provider="disabled",
            disabled=True,
            captured=captured,
        )

    if not settings.resend_api_key or not settings.email_from:
        logger.warning("Email sending is enabled but Resend is not configured.")
        return EmailSendResult(
            success=False,
            provider="resend",
            error="Email provider is not configured.",
        )

    payload = {
        "from": settings.email_from,
        "to": [to_email],
        "subject": subject,
        "html": html,
        "text": text,
    }
    # Let candidates reply to a real support inbox instead of the no-reply sender.
    support_email = (settings.support_email or "").strip()
    if support_email:
        payload["reply_to"] = support_email
    body = json.dumps(payload).encode("utf-8")
    user_agent_url = (
        settings.public_frontend_url
        or settings.frontend_url
        or "https://screenai-lab.local"
    ).strip()

    req = request.Request(
        "https://api.resend.com/emails",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": f"ScreenAI-Lab/0.1 (+{user_agent_url})",
        },
    )

    response_body: str | None = None
    for attempt in range(_RESEND_MAX_RETRIES + 1):
        try:
            with request.urlopen(req, timeout=10) as response:
                response_body = response.read().decode("utf-8")
            break
        except error.HTTPError as exc:
            # Retry only on 429 (rate limit) and only while attempts remain.
            if exc.code != 429 or attempt == _RESEND_MAX_RETRIES:
                safe_error = f"Resend HTTP {exc.code}"
                logger.warning("Email send failed: %s", safe_error)
                return EmailSendResult(
                    success=False, provider="resend", error=safe_error
                )
            backoff = _RESEND_BASE_BACKOFF_SECONDS * (2 ** attempt)
            retry_after = _retry_after_seconds(exc)
            if retry_after is not None:
                backoff = max(backoff, retry_after)
            backoff = min(backoff, _RESEND_MAX_BACKOFF_SECONDS)
            backoff += random.uniform(0, 0.25)  # jitter to de-sync bursts
            logger.warning(
                "Resend HTTP 429; retrying in %.2fs (attempt %d/%d)",
                backoff,
                attempt + 1,
                _RESEND_MAX_RETRIES,
            )
            time.sleep(backoff)
            continue
        except error.URLError as exc:
            safe_error = exc.reason.__class__.__name__
            logger.warning("Email send failed: %s", safe_error)
            return EmailSendResult(
                success=False,
                provider="resend",
                error="Email provider request failed.",
            )
        except TimeoutError:
            logger.warning("Email send failed: timeout")
            return EmailSendResult(
                success=False,
                provider="resend",
                error="Email provider request timed out.",
            )

    message_id: str | None = None
    try:
        parsed = json.loads(response_body)
        message_id = parsed.get("id")
    except json.JSONDecodeError:
        message_id = None

    return EmailSendResult(
        success=True,
        provider="resend",
        message_id=message_id,
    )
