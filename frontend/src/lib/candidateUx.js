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
  return date.toLocaleString("en-GB", {
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
  if (ms <= 0) return "Deadline has passed";

  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const minuteMs = 60 * 1000;
  const days = Math.floor(ms / dayMs);
  const hours = Math.floor((ms % dayMs) / hourMs);
  const minutes = Math.floor((ms % hourMs) / minuteMs);

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${Math.max(1, minutes)}m left`;
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
      phaseLabel: "No active period",
      deadlineLabel: "Period",
      deadlineText: "There is no active recruitment period right now.",
      countdown: null,
    };
  }

  const phase = period.current_phase || null;
  const dates = phaseDates(period);
  const phaseLabel = getPhaseLabel(phase);
  let target = null;
  let deadlineLabel = "Period";

  if (phase === "UPCOMING") {
    target = dates.start;
    deadlineLabel = "Opens";
  } else if (phase === "SUBMISSION") {
    target = dates.submissionEnd;
    deadlineLabel = "Submission deadline";
  } else if (phase === "EVALUATION") {
    target = dates.evaluationEnd;
    deadlineLabel = "Evaluation deadline";
  } else if (phase === "ANNOUNCEMENT") {
    target = dates.announcementEnd;
    deadlineLabel = "Announcement schedule";
  } else if (phase === "CLOSED") {
    target = dates.announcementEnd;
    deadlineLabel = "Closed";
  }

  return {
    phase,
    phaseLabel,
    deadlineLabel,
    deadlineText: target
      ? `${deadlineLabel}: ${formatDateTimeId(target)}`
      : `Active phase: ${phaseLabel}`,
    countdown: timeLeftText(target),
  };
}

export function candidateNextAction(application, documents = []) {
  const completeness = documentCompleteness(documents);

  if (!application) {
    return {
      label: "Start Application",
      to: "/application/start",
      title: "Start your application",
      description:
        "Choose your target division, then create a draft application before uploading documents.",
      tone: "brand",
    };
  }

  const status = application.status;

  if (status === "correction_requested") {
    return {
      label: "Fix Documents",
      to: "/documents",
      title: "Documents need revision",
      description:
        "Open the reviewer notes and re-upload only the rejected documents.",
      tone: "warning",
    };
  }

  if (status === "announced_pass" || status === "announced_fail") {
    return {
      label: "Check Announcement",
      to: "/application/status",
      title:
        status === "announced_pass"
          ? "Your result is available"
          : "The announcement has been published",
      description:
        status === "announced_pass"
          ? "Congratulations — you can view your result and the announcement notes on the status page."
          : "Thank you for taking part in the MBC Laboratory selection process.",
      tone: status === "announced_pass" ? "success" : "destructive",
    };
  }

  if (status === "draft") {
    if (completeness.complete) {
      return {
        label: "Review & Submit",
        to: "/application/review",
        title: "Your application is ready to review",
        description:
          "All required documents are in. Review your details and submit the final application.",
        tone: "success",
      };
    }

    return {
      label: "Continue Uploading Documents",
      to: "/documents",
      title: "Complete the required documents",
      description:
        completeness.missing.length > 0
          ? `${completeness.missing.length} required documents are still missing.`
          : "Keep uploading documents before the final submit.",
      tone: "brand",
    };
  }

  if (WAITING_APPLICATION_STATUSES.has(status)) {
    return {
      label: "View Application Status",
      to: "/application/status",
      title: "Your application is being processed",
      description:
        "Nothing else to do right now. Track the selection status and announcement from the status page.",
      tone: "info",
    };
  }

  return {
    label: "View Application Status",
    to: "/application/status",
    title: "Track your application",
    description: "Open the status page to see the latest updates.",
    tone: "info",
  };
}

export function candidateStatusCopy(application, documents = [], announcement = null) {
  const action = candidateNextAction(application, documents);
  const completeness = documentCompleteness(documents);

  if (!application) {
    return {
      title: "Application not started",
      description:
        "Start by choosing an MBC Laboratory division. Once the draft is created, you can complete the documents step by step.",
      statusLabel: "Not Started",
      tone: "brand",
    };
  }

  const status = application.status;
  if (status === "draft") {
    return {
      title: action.title,
      description: completeness.complete
        ? "All required documents are complete. The next step is to review your details and submit the final application."
        : action.description,
      statusLabel: "Draft",
      tone: completeness.complete ? "success" : "brand",
    };
  }

  if (status === "correction_requested") {
    return {
      title: "Document correction requested",
      description:
        "A recruiter found documents that need to be replaced. Check the notes on the rejected documents and re-upload the correct files.",
      statusLabel: "Needs Revision",
      tone: "warning",
    };
  }

  if (status === "announced_pass") {
    return {
      title: "Congratulations — you passed the selection",
      description:
        announcement?.notes ||
        "The result has been announced. Watch for further instructions from the MBC Laboratory team.",
      statusLabel: "Passed",
      tone: "success",
    };
  }

  if (status === "announced_fail") {
    return {
      title: "The result has been announced",
      description:
        announcement?.notes ||
        "Thank you for applying. You did not pass in this selection period.",
      statusLabel: "Not Passed",
      tone: "destructive",
    };
  }

  if (status === "document_review") {
    return {
      title: "Documents under review",
      description:
        "The recruiter team is checking your documents. You'll be asked for a revision if anything needs to change.",
      statusLabel: "Document Review",
      tone: "info",
    };
  }

  if (status === "verified") {
    return {
      title: "Documents verified",
      description:
        "Your documents have been accepted. The application moves to evaluation once that phase begins.",
      statusLabel: "Verified",
      tone: "success",
    };
  }

  if (status === "screening" || status === "evaluated") {
    return {
      title: status === "evaluated" ? "Evaluation complete" : "Being evaluated",
      description:
        "Your application is in the evaluation stage. The final result will be available once the announcement is published.",
      statusLabel: status === "evaluated" ? "Evaluated" : "Being Evaluated",
      tone: "info",
    };
  }

  return {
    title: action.title,
    description: action.description,
    statusLabel: status ? formatDivision(status) : "Unknown status",
    tone: action.tone,
  };
}

export function documentStatusInfo(document) {
  if (!document) {
    return {
      status: "missing",
      label: "Missing",
      tone: "neutral",
      title: "Not uploaded",
    };
  }

  const status = document.verification_status || "uploaded";
  if (status === "verified") {
    return {
      status,
      label: "Verified",
      tone: "success",
      title: "Document approved",
    };
  }
  if (status === "rejected") {
    return {
      status,
      label: "Rejected",
      tone: "destructive",
      title: "Needs to be replaced",
    };
  }
  if (status === "correction_requested") {
    return {
      status,
      label: "Needs Revision",
      tone: "warning",
      title: "Needs revision",
    };
  }
  if (status === "pending") {
    return {
      status,
      label: "Pending",
      tone: "neutral",
      title: "Awaiting review",
    };
  }

  return {
    status: "uploaded",
    label: "Uploaded",
    tone: "info",
    title: "Uploaded",
  };
}
