"""Rubric-augmented LLM scoring service.

Evaluates a candidate's anonymized text against a rubric using:
1. Direct rubric context construction from database dimensions + indicators.
2. Prompt augmentation with candidate text + rubric context.
3. LLM inference via the configured DeepSeek model for structured scoring.

Note: despite the historical filename, the current production path does not
perform live vector retrieval from ChromaDB. LangChain/ChromaDB remain available
for compatibility/future retrieval, while this module inlines rubric context
directly into the prompt.
"""

from sqlalchemy.orm import Session

from backend.models.rubric import Rubric, Dimension
from backend.utils.llm_client import call_llm_json


# ---------------------------------------------------------------------------
# System prompt — instructs the LLM on its role, rules, and output format
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """Kamu adalah sistem evaluasi CV otomatis untuk proses rekrutasi.

PERAN:
Kamu mengevaluasi CV kandidat terhadap rubrik kualifikasi yang diberikan rekruter. Kamu memberikan skor objektif per dimensi kompetensi berdasarkan HANYA bukti yang ditemukan dalam teks CV.

ATURAN KETAT:
1. Evaluasi HANYA berdasarkan teks CV yang diberikan. JANGAN mengarang atau mengasumsikan informasi yang tidak ada dalam CV.
2. Setiap skor HARUS disertai justifikasi yang mengutip bukti langsung dari teks CV.
3. Jika tidak ada bukti untuk suatu indikator, berikan skor rendah untuk indikator tersebut dan jelaskan bahwa bukti tidak ditemukan.
4. Skor menggunakan skala 0-100 per dimensi.
5. Evidence harus berupa kutipan langsung atau parafrase dekat dari teks CV.
6. CV mungkin dalam Bahasa Indonesia — evaluasi sesuai bahasa aslinya.
7. Kandidat adalah fresh graduate / entry-level — proyek akademik, tugas kuliah, skripsi, dan peran organisasi adalah bukti valid.
8. Teks CV sudah dianonimisasi — abaikan token seperti [PERSON_1], [ORG_1], [LOC_1], dll.
9. Profile summary HARUS ditulis dalam Bahasa Indonesia.

FORMAT OUTPUT:
Kamu HARUS merespons dalam format JSON yang valid (tanpa markdown code fence). Struktur JSON:

{
  "dimension_scores": [
    {
      "dimension": "<nama dimensi yang tepat>",
      "score": <angka 0-100>,
      "justification": "<penjelasan mengapa skor ini diberikan, dalam Bahasa Indonesia>",
      "evidence": ["<kutipan 1 dari CV>", "<kutipan 2 dari CV>"]
    }
  ],
  "profile_summary": "<ringkasan profil kandidat dalam 2-3 paragraf, dalam Bahasa Indonesia>"
}

PANDUAN SKOR:
- 0-20: Tidak ada bukti relevan ditemukan dalam CV
- 21-40: Bukti minimal atau sangat terbatas
- 41-60: Bukti cukup, menunjukkan kompetensi dasar
- 61-80: Bukti kuat, menunjukkan kompetensi yang baik
- 81-100: Bukti sangat kuat dan beragam, menunjukkan kompetensi luar biasa"""


def _build_rubric_context(rubric: Rubric) -> str:
    """Build direct rubric context string for the prompt."""
    lines = [
        f"RUBRIK EVALUASI: {rubric.name}",
        f"POSISI: {rubric.position}",
        "",
    ]

    for dim in rubric.dimensions:
        lines.append(f"--- DIMENSI: {dim.name} (Bobot: {dim.weight * 100:.0f}%) ---")
        if dim.description:
            lines.append(f"Deskripsi: {dim.description}")
        if dim.indicators:
            lines.append("Indikator yang dicari:")
            for indicator in dim.indicators:
                lines.append(f"  - {indicator}")
        lines.append("")

    return "\n".join(lines)


def _build_user_prompt(anonymized_cv: str, rubric_context: str) -> str:
    """Build the user prompt with candidate text and rubric context."""
    return f"""{rubric_context}

========================================
TEKS CV KANDIDAT (SUDAH DIANONIMISASI):
========================================

{anonymized_cv}

========================================

Evaluasi CV kandidat ini terhadap semua dimensi dalam rubrik di atas.
Berikan skor, justifikasi, dan bukti kutipan untuk setiap dimensi.
Tulis profile_summary dalam Bahasa Indonesia.
Respons dalam format JSON yang valid."""


async def evaluate_candidate(
    anonymized_cv: dict,
    rubric_id: int,
    db: Session,
    certificate_data: dict | None = None,
) -> dict:
    """Evaluate a candidate's text with rubric-augmented LLM scoring.

    Args:
        anonymized_cv: Dict with at minimum "anonymized_text" key.
        rubric_id: ID of the rubric to evaluate against.
        db: Database session.
        certificate_data: Optional certificate info (EPrT score, etc.)

    Returns:
        {
            "composite_score": float,          # 0-100
            "dimension_scores": [
                {
                    "dimension": str,
                    "score": float,            # 0-100
                    "weight": float,           # 0.0-1.0
                    "weighted_score": float,
                    "justification": str,
                    "evidence": [str]
                }
            ],
            "profile_summary": str,
            "raw_llm_response": str
        }
    """
    # --- 1. Load rubric with dimensions ---
    rubric = db.query(Rubric).filter(Rubric.id == rubric_id).first()
    if not rubric:
        raise ValueError(f"Rubric {rubric_id} not found")

    if not rubric.dimensions:
        raise ValueError(f"Rubric {rubric_id} has no dimensions")

    # --- 2. Build prompts ---
    rubric_context = _build_rubric_context(rubric)

    cv_text = anonymized_cv.get("anonymized_text", "")
    if not cv_text:
        raise ValueError("No anonymized text provided for evaluation")

    # Append certificate data if available
    if certificate_data:
        cv_text += f"\n\nDATA SERTIFIKAT BAHASA:\n{_format_cert_data(certificate_data)}"

    user_prompt = _build_user_prompt(cv_text, rubric_context)

    # --- 3. Call LLM ---
    llm_response = call_llm_json(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.1,
        max_tokens=4096,
    )

    # --- 4. Process and validate response ---
    result = _process_llm_response(llm_response, rubric)

    return result


def _process_llm_response(llm_response: dict, rubric: Rubric) -> dict:
    """Process the LLM response into the standardized output format.

    Validates structure, matches dimensions to rubric, and computes
    weighted scores.
    """
    raw_scores = llm_response.get("dimension_scores", [])
    profile_summary = llm_response.get("profile_summary", "")

    # Build a map of rubric dimensions for lookup
    dim_map: dict[str, Dimension] = {}
    for dim in rubric.dimensions:
        dim_map[dim.name.lower()] = dim

    dimension_scores = []
    composite_score = 0.0

    for raw_score in raw_scores:
        dim_name = raw_score.get("dimension", "")
        score = float(raw_score.get("score", 0))
        justification = raw_score.get("justification", "")
        evidence = raw_score.get("evidence", [])

        # Clamp score to 0-100
        score = max(0.0, min(100.0, score))

        # Find matching dimension in rubric
        matched_dim = dim_map.get(dim_name.lower())
        if matched_dim:
            weight = matched_dim.weight
        else:
            # Try fuzzy match — dimension name might differ slightly
            weight = _fuzzy_match_weight(dim_name, rubric.dimensions)

        weighted_score = score * weight
        composite_score += weighted_score

        dimension_scores.append({
            "dimension": dim_name,
            "score": round(score, 1),
            "weight": round(weight, 2),
            "weighted_score": round(weighted_score, 2),
            "justification": justification,
            "evidence": evidence if isinstance(evidence, list) else [evidence],
        })

    # Check for missing dimensions — fill with zeros
    scored_dims = {ds["dimension"].lower() for ds in dimension_scores}
    for dim in rubric.dimensions:
        if dim.name.lower() not in scored_dims:
            dimension_scores.append({
                "dimension": dim.name,
                "score": 0.0,
                "weight": round(dim.weight, 2),
                "weighted_score": 0.0,
                "justification": "Dimensi ini tidak dievaluasi oleh model.",
                "evidence": [],
            })

    return {
        "composite_score": round(composite_score, 2),
        "dimension_scores": dimension_scores,
        "profile_summary": profile_summary,
        "raw_llm_response": str(llm_response),
    }


def _fuzzy_match_weight(dim_name: str, dimensions: list[Dimension]) -> float:
    """Try to match a dimension name to a rubric dimension by partial match."""
    name_lower = dim_name.lower()
    for dim in dimensions:
        if dim.name.lower() in name_lower or name_lower in dim.name.lower():
            return dim.weight
    # Default: equal weight
    return 1.0 / max(len(dimensions), 1)


def _format_cert_data(cert_data: dict) -> str:
    """Format certificate data for inclusion in the prompt."""
    lines = []
    for key, value in cert_data.items():
        lines.append(f"- {key}: {value}")
    return "\n".join(lines)
