import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

import ApplicationFilters from "@/components/recruiter/ApplicationFilters";
import { MetricCard } from "@/components/recruiter/WorkspaceCards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  finalizeDocumentReview,
  listApplicationDocuments,
  listRecruiterApplications,
  reviewDocument,
} from "@/lib/api";
import { formatDivision, formatStatus } from "@/lib/recruiterWorkspace";

function statusVariant(status) {
  if (status === "verified") return "secondary";
  if (status === "rejected") return "destructive";
  return "outline";
}

function progressText(progress) {
  if (!progress) return "0 verified, 0 rejected";
  return `${progress.verified_count} verified, ${progress.rejected_count} rejected, ${progress.pending_count} pending`;
}

export default function RecruiterDocumentVerificationPage() {
  const [applications, setApplications] = useState([]);
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("document_review");
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [loading, setLoading] = useState(true);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [workingDocId, setWorkingDocId] = useState(null);
  const [finalizing, setFinalizing] = useState(false);

  const loadApplications = async () => {
    setLoading(true);
    try {
      const apps = await listRecruiterApplications({
        division: divisionFilter !== "all" ? divisionFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setApplications(apps || []);
      if (selectedApplication) {
        const refreshed = (apps || []).find((app) => app.id === selectedApplication.id);
        setSelectedApplication(refreshed || null);
      }
    } catch (error) {
      toast.error(error.message || "Failed to load document queue");
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async (application) => {
    if (!application) {
      setDocuments([]);
      return;
    }
    setDocumentsLoading(true);
    try {
      const payload = await listApplicationDocuments(application.id);
      setDocuments(payload.documents || []);
    } catch (error) {
      toast.error(error.message || "Failed to load documents");
    } finally {
      setDocumentsLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionFilter, statusFilter]);

  useEffect(() => {
    loadDocuments(selectedApplication);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedApplication?.id]);

  const summary = useMemo(() => {
    const pending = applications.filter(
      (application) => application.status === "document_review"
    ).length;
    const correction = applications.filter(
      (application) => application.status === "correction_requested"
    ).length;
    const allVerified = applications.filter(
      (application) => application.document_review_progress?.all_verified
    ).length;
    return { pending, correction, allVerified };
  }, [applications]);

  const handleVerify = async (document) => {
    setWorkingDocId(document.id);
    try {
      const updated = await reviewDocument(document.id, { status: "verified" });
      setDocuments((prev) =>
        prev.map((item) => (item.id === document.id ? updated : item))
      );
      toast.success(`${formatStatus(document.doc_type)} verified.`);
    } catch (error) {
      toast.error(error.message || "Verification failed");
    } finally {
      setWorkingDocId(null);
    }
  };

  const handleReject = async (document) => {
    const reason = (rejectionReasons[document.id] || "").trim();
    if (!reason) {
      toast.error("Rejection reason is required.");
      return;
    }
    setWorkingDocId(document.id);
    try {
      const updated = await reviewDocument(document.id, {
        status: "rejected",
        reason,
      });
      setDocuments((prev) =>
        prev.map((item) => (item.id === document.id ? updated : item))
      );
      toast.success(`${formatStatus(document.doc_type)} rejected.`);
    } catch (error) {
      toast.error(error.message || "Rejection failed");
    } finally {
      setWorkingDocId(null);
    }
  };

  const handleFinalize = async () => {
    if (!selectedApplication) return;
    const rejectedCount = documents.filter(
      (document) => document.verification_status === "rejected"
    ).length;
    const message = rejectedCount
      ? "Finalize review and request document correction from this candidate?"
      : "Finalize review and approve all documents for this candidate?";
    if (!window.confirm(message)) return;

    setFinalizing(true);
    try {
      const updated = await finalizeDocumentReview(selectedApplication.id);
      toast.success(
        updated.status === "verified"
          ? "Application verified. NER has been queued."
          : "Correction requested from candidate."
      );
      await loadApplications();
      setSelectedApplication(updated);
      await loadDocuments(updated);
    } catch (error) {
      toast.error(error.message || "Finalization failed");
    } finally {
      setFinalizing(false);
    }
  };

  const reviewableSelected =
    selectedApplication &&
    ["document_review", "submitted"].includes(selectedApplication.status);

  const canFinalize =
    reviewableSelected &&
    documents.length > 0 &&
    documents.every((document) =>
      ["verified", "rejected"].includes(document.verification_status)
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          Document Verification
        </h1>
        <p className="text-muted-foreground mt-1">
          Verify or reject each required document, then finalize one candidate at a time.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard icon={FileText} label="In review" value={loading ? "..." : summary.pending} />
        <MetricCard icon={XCircle} label="Correction requested" value={loading ? "..." : summary.correction} tone="yellow" />
        <MetricCard icon={CheckCircle2} label="All verified" value={loading ? "..." : summary.allVerified} tone="green" />
      </div>

      <ApplicationFilters
        divisionFilter={divisionFilter}
        statusFilter={statusFilter}
        onDivisionChange={setDivisionFilter}
        onStatusChange={setStatusFilter}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)] gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Applications</CardTitle>
            <CardDescription>Select a candidate to review documents.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading applications...
              </div>
            ) : applications.length ? (
              applications.map((application) => (
                <button
                  key={application.id}
                  type="button"
                  onClick={() => setSelectedApplication(application)}
                  className={`w-full text-left rounded-lg border px-3 py-3 hover:bg-muted/50 ${
                    selectedApplication?.id === application.id
                      ? "border-primary bg-primary/5"
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {application.candidate?.full_name || "Candidate"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {application.candidate?.nim || "-"} - {formatDivision(application.division)}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {formatStatus(application.status)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {progressText(application.document_review_progress)}
                  </p>
                </button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No applications match the current filters.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-lg">Document Review</CardTitle>
                <CardDescription>
                  {selectedApplication
                    ? selectedApplication.candidate?.full_name || "Selected candidate"
                    : "Select an application from the queue."}
                </CardDescription>
              </div>
              {selectedApplication && (
                <Button
                  onClick={handleFinalize}
                  disabled={!canFinalize || finalizing || documentsLoading}
                  className="gap-2"
                >
                  {finalizing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  Finalize
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedApplication ? (
              <p className="text-sm text-muted-foreground py-12 text-center">
                Pick a candidate to inspect their uploaded documents.
              </p>
            ) : documentsLoading ? (
              <div className="py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading documents...
              </div>
            ) : (
              documents.map((document) => {
                const rejected = document.verification_status === "rejected";
                const verified = document.verification_status === "verified";
                return (
                  <div key={document.id} className="rounded-lg border px-3 py-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-medium">
                          {formatStatus(document.doc_type)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {document.file_name} - {(document.file_size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <Badge
                        variant={statusVariant(document.verification_status)}
                        className="text-[10px] uppercase"
                      >
                        {formatStatus(document.verification_status)}
                      </Badge>
                    </div>

                    {rejected && document.rejection_reason && (
                      <p className="text-xs text-destructive mt-2">
                        {document.rejection_reason}
                      </p>
                    )}

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-start">
                      <Textarea
                        value={rejectionReasons[document.id] ?? document.rejection_reason ?? ""}
                        onChange={(event) =>
                          setRejectionReasons((prev) => ({
                            ...prev,
                            [document.id]: event.target.value,
                          }))
                        }
                        placeholder="Reason required when rejecting"
                        disabled={workingDocId === document.id || !reviewableSelected}
                        className="min-h-10"
                      />
                      <Button
                        variant="outline"
                        onClick={() => handleVerify(document)}
                        disabled={workingDocId === document.id || verified || !reviewableSelected}
                        className="gap-2"
                      >
                        {workingDocId === document.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        Verify
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleReject(document)}
                        disabled={workingDocId === document.id || rejected || !reviewableSelected}
                        className="gap-2"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
