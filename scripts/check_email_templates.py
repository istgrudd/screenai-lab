"""Structural render check for transactional email templates.

Builds every template (and BOTH announcement variants), dumps each HTML to a
preview directory, and asserts the dark-mode / CTA / footer / pass-fail
invariants introduced by the email overhaul.

Run:
    python -m scripts.check_email_templates
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from backend.services.email_templates import (
    EmailTemplate,
    announcement_published_email,
    application_submitted_email,
    document_rejected_email,
    password_reset_email,
    verification_email,
)

PASS = "[PASS]"
FAIL = "[FAIL]"

PORTAL_URL = "https://portal.example.com/application/status"
GRADIENT = "linear-gradient(135deg, #1E3F75 0%, #0065B0 100%)"
CONVERTED_TEMPLATES = (
    "application_submitted",
    "document_rejected",
    "announcement_pass",
    "announcement_fail",
)
INDONESIAN_MARKERS = (
    "Halo ",
    "Buka portal",
    "Dokumen Pendukung",
    "belum lolos",
    "Catatan recruiter",
)


def _build_templates() -> dict[str, EmailTemplate]:
    return {
        "verification": verification_email(
            recipient_name="Ada Lovelace",
            verification_url="https://portal.example.com/verify?token=abc123",
            expires_minutes=60,
        ),
        "password_reset": password_reset_email(
            recipient_name="Ada Lovelace",
            reset_url="https://portal.example.com/reset?token=abc123",
            expires_minutes=60,
        ),
        "application_submitted": application_submitted_email(
            recipient_name="Ada Lovelace",
            division="big_data",
            portal_url=PORTAL_URL,
        ),
        "document_rejected": document_rejected_email(
            recipient_name="Ada Lovelace",
            rejected_document_types=["khs", "supporting_docs"],
            rejection_reasons={
                "khs": "The scan is too blurry to read.",
                "supporting_docs": None,
            },
            portal_url="https://portal.example.com/documents",
        ),
        "announcement_pass": announcement_published_email(
            recipient_name="Ada Lovelace",
            result="pass",
            portal_url=PORTAL_URL,
            # Accepted emails ignore notes — they always carry the fixed
            # technical test guidebook block.
        ),
        "announcement_fail": announcement_published_email(
            recipient_name="Ada Lovelace",
            result="fail",
            portal_url=PORTAL_URL,
            notes="We hope you will apply again next cycle.",
        ),
    }


def main() -> int:
    out_dir = Path(tempfile.gettempdir()) / "email_preview"
    out_dir.mkdir(parents=True, exist_ok=True)
    templates = _build_templates()

    passed = 0
    failed = 0

    def check(condition: bool, message: str) -> None:
        nonlocal passed, failed
        if condition:
            passed += 1
            print(f"{PASS} {message}")
        else:
            failed += 1
            print(f"{FAIL} {message}")

    written: list[Path] = []
    for name, template in templates.items():
        path = out_dir / f"{name}.html"
        path.write_text(template.html, encoding="utf-8")
        written.append(path)

    # --- Shell invariants applied to every template ---
    for name, template in templates.items():
        html = template.html
        check(
            'name="color-scheme" content="light dark"' in html,
            f"{name}: color-scheme meta is 'light dark'",
        )
        check(
            "@media (prefers-color-scheme: dark)" in html,
            f"{name}: prefers-color-scheme dark block present",
        )
        check(GRADIENT in html, f"{name}: brand gradient present in CTA")
        check(
            'bgcolor="#1E3F75"' in html and "background-color: #1E3F75" in html,
            f"{name}: CTA has solid bgcolor + background-color fallback",
        )
        check("Or copy this link" in html, f"{name}: plain-text fallback link present")
        check(
            "support@mbclaboratory.com" in html,
            f"{name}: footer carries support contact",
        )

    # --- Announcement pass/fail differentiation ---
    pass_html = templates["announcement_pass"].html
    fail_html = templates["announcement_fail"].html
    check("RESULT: ACCEPTED" in pass_html, "announcement pass: 'RESULT: ACCEPTED' chip")
    check("#15803D" in pass_html, "announcement pass: success green #15803D present")
    check("✓" in pass_html, "announcement pass: leading check mark present")
    check(
        "RESULT: NOT SELECTED" in fail_html,
        "announcement fail: 'RESULT: NOT SELECTED' chip",
    )
    check("#E12A26" in fail_html, "announcement fail: boho red #E12A26 present")
    check("✕" in fail_html, "announcement fail: leading cross mark present")
    check(
        "Result: Accepted" in templates["announcement_pass"].text,
        "announcement pass: plain-text result line",
    )
    check(
        "Result: Not selected" in templates["announcement_fail"].text,
        "announcement fail: plain-text result line",
    )

    # --- No leftover Indonesian in the converted templates (html + text) ---
    for name in CONVERTED_TEMPLATES:
        blob = templates[name].html + "\n" + templates[name].text
        for marker in INDONESIAN_MARKERS:
            check(marker not in blob, f"{name}: no Indonesian marker '{marker.strip()}'")

    print()
    print(f"Preview files written to: {out_dir}")
    for path in written:
        print(f"  {path}")
    print()
    print(f"{passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
