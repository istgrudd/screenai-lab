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


def password_reset_email(
    *,
    recipient_name: str,
    reset_url: str,
    expires_minutes: int,
) -> EmailTemplate:
    """Build the self-service password reset message."""
    subject = "Reset your ScreenAI Lab password"
    safe_name = escape(recipient_name)
    safe_url = escape(reset_url, quote=True)
    text = (
        f"Hi {recipient_name},\n\n"
        "We received a request to reset your ScreenAI Lab password.\n\n"
        f"Reset link: {reset_url}\n\n"
        f"This link expires in {expires_minutes} minutes. "
        "If you did not request this, you can ignore this email.\n"
    )
    html = f"""
<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
    <p>Hi {safe_name},</p>
    <p>We received a request to reset your ScreenAI Lab password.</p>
    <p>
      <a href="{safe_url}" style="color: #1d4ed8;">
        Reset password
      </a>
    </p>
    <p>This link expires in {expires_minutes} minutes.</p>
    <p>If you did not request this, you can ignore this email.</p>
  </body>
</html>
""".strip()
    return EmailTemplate(subject=subject, html=html, text=text)


_DOCUMENT_TYPE_LABELS = {
    "cv": "CV",
    "khs": "KHS",
    "ktm": "KTM",
    "motivation_letter": "Motivation Letter",
    "swot": "SWOT",
    "supporting_docs": "Dokumen Pendukung",
}


def _document_label(doc_type: str) -> str:
    return _DOCUMENT_TYPE_LABELS.get(doc_type, doc_type.replace("_", " ").title())


def application_submitted_email(
    *,
    recipient_name: str,
    division: str,
    portal_url: str,
) -> EmailTemplate:
    """Build the candidate notification for successful application submit."""
    subject = "Aplikasi ScreenAI Lab berhasil dikirim"
    safe_name = escape(recipient_name)
    safe_division = escape(division.replace("_", " ").title())
    safe_url = escape(portal_url, quote=True)
    text = (
        f"Halo {recipient_name},\n\n"
        "Aplikasi ScreenAI Lab kamu sudah berhasil dikirim dan masuk ke tahap "
        "pemeriksaan dokumen.\n\n"
        f"Divisi pilihan: {division.replace('_', ' ').title()}\n\n"
        "Tim recruiter akan memeriksa kelengkapan dan kesesuaian dokumen. "
        "Pantau status terbaru melalui portal kandidat:\n"
        f"{portal_url}\n\n"
        "Terima kasih sudah mendaftar di MBC Laboratory.\n"
    )
    html = f"""
<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
    <p>Halo {safe_name},</p>
    <p>
      Aplikasi ScreenAI Lab kamu sudah berhasil dikirim dan masuk ke tahap
      pemeriksaan dokumen.
    </p>
    <p><strong>Divisi pilihan:</strong> {safe_division}</p>
    <p>
      Tim recruiter akan memeriksa kelengkapan dan kesesuaian dokumen.
      Pantau status terbaru melalui portal kandidat.
    </p>
    <p><a href="{safe_url}" style="color: #1d4ed8;">Buka portal kandidat</a></p>
    <p>Terima kasih sudah mendaftar di MBC Laboratory.</p>
  </body>
</html>
""".strip()
    return EmailTemplate(subject=subject, html=html, text=text)


def document_rejected_email(
    *,
    recipient_name: str,
    rejected_document_types: list[str],
    rejection_reasons: dict[str, str | None],
    portal_url: str,
) -> EmailTemplate:
    """Build the candidate notification for finalized document rejection."""
    subject = "Perbaikan dokumen aplikasi ScreenAI Lab diperlukan"
    safe_name = escape(recipient_name)
    safe_url = escape(portal_url, quote=True)

    text_lines = []
    html_lines = []
    for doc_type in rejected_document_types:
        label = _document_label(doc_type)
        reason = (rejection_reasons.get(doc_type) or "").strip()
        text_lines.append(f"- {label}: {reason or 'Perlu diperbaiki'}")
        safe_label = escape(label)
        safe_reason = escape(reason or "Perlu diperbaiki")
        html_lines.append(f"<li><strong>{safe_label}</strong>: {safe_reason}</li>")

    text = (
        f"Halo {recipient_name},\n\n"
        "Hasil pemeriksaan dokumen aplikasi kamu sudah difinalisasi dan ada "
        "dokumen yang perlu diperbaiki.\n\n"
        "Dokumen yang perlu diperbaiki:\n"
        + "\n".join(text_lines)
        + "\n\nSilakan masuk ke portal kandidat untuk mengunggah dokumen pengganti. "
        "Status aplikasi di portal tetap menjadi sumber informasi utama.\n"
        f"{portal_url}\n"
    )
    html = f"""
<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
    <p>Halo {safe_name},</p>
    <p>
      Hasil pemeriksaan dokumen aplikasi kamu sudah difinalisasi dan ada
      dokumen yang perlu diperbaiki.
    </p>
    <p><strong>Dokumen yang perlu diperbaiki:</strong></p>
    <ul>
      {''.join(html_lines)}
    </ul>
    <p>
      Silakan masuk ke portal kandidat untuk mengunggah dokumen pengganti.
      Status aplikasi di portal tetap menjadi sumber informasi utama.
    </p>
    <p><a href="{safe_url}" style="color: #1d4ed8;">Buka portal kandidat</a></p>
  </body>
</html>
""".strip()
    return EmailTemplate(subject=subject, html=html, text=text)


def announcement_published_email(
    *,
    recipient_name: str,
    result: str,
    portal_url: str,
    notes: str | None = None,
) -> EmailTemplate:
    """Build the candidate notification for published recruitment result."""
    normalized_result = "pass" if result == "pass" else "fail"
    result_label = "lolos" if normalized_result == "pass" else "belum lolos"
    subject = "Pengumuman hasil seleksi ScreenAI Lab tersedia"
    safe_name = escape(recipient_name)
    safe_result = escape(result_label)
    safe_url = escape(portal_url, quote=True)
    cleaned_notes = (notes or "").strip()

    notes_text = f"\nCatatan recruiter: {cleaned_notes}\n" if cleaned_notes else ""
    notes_html = (
        f"<p><strong>Catatan recruiter:</strong> {escape(cleaned_notes)}</p>"
        if cleaned_notes
        else ""
    )

    text = (
        f"Halo {recipient_name},\n\n"
        "Pengumuman hasil seleksi ScreenAI Lab sudah tersedia di portal kandidat.\n\n"
        f"Hasil kamu: {result_label}.\n"
        f"{notes_text}\n"
        "Silakan buka portal untuk melihat status resmi dan instruksi lanjutan:\n"
        f"{portal_url}\n"
    )
    html = f"""
<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
    <p>Halo {safe_name},</p>
    <p>Pengumuman hasil seleksi ScreenAI Lab sudah tersedia di portal kandidat.</p>
    <p><strong>Hasil kamu:</strong> {safe_result}.</p>
    {notes_html}
    <p>Silakan buka portal untuk melihat status resmi dan instruksi lanjutan.</p>
    <p><a href="{safe_url}" style="color: #1d4ed8;">Buka portal kandidat</a></p>
  </body>
</html>
""".strip()
    return EmailTemplate(subject=subject, html=html, text=text)
