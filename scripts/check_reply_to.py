"""Assert the outgoing Resend payload carries a Reply-To (Part D).

Monkeypatches the HTTP layer so no real email is sent, then inspects the JSON
body ``send_email`` hands to Resend.

Run:
    python -m scripts.check_reply_to
"""

from __future__ import annotations

import json
import sys

from backend.config import settings
import backend.services.email_service as email_service


class _FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return b'{"id": "fake-message-id"}'


def main() -> int:
    captured: dict[str, bytes] = {}

    def fake_urlopen(req, timeout=None):
        captured["body"] = req.data
        return _FakeResponse()

    settings.email_enabled = True
    settings.resend_api_key = "test-key"
    settings.email_from = "ScreenAI Lab <no-reply@mbclaboratory.com>"

    original = email_service.request.urlopen
    email_service.request.urlopen = fake_urlopen
    try:
        result = email_service.send_email(
            to_email="candidate@example.com",
            subject="Test",
            html="<p>hi</p>",
            text="hi",
        )
    finally:
        email_service.request.urlopen = original

    payload = json.loads(captured["body"].decode("utf-8"))

    ok = True

    def check(condition: bool, message: str) -> None:
        nonlocal ok
        print(f"{'[PASS]' if condition else '[FAIL]'} {message}")
        ok = ok and condition

    check(result.success, "send_email reports success via fake provider")
    check("reply_to" in payload, "Resend payload includes reply_to")
    check(
        payload.get("reply_to") == settings.support_email,
        f"reply_to == settings.support_email ({settings.support_email})",
    )
    print(f"\nreply_to value in payload: {payload.get('reply_to')!r}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
