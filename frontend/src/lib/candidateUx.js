import {
  documentCompleteness,
  formatDivision,
} from "@/lib/candidateApplication";
import { getPhaseLabel } from "@/lib/phaseMaps";

export const WAITING_APPLICATION_STATUSES = new Set([
  "submitted",
  "document_review",
  "verified",
  "screening",
  "evaluated",
]);

export function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function formatFileSize(bytes) {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function parseDateTimeWithUtcFallback(value) {
  if (value instanceof Date) return value;
  if (typeof value !== "string") return new Date(value);

  const text = value.trim();
  if (!text) return null;

  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const hasTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalized);

  if (hasTime && !hasTimezone) {
    return new Date(`${normalized}Z`);
  }

  return new Date(text);
}

export function formatDateTimeId(value, empty = "-") {
  if (!value) return empty;
  const date = parseDateTimeWithUtcFallback(value);
  if (Number.isNaN(date.getTime())) return empty;
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeLeftText(targetIso, now = new Date()) {
  if (!targetIso) return null;
  const target = new Date(targetIso);
  if (Number.isNaN(target.getTime())) return null;

  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return "Deadline telah lewat";

  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const minuteMs = 60 * 1000;
  const days = Math.floor(ms / dayMs);
  const hours = Math.floor((ms % dayMs) / hourMs);
  const minutes = Math.floor((ms % hourMs) / minuteMs);

  if (days > 0) return `${days} hari ${hours} jam lagi`;
  if (hours > 0) return `${hours} jam ${minutes} menit lagi`;
  return `${Math.max(1, minutes)} menit lagi`;
}

function phaseDates(period) {
  const phases = period?.phases || {};
  return {
    submissionEnd: phases?.submission?.end || period?.submission_end_date,
    evaluationEnd: phases?.evaluation?.end || period?.evaluation_end_date,
    announcementEnd: phases?.announcement?.end || period?.end_date,
    start: phases?.submission?.start || period?.start_date,
  };
}

export function periodDeadlineContext(period) {
  if (!period) {
    return {
      phase: null,
      phaseLabel: "Tidak ada periode aktif",
      deadlineLabel: "Periode",
      deadlineText: "Tidak ada periode rekrutasi aktif saat ini.",
      countdown: null,
    };
  }

  const phase = period.current_phase || null;
  const dates = phaseDates(period);
  const phaseLabel = getPhaseLabel(phase);
  let target = null;
  let deadlineLabel = "Periode";

  if (phase === "UPCOMING") {
    target = dates.start;
    deadlineLabel = "Dibuka";
  } else if (phase === "SUBMISSION") {
    target = dates.submissionEnd;
    deadlineLabel = "Batas submit";
  } else if (phase === "EVALUATION") {
    target = dates.evaluationEnd;
    deadlineLabel = "Batas evaluasi";
  } else if (phase === "ANNOUNCEMENT") {
    target = dates.announcementEnd;
    deadlineLabel = "Jadwal pengumuman";
  } else if (phase === "CLOSED") {
    target = dates.announcementEnd;
    deadlineLabel = "Ditutup";
  }

  return {
    phase,
    phaseLabel,
    deadlineLabel,
    deadlineText: target
      ? `${deadlineLabel}: ${formatDateTimeId(target)}`
      : `Fase aktif: ${phaseLabel}`,
    countdown: timeLeftText(target),
  };
}

export function candidateNextAction(application, documents = []) {
  const completeness = documentCompleteness(documents);

  if (!application) {
    return {
      label: "Mulai Pendaftaran",
      to: "/application/start",
      title: "Mulai pendaftaran",
      description:
        "Pilih divisi yang kamu tuju, lalu buat draft pendaftaran sebelum mengunggah dokumen.",
      tone: "brand",
    };
  }

  const status = application.status;

  if (status === "correction_requested") {
    return {
      label: "Perbaiki Dokumen",
      to: "/documents",
      title: "Dokumen perlu revisi",
      description:
        "Buka catatan reviewer dan unggah ulang hanya dokumen yang ditolak.",
      tone: "warning",
    };
  }

  if (status === "announced_pass" || status === "announced_fail") {
    return {
      label: "Cek Pengumuman",
      to: "/application/status",
      title:
        status === "announced_pass"
          ? "Hasil seleksi sudah tersedia"
          : "Pengumuman sudah dipublikasikan",
      description:
        status === "announced_pass"
          ? "Selamat, kamu dapat melihat hasil dan catatan pengumuman di halaman status."
          : "Terima kasih sudah mengikuti proses seleksi MBC Laboratory.",
      tone: status === "announced_pass" ? "success" : "destructive",
    };
  }

  if (status === "draft") {
    if (completeness.complete) {
      return {
        label: "Tinjau & Kirim Pendaftaran",
        to: "/application/review",
        title: "Pendaftaran siap ditinjau",
        description:
          "Semua dokumen wajib sudah ada. Tinjau data dan kirim pendaftaran final.",
        tone: "success",
      };
    }

    return {
      label: "Lanjut Unggah Dokumen",
      to: "/documents",
      title: "Lengkapi dokumen wajib",
      description:
        completeness.missing.length > 0
          ? `Masih ada ${completeness.missing.length} dokumen wajib yang belum diunggah.`
          : "Lanjutkan unggah dokumen sebelum submit final.",
      tone: "brand",
    };
  }

  if (WAITING_APPLICATION_STATUSES.has(status)) {
    return {
      label: "Lihat Status Pendaftaran",
      to: "/application/status",
      title: "Pendaftaran sedang diproses",
      description:
        "Tidak ada aksi tambahan saat ini. Pantau status seleksi dan pengumuman dari halaman status.",
      tone: "info",
    };
  }

  return {
    label: "Lihat Status Pendaftaran",
    to: "/application/status",
    title: "Pantau pendaftaran",
    description: "Buka halaman status untuk melihat perkembangan terbaru.",
    tone: "info",
  };
}

export function candidateStatusCopy(application, documents = [], announcement = null) {
  const action = candidateNextAction(application, documents);
  const completeness = documentCompleteness(documents);

  if (!application) {
    return {
      title: "Pendaftaran belum dimulai",
      description:
        "Mulai dari memilih divisi MBC Laboratory. Setelah draft dibuat, kamu bisa melengkapi dokumen secara bertahap.",
      statusLabel: "Belum Mulai",
      tone: "brand",
    };
  }

  const status = application.status;
  if (status === "draft") {
    return {
      title: action.title,
      description: completeness.complete
        ? "Dokumen wajib sudah lengkap. Langkah berikutnya adalah meninjau data dan mengirim pendaftaran final."
        : action.description,
      statusLabel: "Draft",
      tone: completeness.complete ? "success" : "brand",
    };
  }

  if (status === "correction_requested") {
    return {
      title: "Perbaikan dokumen diminta",
      description:
        "Recruiter menemukan dokumen yang perlu diganti. Periksa catatan pada dokumen yang ditolak dan unggah ulang file yang benar.",
      statusLabel: "Perlu Revisi",
      tone: "warning",
    };
  }

  if (status === "announced_pass") {
    return {
      title: "Selamat, kamu lolos seleksi",
      description:
        announcement?.notes ||
        "Hasil seleksi sudah diumumkan. Pantau instruksi lanjutan dari tim MBC Laboratory.",
      statusLabel: "Lolos",
      tone: "success",
    };
  }

  if (status === "announced_fail") {
    return {
      title: "Hasil seleksi sudah diumumkan",
      description:
        announcement?.notes ||
        "Terima kasih sudah mendaftar. Kamu belum lolos pada periode seleksi ini.",
      statusLabel: "Tidak Lolos",
      tone: "destructive",
    };
  }

  if (status === "document_review") {
    return {
      title: "Dokumen sedang direview",
      description:
        "Tim recruiter sedang memeriksa kelengkapan dokumen. Kamu akan diminta revisi jika ada dokumen yang belum sesuai.",
      statusLabel: "Review Dokumen",
      tone: "info",
    };
  }

  if (status === "verified") {
    return {
      title: "Dokumen sudah terverifikasi",
      description:
        "Kelengkapan dokumen sudah diterima. Pendaftaran akan masuk ke tahap evaluasi saat fase berjalan.",
      statusLabel: "Terverifikasi",
      tone: "success",
    };
  }

  if (status === "screening" || status === "evaluated") {
    return {
      title: status === "evaluated" ? "Evaluasi selesai" : "Sedang dievaluasi",
      description:
        "Pendaftaranmu sudah masuk tahap evaluasi. Hasil akhir akan tersedia saat pengumuman dipublikasikan.",
      statusLabel: status === "evaluated" ? "Terevaluasi" : "Sedang Dievaluasi",
      tone: "info",
    };
  }

  return {
    title: action.title,
    description: action.description,
    statusLabel: status ? formatDivision(status) : "Status tidak diketahui",
    tone: action.tone,
  };
}

export function documentStatusInfo(document) {
  if (!document) {
    return {
      status: "missing",
      label: "Belum Ada",
      tone: "neutral",
      title: "Belum diunggah",
    };
  }

  const status = document.verification_status || "uploaded";
  if (status === "verified") {
    return {
      status,
      label: "Terverifikasi",
      tone: "success",
      title: "Dokumen disetujui",
    };
  }
  if (status === "rejected") {
    return {
      status,
      label: "Ditolak",
      tone: "destructive",
      title: "Perlu diganti",
    };
  }
  if (status === "correction_requested") {
    return {
      status,
      label: "Perlu Revisi",
      tone: "warning",
      title: "Perlu revisi",
    };
  }
  if (status === "pending") {
    return {
      status,
      label: "Menunggu",
      tone: "neutral",
      title: "Menunggu review",
    };
  }

  return {
    status: "uploaded",
    label: "Terunggah",
    tone: "info",
    title: "Sudah diunggah",
  };
}
