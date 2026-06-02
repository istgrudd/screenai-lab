"""NER-based text anonymization service (AI-anonymized evaluation).

Detects personal identity attributes in CV text using:
1. IndoBERT NER model (PERSON, LOC, ORG entities)
2. Regex fallback (phone numbers, emails, NIK, NIM, URLs)

Replaces detected entities with indexed anonymous tokens so that personal
identifiers are excluded from the document text sent to AI evaluation, while
preserving document structure. This protects candidate data from the AI and
reduces identity-based AI scoring; recruiters retain full access to candidate
identity for verification and decision-making.
"""

import re
from collections import defaultdict

from backend.utils.ner_utils import run_ner


# ---------------------------------------------------------------------------
# Regex patterns for identity attributes missed by NER
# ---------------------------------------------------------------------------

_REGEX_PATTERNS: list[tuple[str, str]] = [
    # Indonesian phone numbers: +62xxx, 08xxx, (021) xxx
    (
        "PHONE",
        r"(?:\+62|62|0)[\s\-]?\d{2,4}[\s\-]?\d{3,4}[\s\-]?\d{3,4}",
    ),
    # Email addresses
    (
        "EMAIL",
        r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
    ),
    # NIK (Nomor Induk Kependudukan) — exactly 16 digits
    (
        "NIK",
        r"(?<!\d)\d{16}(?!\d)",
    ),
    # NIM (Nomor Induk Mahasiswa) — common formats: 6-15 digits,
    # often preceded by "NIM" label
    (
        "NIM",
        r"(?:NIM|nim|Nim)\s*[:\-]?\s*\d{6,15}",
    ),
    # URLs
    (
        "URL",
        r"https?://[^\s<>\"']+|www\.[^\s<>\"']+",
    ),
    # LinkedIn / GitHub profile URLs (even without http)
    (
        "URL",
        r"(?:linkedin\.com|github\.com)/[^\s<>\"']+",
    ),
]

# Context-aware patterns for Indonesian CVs — these catch identity
# attributes that the NER model frequently misses due to short-line
# PDF extraction breaking the context.
_CONTEXT_PATTERNS: list[tuple[str, str]] = [
    # Indonesian street addresses: "Jl." or "Jalan" followed by details
    (
        "LOC",
        r"(?:Jl\.|Jalan)\s+[A-Z][^\n,]{3,50}(?:,\s*[A-Z][^\n,]{2,30})*",
    ),
    # Indonesian cities & provinces (common ones in CVs)
    (
        "LOC",
        r"\b(?:Surabaya|Jakarta|Bandung|Yogyakarta|Semarang|Malang|Medan|"
        r"Makassar|Denpasar|Balikpapan|Palembang|Pontianak|Banjarmasin|"
        r"Manado|Padang|Pekanbaru|Lampung|Aceh|Solo|Depok|Tangerang|Bekasi|Bogor|"
        r"Jawa\s+Timur|Jawa\s+Barat|Jawa\s+Tengah|DKI\s+Jakarta|"
        r"Kalimantan|Sulawesi|Sumatera|Bali|Papua|NTB|NTT)\b",
    ),
    # Indonesian companies: "PT ..." or "CV ..."
    (
        "ORG",
        r"\bPT\.?\s+[A-Z][A-Za-z\s&.]{2,40}(?=\s*[\n,\-]|\s+(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember|\d))",
    ),
    # Indonesian universities
    (
        "ORG",
        r"\b(?:Universitas|Institut|Politeknik|Sekolah\s+Tinggi|Akademi|"
        r"STMIK|STIE|STT)\s+[A-Z][A-Za-z\s]{3,50}",
    ),
    # Common university abbreviations
    (
        "ORG",
        r"\b(?:ITB|ITS|UI|UGM|UNDIP|UNAIR|UNPAD|IPB|UNS|UB|UNHAS|"
        r"UNY|UNJ|UPI|UNESA|UNSRI|UNTAN|UNMUL|UNRAM|UNDANA|"
        r"BINUS|PRASMUL|TELKOM|PETRA|ATMA\s+JAYA)\b",
    ),
    # "SMA Negeri X" / "SMP Negeri X" / "SD Negeri X"
    (
        "ORG",
        r"\b(?:SMA|SMP|SD|SMK|MAN|MTs)\s+(?:Negeri|Swasta|N)\s*\d*\s*[A-Z][A-Za-z\s]*",
    ),
]

# Map NER entity_group labels to our canonical labels.
# The IndoBERT model uses "PER" for person — we normalize to "PERSON".
_NER_LABEL_MAP: dict[str, str] = {
    "PER": "PERSON",
    "PERSON": "PERSON",
    "LOC": "LOC",
    "ORG": "ORG",
}

# Labels we want to anonymize
_ANONYMIZE_LABELS = {"PERSON", "LOC", "ORG", "PHONE", "EMAIL", "NIK", "NIM", "URL"}


def anonymize_text(text: str) -> dict:
    """Anonymize personal identity attributes in CV text.

    Uses a two-pass approach:
    1. NER pass: detect PERSON, LOC, ORG entities using IndoBERT.
    2. Regex pass: catch phone numbers, emails, NIK, NIM, and URLs.

    Detected entities are replaced with indexed tokens like
    [PERSON_1], [ORG_1], [LOC_1], [PHONE_1], etc.

    Args:
        text: Normalized CV text to anonymize.

    Returns:
        {
            "anonymized_text": str,
            "entities_found": [
                {"text": "Budi Santoso", "label": "PERSON", "replacement": "[PERSON_1]"},
                ...
            ],
            "entity_count": int
        }
    """
    if not text or not text.strip():
        return {
            "anonymized_text": text or "",
            "entities_found": [],
            "entity_count": 0,
        }

    # Collect all detected spans: (start, end, label, original_text)
    spans: list[tuple[int, int, str, str]] = []

    # --- Pass 1: NER entities ---
    ner_entities = run_ner(text)
    for ent in ner_entities:
        # Skip IndoBERT subword tokenization artifacts (e.g. "##wai")
        if ent["word"].startswith("##"):
            continue
        label = _NER_LABEL_MAP.get(ent["entity_group"])
        if label and label in _ANONYMIZE_LABELS:
            spans.append((ent["start"], ent["end"], label, ent["word"]))

    # --- Pass 2: Regex fallback (phone, email, NIK, NIM, URL) ---
    for label, pattern in _REGEX_PATTERNS:
        for match in re.finditer(pattern, text):
            start, end = match.start(), match.end()
            matched_text = match.group()

            # Skip if this span overlaps with an already-detected NER entity
            if not _overlaps_existing(start, end, spans):
                spans.append((start, end, label, matched_text))

    # --- Pass 3: Context-aware Indonesian patterns (LOC, ORG) ---
    for label, pattern in _CONTEXT_PATTERNS:
        for match in re.finditer(pattern, text):
            start, end = match.start(), match.end()
            matched_text = match.group().strip()

            if not _overlaps_existing(start, end, spans):
                spans.append((start, end, label, matched_text))

    # --- Sort spans by position (descending) for safe replacement ---
    spans.sort(key=lambda s: s[0])

    # --- Deduplicate overlapping spans (keep longest) ---
    spans = _deduplicate_spans(spans)

    # --- Assign indexed tokens ---
    label_counters: dict[str, int] = defaultdict(int)
    # Map original text (lowered) to its assigned token for consistency
    text_to_token: dict[tuple[str, str], str] = {}

    entities_found: list[dict] = []

    for start, end, label, original in spans:
        # Reuse token if we've seen this exact text+label before
        key = (original.lower().strip(), label)
        if key in text_to_token:
            token = text_to_token[key]
        else:
            label_counters[label] += 1
            token = f"[{label}_{label_counters[label]}]"
            text_to_token[key] = token

        entities_found.append({
            "text": original,
            "label": label,
            "replacement": token,
            "start": start,
            "end": end,
        })

    # --- Replace in reverse order to preserve positions ---
    anonymized = text
    for entity in reversed(entities_found):
        s, e = entity["start"], entity["end"]
        anonymized = anonymized[:s] + entity["replacement"] + anonymized[e:]

    return {
        "anonymized_text": anonymized,
        "entities_found": [
            {"text": e["text"], "label": e["label"], "replacement": e["replacement"]}
            for e in entities_found
        ],
        "entity_count": len(entities_found),
    }


def _overlaps_existing(
    start: int, end: int, spans: list[tuple[int, int, str, str]]
) -> bool:
    """Check if a span overlaps with any existing span."""
    for s, e, _, _ in spans:
        if start < e and end > s:  # overlap check
            return True
    return False


def _deduplicate_spans(
    spans: list[tuple[int, int, str, str]],
) -> list[tuple[int, int, str, str]]:
    """Remove overlapping spans, keeping the longest one."""
    if not spans:
        return spans

    result: list[tuple[int, int, str, str]] = []
    for span in spans:
        start, end, label, text = span
        # Check if this span overlaps with any in result
        overlapping = False
        for i, (rs, re_, rl, rt) in enumerate(result):
            if start < re_ and end > rs:
                # Overlap — keep the longer one
                if (end - start) > (re_ - rs):
                    result[i] = span
                overlapping = True
                break
        if not overlapping:
            result.append(span)

    return result
