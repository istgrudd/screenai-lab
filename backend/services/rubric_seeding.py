"""Idempotent seed of one empty rubric per MBC Laboratory division.

Runs at application startup so recruiters always find a rubric waiting for
each of the four divisions. "Empty" here means: no dimensions yet — the
recruiter configures them via the existing rubric editor UI. We only create
a rubric for a division if no rubric with that division already exists.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from backend.models.application import Division
from backend.models.rubric import Rubric


_DIVISION_LABELS: dict[Division, tuple[str, str, str]] = {
    # (display_name, position, description)
    Division.BIG_DATA: (
        "Big Data Rubric",
        "Big Data Division",
        "Default rubric for Big Data division candidates. "
        "Recruiter: add dimensions before running evaluation.",
    ),
    Division.CYBER_SECURITY: (
        "Cyber Security Rubric",
        "Cyber Security Division",
        "Default rubric for Cyber Security division candidates. "
        "Recruiter: add dimensions before running evaluation.",
    ),
    Division.GAME_TECH: (
        "Game Technology Rubric",
        "Game Technology Division",
        "Default rubric for Game Technology division candidates. "
        "Recruiter: add dimensions before running evaluation.",
    ),
    Division.GIS: (
        "GIS Rubric",
        "GIS Division",
        "Default rubric for GIS division candidates. "
        "Recruiter: add dimensions before running evaluation.",
    ),
}


def seed_division_rubrics(db: Session) -> list[str]:
    """Ensure one rubric exists per division. Returns the list of divisions created this call."""
    created: list[str] = []
    for division, (name, position, description) in _DIVISION_LABELS.items():
        exists = (
            db.query(Rubric).filter(Rubric.division == division.value).first()
        )
        if exists:
            continue
        db.add(
            Rubric(
                name=name,
                position=position,
                division=division.value,
                description=description,
            )
        )
        created.append(division.value)
    if created:
        db.commit()
    return created
