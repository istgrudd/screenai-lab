"""Score computation and aggregation service.

Handles storing RAG pipeline results into the database:
- Creates DimensionScore records for each candidate × dimension
- Updates the candidate's composite_score and profile_summary
- Updates candidate status to 'scored'
- Maps language certificate scores to CEFR levels and bonus points
"""

from sqlalchemy.orm import Session

from backend.models.candidate import Candidate, DimensionScore
from backend.models.rubric import Dimension, Rubric


def validate_rubric_weights(rubric: Rubric) -> None:
    """Guard composite-score arithmetic against malformed rubrics.

    The composite formula assumes ``weight ∈ (0, 1]`` and the dimension
    weights for a rubric sum to 1.0 (so ``Σ score × weight`` lands in
    [0, 100]). Rubric CRUD already enforces this on write, but a manual
    DB edit or a half-migrated rubric can desync — and a desynced rubric
    will silently produce off-scale composite scores. Raising early
    surfaces the bug to the recruiter as a clean 400 instead.

    Tolerance is ±0.01 to absorb float-sum rounding.
    """
    total_weight = sum(d.weight for d in rubric.dimensions)
    if not (0.99 <= total_weight <= 1.01):
        raise ValueError(
            f"Rubric weights must sum to 1.0, got {total_weight}"
        )


# --- CEFR mapping for EPrT TOTAL SCORE -> (level, bonus) ---
# Ranges chosen to be continuous (gaps in the spec are filled by
# extending the next band downward, e.g. 458-459 -> A2).
_CEFR_BANDS = [
    (627, 677, "C1", 8.0),
    (543, 626, "B2", 6.0),
    (460, 542, "B1", 4.0),
    (337, 459, "A2", 2.0),
    (0,   336, "A1", 0.0),
]


def cefr_from_score(score: int | None) -> tuple[str | None, float]:
    """Map a raw EPrT score to (CEFR level, bonus points).

    No certificate (score is None) returns (None, 0.0) — candidates
    without a certificate are not penalized.
    """
    if score is None:
        return None, 0.0
    for low, high, level, bonus in _CEFR_BANDS:
        if low <= score <= high:
            return level, bonus
    return None, 0.0


def store_evaluation_results(
    candidate_id: int,
    rubric_id: int,
    evaluation: dict,
    db: Session,
) -> None:
    """Store RAG pipeline evaluation results in the database.

    Args:
        candidate_id: ID of the candidate being scored.
        rubric_id: ID of the rubric used for evaluation.
        evaluation: Output from rag_pipeline.evaluate_candidate().
        db: Database session.
    """
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise ValueError(f"Candidate {candidate_id} not found")

    # --- Delete any existing scores for this candidate + rubric ---
    db.query(DimensionScore).filter(
        DimensionScore.candidate_id == candidate_id,
        DimensionScore.rubric_id == rubric_id,
    ).delete()
    db.flush()

    # --- Create DimensionScore records ---
    for dim_score in evaluation.get("dimension_scores", []):
        # Find the dimension ID by name
        dimension = (
            db.query(Dimension)
            .filter(
                Dimension.rubric_id == rubric_id,
                Dimension.name == dim_score["dimension"],
            )
            .first()
        )

        if not dimension:
            # Try case-insensitive match
            dimension = (
                db.query(Dimension)
                .filter(Dimension.rubric_id == rubric_id)
                .all()
            )
            dimension = next(
                (d for d in dimension if d.name.lower() == dim_score["dimension"].lower()),
                None,
            )

        if not dimension:
            print(f"[SCORING] Warning: dimension '{dim_score['dimension']}' not found in rubric {rubric_id}, skipping")
            continue

        score_record = DimensionScore(
            candidate_id=candidate_id,
            dimension_id=dimension.id,
            rubric_id=rubric_id,
            score=dim_score["score"],
            weighted_score=dim_score["weighted_score"],
            justification=dim_score.get("justification", ""),
            evidence_json=dim_score.get("evidence", []),
            is_override=False,
        )
        db.add(score_record)

    # --- Apply language certificate bonus ---
    _, language_bonus = cefr_from_score(candidate.language_score)
    candidate.language_bonus = language_bonus

    # --- Update candidate ---
    weighted_total = evaluation.get("composite_score", 0.0)
    candidate.composite_score = round(weighted_total + language_bonus, 2)
    candidate.profile_summary = evaluation.get("profile_summary", "")
    candidate.status = "scored"

    db.flush()
