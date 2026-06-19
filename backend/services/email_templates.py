"""Hardcoded transactional email templates."""

from dataclasses import dataclass
from html import escape


@dataclass(frozen=True)
class EmailTemplate:
    subject: str
    html: str
    text: str


def _email_shell(
    *,
    preheader: str,
    eyebrow: str,
    title: str,
    content_html: str,
    cta_label: str | None = None,
    cta_url: str | None = None,
    footer_note: str = (
        "This is an automated message from ScreenAI Lab, MBC Laboratory."
    ),
) -> str:
    safe_preheader = escape(preheader)
    safe_eyebrow = escape(eyebrow)
    safe_title = escape(title)
    safe_footer_note = escape(footer_note)
    cta_html = ""
    if cta_label and cta_url:
        safe_cta_label = escape(cta_label)
        safe_cta_url = escape(cta_url, quote=True)
        cta_html = f"""
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0 6px;">
                      <tr>
                        <td bgcolor="#0065B0" style="border-radius: 10px;">
                          <a href="{safe_cta_url}" style="display: inline-block; padding: 13px 22px; font-family: Poppins, Arial, sans-serif; font-size: 14px; font-weight: 600; color: #FFFFFF; text-decoration: none; border-radius: 10px;">
                            {safe_cta_label}
                          </a>
                        </td>
                      </tr>
                    </table>
""".rstrip()

    return f"""
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>{safe_title}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #F7FAFC; color: #0D0D0D; font-family: Poppins, Arial, sans-serif; line-height: 1.6;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
      {safe_preheader}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F7FAFC; margin: 0; padding: 32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; max-width: 640px; overflow: hidden; background-color: #FFFFFF; border: 1px solid rgba(30, 63, 117, 0.12); border-radius: 18px; box-shadow: 0 18px 40px rgba(30, 63, 117, 0.12);">
            <tr>
              <td style="padding: 0; background: linear-gradient(135deg, #1E3F75 0%, #0065B0 100%); background-color: #1E3F75;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding: 26px 30px 28px;">
                      <p style="margin: 0 0 10px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #DCEEFF;">
                        ScreenAI Lab
                      </p>
                      <h1 style="margin: 0; font-family: Montserrat, Arial, sans-serif; font-size: 26px; line-height: 1.25; font-weight: 700; color: #FFFFFF;">
                        {safe_title}
                      </h1>
                      <p style="display: inline-block; margin: 18px 0 0; padding: 5px 10px; border-radius: 999px; background-color: rgba(255, 255, 255, 0.14); color: #FFFFFF; font-size: 12px; font-weight: 600;">
                        {safe_eyebrow}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 30px; font-size: 15px; color: #1F2937;">
                {content_html}
                {cta_html}
              </td>
            </tr>
            <tr>
              <td style="padding: 18px 30px 24px; border-top: 1px solid #E4F0FA; background-color: #EEF5FB;">
                <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #777777;">
                  {safe_footer_note}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
""".strip()


def _body_paragraph(content: str) -> str:
    return f'<p style="margin: 0 0 16px;">{content}</p>'


def _info_panel(content: str) -> str:
    return f"""
                <div style="margin: 24px 0 0; padding: 16px 18px; border: 1px solid #E4F0FA; border-radius: 14px; background-color: #EEF5FB;">
                  {content}
                </div>
""".rstrip()


def _section_label(label: str) -> str:
    return (
        '<p style="margin: 0 0 6px; font-size: 13px; font-weight: 700; '
        'letter-spacing: 0.08em; text-transform: uppercase; color: #777777;">'
        f"{escape(label)}</p>"
    )


def _highlight_value(value: str, *, font_size: int = 18) -> str:
    return (
        '<p style="margin: 6px 0 0; font-family: Montserrat, Arial, sans-serif; '
        f'font-size: {font_size}px; font-weight: 700; color: #1E3F75;">'
        f"{value}</p>"
    )


def verification_email(
    *,
    recipient_name: str,
    verification_url: str,
    expires_minutes: int,
) -> EmailTemplate:
    """Build the candidate email verification message."""
    subject = "Verify your ScreenAI Lab email"
    safe_name = escape(recipient_name)
    text = (
        f"Hi {recipient_name},\n\n"
        "Please verify your ScreenAI Lab account before signing in.\n\n"
        f"Verification link: {verification_url}\n\n"
        f"This link expires in {expires_minutes} minutes. "
        "If it expires, request a new verification email from the sign-in page.\n"
    )
    html = _email_shell(
        preheader="Please verify your ScreenAI Lab account before signing in.",
        eyebrow="Account verification",
        title="Verify your ScreenAI Lab email",
        content_html=(
            _body_paragraph(f"Hi {safe_name},")
            + _body_paragraph(
                "Please verify your ScreenAI Lab account before signing in."
            )
            + _info_panel(
                _body_paragraph(
                    f"<strong>This link expires in {expires_minutes} minutes.</strong>"
                )
                + '<p style="margin: 0;">If it expires, request a new verification email from the sign-in page.</p>'
            )
        ),
        cta_label="Verify email",
        cta_url=verification_url,
    )
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
    text = (
        f"Hi {recipient_name},\n\n"
        "We received a request to reset your ScreenAI Lab password.\n\n"
        f"Reset link: {reset_url}\n\n"
        f"This link expires in {expires_minutes} minutes. "
        "If you did not request this, you can ignore this email.\n"
    )
    html = _email_shell(
        preheader="Use this secure link to reset your ScreenAI Lab password.",
        eyebrow="Password recovery",
        title="Reset your ScreenAI Lab password",
        content_html=(
            _body_paragraph(f"Hi {safe_name},")
            + _body_paragraph(
                "We received a request to reset your ScreenAI Lab password."
            )
            + _info_panel(
                _body_paragraph(
                    f"<strong>This link expires in {expires_minutes} minutes.</strong>"
                )
                + '<p style="margin: 0;">If you did not request this, you can ignore this email.</p>'
            )
        ),
        cta_label="Reset password",
        cta_url=reset_url,
    )
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
    html = _email_shell(
        preheader="Aplikasi ScreenAI Lab kamu sudah berhasil dikirim.",
        eyebrow="Application submitted",
        title="Aplikasi berhasil dikirim",
        content_html=(
            _body_paragraph(f"Halo {safe_name},")
            + _body_paragraph(
                "Aplikasi ScreenAI Lab kamu sudah berhasil dikirim dan masuk ke tahap pemeriksaan dokumen."
            )
            + _info_panel(
                _section_label("Divisi pilihan")
                + _highlight_value(safe_division)
            )
            + _body_paragraph(
                "Tim recruiter akan memeriksa kelengkapan dan kesesuaian dokumen. Pantau status terbaru melalui portal kandidat."
            )
            + _body_paragraph("Terima kasih sudah mendaftar di MBC Laboratory.")
        ),
        cta_label="Buka portal kandidat",
        cta_url=portal_url,
    )
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

    text_lines = []
    html_lines = []
    for doc_type in rejected_document_types:
        label = _document_label(doc_type)
        reason = (rejection_reasons.get(doc_type) or "").strip()
        text_lines.append(f"- {label}: {reason or 'Perlu diperbaiki'}")
        safe_label = escape(label)
        safe_reason = escape(reason or "Perlu diperbaiki")
        html_lines.append(
            f"""
                    <li style="margin: 0 0 10px; padding: 12px 14px; border: 1px solid #E4F0FA; border-radius: 12px; background-color: #FFFFFF; list-style-position: inside;">
                      <strong style="color: #1E3F75;">{safe_label}</strong>
                      <span style="color: #777777;">: {safe_reason}</span>
                    </li>
""".rstrip()
        )

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
    html = _email_shell(
        preheader="Ada dokumen aplikasi yang perlu kamu perbaiki.",
        eyebrow="Document review",
        title="Perbaikan dokumen diperlukan",
        content_html=(
            _body_paragraph(f"Halo {safe_name},")
            + _body_paragraph(
                "Hasil pemeriksaan dokumen aplikasi kamu sudah difinalisasi dan ada dokumen yang perlu diperbaiki."
            )
            + _info_panel(
                _section_label("Dokumen yang perlu diperbaiki")
                + f'<ul style="margin: 12px 0 0; padding: 0; list-style: none;">{"".join(html_lines)}</ul>'
            )
            + _body_paragraph(
                "Silakan masuk ke portal kandidat untuk mengunggah dokumen pengganti. Status aplikasi di portal tetap menjadi sumber informasi utama."
            )
        ),
        cta_label="Buka portal kandidat",
        cta_url=portal_url,
    )
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
    cleaned_notes = (notes or "").strip()

    notes_text = f"\nCatatan recruiter: {cleaned_notes}\n" if cleaned_notes else ""
    notes_html = (
        _info_panel(
            _section_label("Catatan recruiter")
            + f'<p style="margin: 0;">{escape(cleaned_notes)}</p>'
        )
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
    html = _email_shell(
        preheader="Pengumuman hasil seleksi ScreenAI Lab sudah tersedia.",
        eyebrow="Recruitment result",
        title="Pengumuman hasil seleksi tersedia",
        content_html=(
            _body_paragraph(f"Halo {safe_name},")
            + _body_paragraph(
                "Pengumuman hasil seleksi ScreenAI Lab sudah tersedia di portal kandidat."
            )
            + _info_panel(
                _section_label("Hasil kamu")
                + _highlight_value(f"{safe_result}.", font_size=20)
            )
            + notes_html
            + _body_paragraph(
                "Silakan buka portal untuk melihat status resmi dan instruksi lanjutan."
            )
        ),
        cta_label="Buka portal kandidat",
        cta_url=portal_url,
    )
    return EmailTemplate(subject=subject, html=html, text=text)
