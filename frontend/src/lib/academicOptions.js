// Single source of truth for the academic dropdown options used by the
// candidate Register and Profile forms.
//
// IMPORTANT: faculty and major names are the official Telkom University
// program names in Bahasa Indonesia. They are sent verbatim to the backend
// and shown to recruiters, so DO NOT translate or re-case them.
//
// This is a frontend-only consistency guard. The backend still accepts
// free-text strings, so legacy/stored values that are not in these lists are
// rendered as-is by the form components (see FacultyMajorSelect / YearSelect).

// Allowed intake years (angkatan), newest first.
// To open the next intake, just add the new year to the front of this array,
// e.g. [2026, 2025, 2024].
export const ALLOWED_YEARS = [2025, 2024];

// Ordered list of faculty names (Bahasa Indonesia, verbatim).
export const FACULTIES = [
  "Fakultas Teknik Elektro",
  "Fakultas Informatika",
  "Fakultas Rekayasa Industri",
  "Fakultas Ekonomi dan Bisnis",
  "Fakultas Komunikasi dan Ilmu Sosial",
  "Fakultas Industri Kreatif",
  "Fakultas Ilmu Terapan",
];

// Each faculty maps to its ordered list of majors (Bahasa Indonesia, verbatim).
export const MAJORS_BY_FACULTY = {
  "Fakultas Teknik Elektro": [
    "S1 Teknik Elektro",
    "S1 Teknik Telekomunikasi",
    "S1 Teknik Fisika",
    "S1 Teknik Komputer",
    "S1 Teknik Biomedis",
    "S1 Teknik Sistem Energi",
  ],
  "Fakultas Informatika": [
    "S1 Informatika",
    "S1 Sains Data",
    "S1 Rekayasa Perangkat Lunak",
    "S1 Teknologi Informasi",
  ],
  "Fakultas Rekayasa Industri": [
    "S1 Teknik Industri",
    "S1 Sistem Informasi",
    "S1 Teknik Logistik",
    "S1 Manajemen Rekayasa",
  ],
  "Fakultas Ekonomi dan Bisnis": [
    "S1 Akuntansi",
    "S1 Administrasi Bisnis",
    "S1 Bisnis Digital",
    "S1 Manajemen Bisnis Telekomunikasi Informatika",
    "S1 Manajemen Bisnis Rekreasi",
  ],
  "Fakultas Komunikasi dan Ilmu Sosial": [
    "S1 Ilmu Komunikasi",
    "S1 Hubungan Masyarakat",
    "S1 Digital Content Broadcasting",
    "S1 Psikologi",
  ],
  "Fakultas Industri Kreatif": [
    "S1 Desain Produk",
    "S1 Desain Komunikasi Visual",
    "S1 Desain Interior",
    "S1 Kriya Tekstil dan Fashion",
    "S1 Seni Rupa",
    "S1 Film dan Animasi",
  ],
  "Fakultas Ilmu Terapan": [
    "D3 Teknik Telekomunikasi",
    "D3 Rekayasa Perangkat Lunak Aplikasi",
    "D3 Sistem Informasi",
    "D3 Sistem Informasi Akuntansi",
    "D3 Teknologi Komputer",
    "D3 Digital Marketing",
    "D3 Hospitality & Culinary Art",
    "D3 Manajemen Pemasaran",
    "S1 Terapan Digital Creative Multimedia",
    "S1 Terapan Sistem Informasi Kota Cerdas",
    "S1 Rekayasa Multimedia",
  ],
};

// Returns the ordered majors for a faculty, or [] if the faculty is unknown.
export function getMajorsForFaculty(faculty) {
  if (!faculty) return [];
  return MAJORS_BY_FACULTY[faculty] || [];
}
