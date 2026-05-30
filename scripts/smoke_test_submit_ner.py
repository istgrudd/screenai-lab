"""Regression smoke for NER timing.

The old lifecycle ran NER immediately after candidate submit. The current
workflow intentionally waits until recruiter/admin final document approval.

Run:
    python -m scripts.smoke_test_submit_ner
"""

from __future__ import annotations

import sys

from scripts.smoke_test_document_review_flow import main as document_review_main


if __name__ == "__main__":
    sys.exit(document_review_main())
