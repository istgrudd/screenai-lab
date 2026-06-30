"""Hardcoded transactional email templates."""

from dataclasses import dataclass
from html import escape


@dataclass(frozen=True)
class EmailTemplate:
    subject: str
    html: str
    text: str


# Support inbox surfaced in every footer so candidates can reach a human. Kept in
# sync with the Reply-To header set in ``email_service.send_email`` (which reads
# ``settings.support_email`` defaulting to this same address).
SUPPORT_EMAIL = "support@mbclaboratory.com"

# Fixed next-step guidance attached to every ACCEPTED announcement. The technical
# test guidebook is a single document covering the task for every division, so the
# link is the same for all accepted candidates regardless of division. This copy is
# intentionally not recruiter-editable. The same link is mirrored in the candidate
# portal (see frontend TechnicalTestCallout); update both places if it ever changes.
TECHNICAL_TEST_GUIDEBOOK_URL = (
    "https://drive.google.com/file/d/1aoU46dtBDew9-TjSc6GRfHznsnWfWi0O/view?usp=sharing"
)


# Dark-mode + color-scheme defense injected into every email <head>. Held as a
# plain (non-f) string so the CSS braces stay literal. Gmail and Apple Mail honor
# the ``prefers-color-scheme`` media query; Outlook.com applies its generated dark
# theme, which we counter with the ``[data-ogsc]`` hooks. The class hooks
# (email-bg / email-card / email-body / panel / muted / footer-cell) are attached
# to the inline-styled cells below so these rules have something to target. Inline
# styles are kept everywhere because clients that strip <style> still need them.
_DARK_MODE_STYLE = """
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <style>
      :root { color-scheme: light dark; supported-color-schemes: light dark; }
      @media (prefers-color-scheme: dark) {
        .email-bg   { background-color: #0D0D0D !important; }
        .email-card { background-color: #14181F !important; border-color: rgba(255,255,255,0.10) !important; }
        .email-body, .email-body p, .email-body li { color: #E6EAF0 !important; }
        .panel      { background-color: #1B2330 !important; border-color: rgba(255,255,255,0.12) !important; }
        .muted      { color: #AEB6C2 !important; }
        .footer-cell{ background-color: #11151B !important; border-color: rgba(255,255,255,0.10) !important; }
        .panel-link { color: #8AB4F8 !important; }
      }
      /* Outlook.com generated-style dark mode */
      [data-ogsc] .email-body, [data-ogsc] .email-body p, [data-ogsc] .email-body li { color: #E6EAF0 !important; }
      [data-ogsc] .muted { color: #AEB6C2 !important; }
      [data-ogsc] .panel-link { color: #8AB4F8 !important; }
    </style>
""".strip("\n")


def _email_shell(
    *,
    preheader: str,
    eyebrow: str,
    title: str,
    content_html: str,
    hero_html: str = "",
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

    hero_row = ""
    if hero_html:
        hero_row = f"""
            <tr>
              <td style="padding: 0;">
                {hero_html}
              </td>
            </tr>""".rstrip()

    cta_html = ""
    if cta_label and cta_url:
        safe_cta_label = escape(cta_label)
        safe_cta_url = escape(cta_url, quote=True)
        # Solid bgcolor + background-color is the load-bearing fallback (Outlook,
        # dark-mode flatten); the gradient is enhancement on top for modern clients.
        # The plain-text link beneath survives button stripping entirely.
        cta_html = f"""
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0 6px;">
                      <tr>
                        <td align="center" bgcolor="#1E3F75" style="border-radius: 10px; background-color: #1E3F75; background-image: linear-gradient(135deg, #1E3F75 0%, #0065B0 100%);">
                          <a href="{safe_cta_url}" style="display: inline-block; padding: 13px 24px; font-family: Poppins, Arial, sans-serif; font-size: 14px; font-weight: 600; color: #FFFFFF; text-decoration: none; border-radius: 10px;">
                            {safe_cta_label}
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p class="muted" style="margin: 4px 0 0; font-size: 12px; color: #777777;">
                      Or copy this link: <span style="color:#0065B0;">{safe_cta_url}</span>
                    </p>
""".rstrip()

    return f"""
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
{_DARK_MODE_STYLE}
    <title>{safe_title}</title>
  </head>
  <body class="email-bg" style="margin: 0; padding: 0; background-color: #F7FAFC; color: #0D0D0D; font-family: Poppins, Arial, sans-serif; line-height: 1.6;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
      {safe_preheader}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-bg" style="background-color: #F7FAFC; margin: 0; padding: 32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-card" style="width: 100%; max-width: 640px; overflow: hidden; background-color: #FFFFFF; border: 1px solid rgba(30, 63, 117, 0.12); border-radius: 18px; box-shadow: 0 18px 40px rgba(30, 63, 117, 0.12);">
            <tr>
              <td style="padding: 26px 30px 28px; background-color: #1E3F75; background-image: linear-gradient(135deg, #1E3F75 0%, #0065B0 100%);">
                <p style="margin: 0 0 10px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #DCEEFF;">
                  {safe_eyebrow}
                </p>
                <h1 style="margin: 0; font-family: Montserrat, Arial, sans-serif; font-size: 26px; line-height: 1.25; font-weight: 700; color: #FFFFFF;">
                  {safe_title}
                </h1>
              </td>
            </tr>{hero_row}
            <tr>
              <td class="email-body" style="padding: 30px; font-size: 15px; color: #1F2937;">
                {content_html}
                {cta_html}
              </td>
            </tr>
            <tr>
              <td class="footer-cell" style="padding: 18px 30px 24px; border-top: 1px solid #E4F0FA; background-color: #EEF5FB;">
                <p class="muted" style="margin: 0 0 4px; font-size: 12px; line-height: 1.6; color: #777777;">
                  Need help? Contact <a href="mailto:{SUPPORT_EMAIL}" style="color:#0065B0; text-decoration:none;">{SUPPORT_EMAIL}</a>.
                </p>
                <p class="muted" style="margin: 0; font-size: 12px; line-height: 1.6; color: #777777;">
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
                <div class="panel" style="margin: 24px 0 0; padding: 16px 18px; border: 1px solid #E4F0FA; border-radius: 14px; background-color: #EEF5FB;">
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


def _result_hero(
    *,
    band_bg: str,
    band_gradient: str,
    chip_bg: str,
    chip_color: str,
    chip_label: str,
    headline: str,
) -> str:
    """Build the full-bleed pass/fail result band for the announcement email.

    Contrast is carried by luminance: the chip + bold >=22px white (or dark-on-
    white) headline survive dark-mode inversion because the band stays a solid
    color block, with the gradient only layered on top as enhancement.
    """
    return f"""
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: {band_bg}; background-image: {band_gradient};">
                  <tr>
                    <td style="padding: 22px 30px 26px;">
                      <p style="display: inline-block; margin: 0 0 14px; padding: 6px 12px; border-radius: 999px; background-color: {chip_bg}; color: {chip_color}; font-family: Poppins, Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.04em;">
                        {chip_label}
                      </p>
                      <p style="margin: 0; font-family: Montserrat, Arial, sans-serif; font-size: 24px; line-height: 1.3; font-weight: 700; color: #FFFFFF;">
                        {headline}
                      </p>
                    </td>
                  </tr>
                </table>
""".rstrip()


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
    "supporting_docs": "Supporting Documents",
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
    subject = "Your ScreenAI Lab application was received"
    safe_name = escape(recipient_name)
    division_label = division.replace("_", " ").title()
    safe_division = escape(division_label)
    text = (
        f"Hi {recipient_name},\n\n"
        "Your ScreenAI Lab application has been submitted and is now in document "
        "review.\n\n"
        f"Selected division: {division_label}\n\n"
        "Our recruiter team will check that your documents are complete and "
        "valid. You can follow the latest status in the candidate portal:\n"
        f"{portal_url}\n\n"
        "Thank you for applying to MBC Laboratory.\n"
    )
    html = _email_shell(
        preheader="Your ScreenAI Lab application has been submitted successfully.",
        eyebrow="Application submitted",
        title="Application received",
        content_html=(
            _body_paragraph(f"Hi {safe_name},")
            + _body_paragraph(
                "Your ScreenAI Lab application has been submitted and is now in document review."
            )
            + _info_panel(
                _section_label("Selected division")
                + _highlight_value(safe_division)
            )
            + _body_paragraph(
                "Our recruiter team will check that your documents are complete and valid. You can follow the latest status in the candidate portal."
            )
            + _body_paragraph("Thank you for applying to MBC Laboratory.")
        ),
        cta_label="Open candidate portal",
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
    subject = "Action needed: update your ScreenAI Lab documents"
    safe_name = escape(recipient_name)

    text_lines = []
    html_lines = []
    for doc_type in rejected_document_types:
        label = _document_label(doc_type)
        reason = (rejection_reasons.get(doc_type) or "").strip()
        text_lines.append(f"- {label}: {reason or 'Needs an update'}")
        safe_label = escape(label)
        safe_reason = escape(reason or "Needs an update")
        html_lines.append(
            f"""
                    <li style="margin: 0 0 10px; padding: 12px 14px; border: 1px solid #E4F0FA; border-radius: 12px; background-color: #FFFFFF; list-style-position: inside;">
                      <strong style="color: #1E3F75;">{safe_label}</strong>
                      <span style="color: #777777;">: {safe_reason}</span>
                    </li>
""".rstrip()
        )

    text = (
        f"Hi {recipient_name},\n\n"
        "Your document review has been finalized, and some documents need to be "
        "fixed.\n\n"
        "Documents to fix:\n"
        + "\n".join(text_lines)
        + "\n\nPlease sign in to the candidate portal to upload replacements. "
        "The application status in the portal remains the primary source of truth.\n"
        f"{portal_url}\n"
    )
    html = _email_shell(
        preheader="Some documents in your application need to be fixed.",
        eyebrow="Document review",
        title="Document fixes needed",
        content_html=(
            _body_paragraph(f"Hi {safe_name},")
            + _body_paragraph(
                "Your document review has been finalized, and some documents need to be fixed."
            )
            + _info_panel(
                _section_label("Documents to fix")
                + f'<ul style="margin: 12px 0 0; padding: 0; list-style: none;">{"".join(html_lines)}</ul>'
            )
            + _body_paragraph(
                "Please sign in to the candidate portal to upload replacements. The application status in the portal remains the primary source of truth."
            )
        ),
        cta_label="Open candidate portal",
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
    """Build the candidate notification for published recruitment result.

    The subject and preheader stay neutral for both outcomes so the inbox preview
    never spoils the verdict; the pass/fail character lives in the result hero.
    """
    accepted = result == "pass"
    subject = "Your MBC Laboratory recruitment result is available"
    safe_name = escape(recipient_name)
    cleaned_notes = (notes or "").strip()
    result_line = "Accepted" if accepted else "Not selected"

    if accepted:
        hero_html = _result_hero(
            band_bg="#1E3F75",
            band_gradient="linear-gradient(135deg, #1E3F75 0%, #0065B0 100%)",
            chip_bg="#15803D",
            chip_color="#FFFFFF",
            chip_label="✓ RESULT: ACCEPTED",
            headline="You&#39;ve been accepted.",
        )
        body_paragraphs = (
            _body_paragraph(f"Hi {safe_name},")
            + _body_paragraph(
                "After a competitive selection process at Recruitment MBC Laboratory, we&#39;re "
                "glad to share some good news. Congratulations — your "
                "application stood out, and we&#39;d be glad to have you join MBC "
                "Laboratory."
            )
            + _body_paragraph(
                "Open the candidate portal for the official result and your next steps."
            )
        )
        body_text = (
            "After a competitive selection process at Recruitment MBC Laboratory, we're glad to "
            "share some good news. Congratulations - your application stood out, "
            "and we'd be glad to have you join MBC Laboratory."
        )
        closing_text = (
            "Open the candidate portal for the official result and your next steps:"
        )
    else:
        hero_html = _result_hero(
            band_bg="#E12A26",
            band_gradient="linear-gradient(135deg, #B71F1B 0%, #E12A26 100%)",
            chip_bg="#FFFFFF",
            chip_color="#B71F1B",
            chip_label="✕ RESULT: NOT SELECTED",
            headline="You were not selected this time.",
        )
        body_paragraphs = (
            _body_paragraph(f"Hi {safe_name},")
            + _body_paragraph(
                "Thank you for taking part in the Recruitment MBC Laboratory process "
                "and for the effort you put into your application. This outcome "
                "doesn&#39;t take away from the work you showed, and we genuinely "
                "encourage you to apply again in a future cycle."
            )
            + _body_paragraph(
                "Open the candidate portal for the official result and any further notes."
            )
        )
        body_text = (
            "Thank you for taking part in the Recruitment MBC Laboratory process and "
            "for the effort you put into your application. This outcome doesn't "
            "take away from the work you showed, and we genuinely encourage you to "
            "apply again in a future cycle."
        )
        closing_text = (
            "Open the candidate portal for the official result and any further notes:"
        )

    if accepted:
        # Accepted candidates always receive the same fixed next-step guidance —
        # the technical test guidebook. Any recruiter-supplied ``notes`` are
        # intentionally ignored here so this stage is never accidentally omitted
        # or customized per announcement (the bulk-announce path sends no notes).
        notes_html = _info_panel(
            _section_label("Next step — Technical Test")
            + _body_paragraph(
                "You have advanced to the Technical Test stage. The guidebook "
                "below contains the task for each division along with the "
                "submission instructions and deadline — please read it carefully "
                "before you begin."
            )
            + f'<p style="margin: 0;"><a href="{TECHNICAL_TEST_GUIDEBOOK_URL}" '
            'class="panel-link" style="color: #1E3F75; font-weight: 700; '
            'text-decoration: underline;">Open the Technical Test guidebook →</a></p>'
        )
        notes_text = (
            "\nNext step - Technical Test:\n"
            "You have advanced to the Technical Test stage. The guidebook below "
            "contains the task for each division along with the submission "
            "instructions and deadline. Please read it carefully before you begin.\n"
            f"Guidebook: {TECHNICAL_TEST_GUIDEBOOK_URL}\n"
        )
    else:
        notes_html = (
            _info_panel(
                _section_label("Recruiter note")
                + f'<p style="margin: 0;">{escape(cleaned_notes)}</p>'
            )
            if cleaned_notes
            else ""
        )
        notes_text = f"\nRecruiter note: {cleaned_notes}\n" if cleaned_notes else ""

    text = (
        f"Hi {recipient_name},\n\n"
        f"Result: {result_line}\n\n"
        f"{body_text}\n"
        f"{notes_text}\n"
        f"{closing_text}\n"
        f"{portal_url}\n"
    )
    html = _email_shell(
        preheader="Your MBC Laboratory recruitment result is now available in the candidate portal.",
        eyebrow="Recruitment result",
        title="Your recruitment result",
        hero_html=hero_html,
        content_html=(body_paragraphs + notes_html),
        cta_label="Open candidate portal",
        cta_url=portal_url,
    )
    return EmailTemplate(subject=subject, html=html, text=text)
