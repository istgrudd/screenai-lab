"""Email provider abstraction with Resend and disabled-mode support."""

from __future__ import annotations

from dataclasses import dataclass
import json
import logging
from typing import Any
from urllib import error, request

from backend.config import settings

logger = logging.getLogger(__name__)


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
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        "https://api.resend.com/emails",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
        },
    )

    try:
        with request.urlopen(req, timeout=10) as response:
            response_body = response.read().decode("utf-8")
    except error.HTTPError as exc:
        safe_error = f"Resend HTTP {exc.code}"
        logger.warning("Email send failed: %s", safe_error)
        return EmailSendResult(success=False, provider="resend", error=safe_error)
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
