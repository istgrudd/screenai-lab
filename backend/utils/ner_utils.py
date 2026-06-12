"""NER model loading and inference utilities.

Loads the IndoBERT NER model from Hugging Face with local disk
caching to avoid re-downloading the ~1.3GB model on every startup.

The model is loaded as a singleton — first call downloads/loads,
subsequent calls return the cached pipeline.
"""

import threading
from pathlib import Path
from transformers import (
    AutoTokenizer,
    AutoModelForTokenClassification,
    pipeline,
)

from backend.config import settings

# Module-level singleton — initialized on first call to get_ner_pipeline()
_ner_pipeline = None
# Loading is called from multiple threads (startup warmup daemon thread and
# evaluation worker threads); the lock prevents loading the ~1.3 GB model
# twice concurrently, which would double the memory spike.
_ner_lock = threading.Lock()


def get_ner_pipeline():
    """Return the NER pipeline, loading/downloading on first call.

    The model is cached to `settings.ner_cache_dir` (default: ./models/ner/)
    so it only downloads once. Thread-safe: concurrent callers block until
    the single load finishes and all receive the same pipeline instance.

    Returns:
        transformers.Pipeline: A token-classification pipeline for NER.
    """
    global _ner_pipeline

    if _ner_pipeline is not None:
        return _ner_pipeline

    with _ner_lock:
        if _ner_pipeline is not None:
            return _ner_pipeline
        return _load_ner_pipeline()


def _load_ner_pipeline():
    """Load the model; must only be called while holding ``_ner_lock``."""
    global _ner_pipeline

    model_name = settings.ner_model_name
    cache_dir = settings.ner_cache_dir

    # Ensure cache directory exists
    Path(cache_dir).mkdir(parents=True, exist_ok=True)

    print(f"[NER] Loading model: {model_name}")
    print(f"[NER] Cache directory: {cache_dir}")

    tokenizer = AutoTokenizer.from_pretrained(
        model_name,
        cache_dir=cache_dir,
    )

    model = AutoModelForTokenClassification.from_pretrained(
        model_name,
        cache_dir=cache_dir,
    )

    _ner_pipeline = pipeline(
        "ner",
        model=model,
        tokenizer=tokenizer,
        aggregation_strategy="simple",
    )

    print("[NER] Model loaded successfully")
    return _ner_pipeline


def run_ner(text: str) -> list[dict]:
    """Run NER inference on the given text.

    Handles long texts by splitting into chunks that fit within
    the model's max token length (512 tokens for IndoBERT).

    Args:
        text: Input text to analyze.

    Returns:
        List of entity dicts, each with keys:
            - "word": str (the entity text)
            - "entity_group": str (e.g. "PER", "LOC", "ORG")
            - "score": float (confidence score)
            - "start": int (character offset start)
            - "end": int (character offset end)
    """
    if not text or not text.strip():
        return []

    ner = get_ner_pipeline()

    # IndoBERT has a max sequence length of 512 tokens.
    # For safety, chunk text into segments of ~1500 chars (rough estimate
    # of 512 tokens) with overlap to avoid splitting entities.
    max_chars = 1500
    overlap = 200

    if len(text) <= max_chars:
        return _run_ner_single(ner, text, offset=0)

    # Chunk with overlap
    all_entities = []
    seen_spans = set()  # track (start, end) to deduplicate overlap entities
    pos = 0

    while pos < len(text):
        chunk_end = min(pos + max_chars, len(text))
        chunk = text[pos:chunk_end]

        entities = _run_ner_single(ner, chunk, offset=pos)

        for ent in entities:
            span_key = (ent["start"], ent["end"])
            if span_key not in seen_spans:
                seen_spans.add(span_key)
                all_entities.append(ent)

        if chunk_end >= len(text):
            break
        pos += max_chars - overlap

    # Sort by position
    all_entities.sort(key=lambda e: e["start"])
    return all_entities


def _run_ner_single(ner_pipeline, text: str, offset: int = 0) -> list[dict]:
    """Run NER on a single text chunk and adjust offsets.

    Args:
        ner_pipeline: The loaded NER pipeline.
        text: Text chunk to process.
        offset: Character offset to add to entity positions
                (when processing chunks of a larger document).

    Returns:
        List of entity dicts with adjusted start/end positions.
    """
    try:
        results = ner_pipeline(text)
    except Exception as e:
        print(f"[NER] Warning: inference failed on chunk: {e}")
        return []

    entities = []
    for ent in results:
        # Filter low-confidence detections
        if ent["score"] < 0.5:
            continue

        entities.append({
            "word": ent["word"].strip(),
            "entity_group": ent["entity_group"],
            "score": round(float(ent["score"]), 4),
            "start": ent["start"] + offset,
            "end": ent["end"] + offset,
        })

    return entities
