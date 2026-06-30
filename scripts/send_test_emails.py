"""Send each email template to a real inbox, bypassing the whole app flow.

This does NOT touch the database, registration, periods, or the announcement
pipeline. It builds each template with dummy data and calls ``send_email``
directly, so you can eyeball real rendering (especially dark mode) in your inbox.

Run from the repo root as a module:

    EMAIL_ENABLED=true \\
    RESEND_API_KEY=re_xxx \\
    EMAIL_FROM="MBC Laboratory <onboarding@resend.dev>" \\
    python -m scripts.send_test_emails you@example.com

Only send the announcement variants:

    python -m scripts.send_test_emails you@example.com --only announcement

Write HTML previews to /tmp without sending anything:

    python -m scripts.send_test_emails you@example.com --preview-only

Resend caveat: if the domain in EMAIL_FROM is not verified in Resend, you can
only send to the email you registered your Resend account with, and EMAIL_FROM
must be "<...> <onboarding@resend.dev>". Verify a domain to send anywhere.
"""

from __future__ import annotations

import argparse
import pathlib
import sys
import time

from backend.config import settings
from backend.services.email_service import send_email
from backend.services.email_templates import (
    EmailTemplate,
    announcement_published_email,
    application_submitted_email,
    document_rejected_email,
    password_reset_email,
    verification_email,
)

PREVIEW_DIR = pathlib.Path("/tmp/email_preview")
# Stay under Resend's ~5 req/s so we don't lean on the retry path during a quick burst.
SEND_SPACING_SECONDS = 0.7


def _portal_url() -> str:
    base = (settings.public_frontend_url or settings.frontend_url or "").strip()
    return base.rstrip("/") + "/application/status" if base else "https://recruitment.mbclaboratory.com/application/status"


def _build_all(recipient_name: str) -> dict[str, EmailTemplate]:
    portal = _portal_url()
    return {
        "verification": verification_email(
            recipient_name=recipient_name,
            verification_url="https://recruitment.mbclaboratory.com/verify-email?code=TEST_VERIFICATION_CODE",
            expires_minutes=60,
        ),
        "password_reset": password_reset_email(
            recipient_name=recipient_name,
            reset_url="https://recruitment.mbclaboratory.com/reset-password?code=TEST_RESET_CODE",
            expires_minutes=60,
        ),
        "application_submitted": application_submitted_email(
            recipient_name=recipient_name,
            division="big_data",
            portal_url=portal,
        ),
        "document_rejected": document_rejected_email(
            recipient_name=recipient_name,
            rejected_document_types=["khs", "supporting_docs"],
            rejection_reasons={
                "khs": "The uploaded KHS is unreadable. Please re-scan at higher quality.",
                "supporting_docs": "Missing the required poster file.",
            },
            portal_url=portal,
        ),
        "announcement_pass": announcement_published_email(
            recipient_name=recipient_name,
            result="pass",
            portal_url=portal,
            # Accepted emails ignore notes — they always carry the fixed
            # technical test guidebook block.
        ),
        "announcement_fail": announcement_published_email(
            recipient_name=recipient_name,
            result="fail",
            portal_url=portal,
            notes=None,
        ),
    }


def _resolve_selection(only: list[str] | None, available: list[str]) -> list[str]:
    if not only:
        return available
    chosen: list[str] = []
    for token in only:
        if token == "announcement":
            chosen += [k for k in available if k.startswith("announcement")]
        elif token in available:
            chosen.append(token)
        else:
            print(f"  ! unknown template '{token}' (skipped)")
    return chosen or available


def _write_previews(templates: dict[str, EmailTemplate], keys: list[str]) -> None:
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    for key in keys:
        path = PREVIEW_DIR / f"{key}.html"
        path.write_text(templates[key].html, encoding="utf-8")
        print(f"  wrote {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Send test emails to a real inbox.")
    parser.add_argument("to_email", help="Destination inbox.")
    parser.add_argument("--name", default="Rudd", help="Recipient display name used in the templates.")
    parser.add_argument(
        "--only",
        nargs="+",
        metavar="KEY",
        help="Subset to send: verification password_reset application_submitted "
        "document_rejected announcement_pass announcement_fail, or 'announcement' for both.",
    )
    parser.add_argument(
        "--preview-only",
        action="store_true",
        help="Only write HTML files to /tmp/email_preview, do not send.",
    )
    args = parser.parse_args()

    templates = _build_all(args.name)
    keys = _resolve_selection(args.only, list(templates.keys()))

    print(f"\nTemplates selected: {', '.join(keys)}")
    print(f"HTML previews -> {PREVIEW_DIR}")
    _write_previews(templates, keys)

    if args.preview_only:
        print("\n--preview-only set; no emails sent.")
        return 0

    # Validate real-send config up front so we fail loudly instead of silently capturing.
    if not settings.email_enabled:
        print(
            "\nEMAIL_ENABLED is false, so send_email will NOT send real mail.\n"
            "Re-run with real-send config, e.g.:\n\n"
            '    EMAIL_ENABLED=true RESEND_API_KEY=re_xxx \\\n'
            '    EMAIL_FROM="MBC Laboratory <onboarding@resend.dev>" \\\n'
            f"    python -m scripts.send_test_emails {args.to_email}\n\n"
            "Previews were still written above. Use --preview-only to skip this check."
        )
        return 1
    if not settings.resend_api_key or not settings.email_from:
        print("\nEMAIL_ENABLED is true but RESEND_API_KEY / EMAIL_FROM are not set. Aborting.")
        return 1

    print(f"\nSending as: {settings.email_from}")
    print(f"Sending to: {args.to_email}\n")

    failures = 0
    for key in keys:
        tpl = templates[key]
        result = send_email(
            to_email=args.to_email,
            subject=tpl.subject,
            html=tpl.html,
            text=tpl.text,
        )
        if result.success and not result.disabled:
            print(f"  [SENT]   {key:<22} id={result.message_id}")
        elif result.disabled:
            print(f"  [DISABLED] {key:<22} (captured, not actually sent)")
            failures += 1
        else:
            print(f"  [FAILED] {key:<22} {result.error}")
            failures += 1
        time.sleep(SEND_SPACING_SECONDS)

    print(f"\nDone. {len(keys) - failures}/{len(keys)} sent.")
    print("Open each in Gmail mobile with DARK theme on to verify the header/contrast fix.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
