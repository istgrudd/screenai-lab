"""Hardcoded transactional email templates."""

from dataclasses import dataclass
from html import escape


@dataclass(frozen=True)
class EmailTemplate:
    subject: str
    html: str
    text: str


def verification_email(
    *,
    recipient_name: str,
    verification_url: str,
    expires_minutes: int,
) -> EmailTemplate:
    """Build the candidate email verification message."""
    subject = "Verify your ScreenAI Lab email"
    safe_name = escape(recipient_name)
    safe_url = escape(verification_url, quote=True)
    text = (
        f"Hi {recipient_name},\n\n"
        "Please verify your ScreenAI Lab account before signing in.\n\n"
        f"Verification link: {verification_url}\n\n"
        f"This link expires in {expires_minutes} minutes. "
        "If it expires, request a new verification email from the sign-in page.\n"
    )
    html = f"""
<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
    <p>Hi {safe_name},</p>
    <p>Please verify your ScreenAI Lab account before signing in.</p>
    <p>
      <a href="{safe_url}" style="color: #1d4ed8;">
        Verify email
      </a>
    </p>
    <p>This link expires in {expires_minutes} minutes.</p>
    <p>If it expires, request a new verification email from the sign-in page.</p>
  </body>
</html>
""".strip()
    return EmailTemplate(subject=subject, html=html, text=text)
