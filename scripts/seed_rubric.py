"""Seed a default rubric for the "Junior Data Analyst" position.

Usage:
    python -m scripts.seed_rubric

This script can be run multiple times — it checks if the rubric
already exists before creating it.
"""

import sys
import os

# Add project root to path so we can import backend modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal, init_db
from backend.models.rubric import Rubric, Dimension
import backend.models  # noqa: F401 — register models with Base


RUBRIC_DATA = {
    "name": "Cyber Security Rubric",
    "position": "Cyber Security Division",
    "description": (
        "Rubrik evaluasi calon asisten laboratorium Cyber Security. "
        "Fokus pada ketahanan sistem (Cyber Defense), etika peretasan (Ethical Hacking), "
        "serta integritas dan kolaborasi tim (Secure & Happy Culture)."
    ),
    "division": "cyber_security",
    "dimensions": [
        {
            "name": "Technical & Security Foundation",
            "weight": 0.35,
            "description": (
                "Kemampuan teknis dasar dalam infrastruktur jaringan, "
                "sistem operasi (Linux), dan logika keamanan informasi."
            ),
            "indicators": [
                "Linux System Administration (Command Line, Permissions)",
                "Networking Protocols (TCP/IP, DNS, HTTP/S, SSL/TLS)",
                "Basic Security Concepts (CIA Triad: Confidentiality, Integrity, Availability)",
                "Familiaritas dengan security tools (Nmap, Wireshark, Metasploit, atau Burp Suite)",
                "Pemahaman dasar pemrograman untuk scripting (Python, Bash, atau PowerShell)",
                "Pengetahuan tentang OWASP Top 10 atau kerentanan umum (Vulnerability Assessment)"
            ],
        },
        {
            "name": "Analytical Thinking & Incident Logic",
            "weight": 0.25,
            "description": (
                "Menilai cara kandidat menganalisis ancaman dan mendokumentasikan temuan. "
                "Penting untuk riset keamanan (Scientific) dan audit sistem (Innovation)."
            ),
            "indicators": [
                "Pengalaman dalam kompetisi CTF (Capture The Flag) atau bug bounty",
                "Logika investigasi (kemampuan menganalisis root cause dari sebuah attack)",
                "Kemampuan dokumentasi teknis (Write-up solusi tantangan atau laporan audit)",
                "Pemahaman metodologi riset di bidang keamanan (misal: Forensik digital atau Malware analysis)",
                "Kerapian dalam mendokumentasikan konfigurasi sistem/jaringan"
            ],
        },
        {
            "name": "Continuous Learning & Ethics (Cyber Growth)",
            "weight": 0.25,
            "description": (
                "Dunia cyber berubah sangat cepat. Mencari kandidat yang proaktif "
                "memperbarui skill dan memiliki integritas moral tinggi."
            ),
            "indicators": [
                "Sertifikasi mandiri (CompTIA Security+, CEH, TryHackMe, HTB, atau Cisco)",
                "Eksplorasi teknologi baru (Cloud Security, IoT Security, atau AI for Security)",
                "Pemahaman mengenai etika profesi dan legalitas (tidak menyalahgunakan skill)",
                "Konsistensi belajar melalui platform lab virtual atau komunitas",
                "Keinginan untuk edukasi publik (Cyber Awareness sharing)"
            ],
        },
        {
            "name": "Communication & Professional Integrity",
            "weight": 0.15,
            "description": (
                "Memastikan kandidat komunikatif dalam menjelaskan risiko "
                "dan dapat dipercaya dalam menangani data sensitif lab."
            ),
            "indicators": [
                "Kemampuan menjelaskan risiko teknis kepada orang non-teknis",
                "Pengalaman kerja sama tim dalam proyek infrastruktur atau event",
                "Tingkat kejujuran dan tanggung jawab dalam laporan (Integritas)",
                "Kesesuaian dengan budaya lab yang suportif dan saling menjaga (No-blame culture)",
                "Keterlibatan dalam komunitas cybersecurity atau organisasi kampus"
            ],
        },
    ],
}


def seed_rubric():
    """Create the default Junior Data Analyst rubric if it doesn't exist."""
    init_db()
    db = SessionLocal()

    try:
        # Check if rubric already exists
        existing = (
            db.query(Rubric)
            .filter(Rubric.position == RUBRIC_DATA["position"])
            .first()
        )

        if existing:
            print(f"[SKIP] Rubric for '{RUBRIC_DATA['position']}' already exists (id={existing.id})")
            return existing.id

        # Create rubric
        rubric = Rubric(
            name=RUBRIC_DATA["name"],
            position=RUBRIC_DATA["position"],
            description=RUBRIC_DATA["description"],
        )
        db.add(rubric)
        db.flush()

        # Create dimensions
        for dim_data in RUBRIC_DATA["dimensions"]:
            dim = Dimension(
                rubric_id=rubric.id,
                name=dim_data["name"],
                weight=dim_data["weight"],
                description=dim_data["description"],
                indicators=dim_data["indicators"],
            )
            db.add(dim)

        db.commit()
        print(f"[OK] Rubric created: '{rubric.name}' (id={rubric.id})")
        print(f"     Position: {rubric.position}")
        print(f"     Dimensions: {len(RUBRIC_DATA['dimensions'])}")
        for dim_data in RUBRIC_DATA["dimensions"]:
            print(f"       - {dim_data['name']} ({dim_data['weight']*100:.0f}%)")

        return rubric.id

    finally:
        db.close()


if __name__ == "__main__":
    seed_rubric()
