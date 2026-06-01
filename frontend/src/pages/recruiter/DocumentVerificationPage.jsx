import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import ConfirmActionDialog from "@/components/common/ConfirmActionDialog";
import MetricCard from "@/components/common/MetricCard";
import StatusBadge from "@/components/common/StatusBadge";
import PageHeader from "@/components/layout/PageHeader";
import ApplicationFilters from "@/components/recruiter/ApplicationFilters";
import VerificationQueuePanel from "@/components/recruiter/VerificationQueuePanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchDocumentBlob,
  finalizeDocumentReview,
  getActivePeriod,
  listApplicationDocuments,
  listRecruiterApplications,
  reviewDocument,
} from "@/lib/api";
import { formatDivision, formatStatus } from "@/lib/recruiterWorkspace";

export default function RecruiterDocumentVerificationPage() {
  const [applications, setApplications] = useState([]);
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("document_review");
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [activePeriod, setActivePeriod] = useState(null);
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [previews, setPreviews] = useState({});
  const previewsRef = useRef({});
  const [loading, setLoading] = useState(true);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [workingDocId, setWorkingDocId] = useState(null);
  const [previewLoadingDocId, setPreviewLoadingDocId] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const [confirmFinalizeOpen, setConfirmFinalizeOpen] = useState(false);

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

  const loadActivePeriod = async () => {
    try {
      const period = await getActivePeriod();
      setActivePeriod(period);
    } catch {
      setActivePeriod(null);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      loadApplications();
      loadActivePeriod();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionFilter, statusFilter]);

  useEffect(() => {
    Object.values(previewsRef.current).forEach((preview) => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    });
    previewsRef.current = {};
    Promise.resolve().then(() => {
      setPreviews({});
      loadDocuments(selectedApplication);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedApplication?.id]);

  useEffect(
    () => () => {
      Object.values(previewsRef.current).forEach((preview) => {
        if (preview?.url) URL.revokeObjectURL(preview.url);
      });
    },
    []
  );

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

  const closePreview = (docId) => {
    const preview = previewsRef.current[docId];
    if (preview?.url) URL.revokeObjectURL(preview.url);
    delete previewsRef.current[docId];
    setPreviews((prev) => {
      const next = { ...prev };
      delete next[docId];
      return next;
    });
  };

  const togglePreview = async (document) => {
    if (previews[document.id]) {
      closePreview(document.id);
      return;
    }
    setPreviewLoadingDocId(document.id);
    try {
      const preview = await fetchDocumentBlob(document.id);
      previewsRef.current[document.id] = preview;
      setPreviews((prev) => ({ ...prev, [document.id]: preview }));
    } catch (error) {
      toast.error(error.message || "Failed to preview document");
    } finally {
      setPreviewLoadingDocId(null);
    }
  };

  const handleFinalize = async () => {
    if (!selectedApplication) return;
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
  const rejectedCount = documents.filter(
    (document) => document.verification_status === "rejected"
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recruiter / Documents"
        title="Document Verification"
        description="Queue-first workspace for reviewing candidate documents and finalizing document review decisions."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard icon={FileText} label="In review" value={loading ? "..." : summary.pending} />
        <MetricCard icon={XCircle} label="Correction requested" value={loading ? "..." : summary.correction} tone="warning" />
        <MetricCard icon={CheckCircle2} label="All verified" value={loading ? "..." : summary.allVerified} tone="success" />
      </div>

      {activePeriod?.current_phase === "EVALUATION" &&
        (summary.pending > 0 || summary.correction > 0) && (
          <Card className="brand-card bg-warning/10">
            <CardContent className="flex items-start gap-3 p-5">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              <div>
                <p className="font-medium text-foreground">
                  Evaluation phase is active
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Candidates still in document review or correction remain in
                  this queue and will be skipped by evaluation.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

      <ApplicationFilters
        divisionFilter={divisionFilter}
        statusFilter={statusFilter}
        onDivisionChange={setDivisionFilter}
        onStatusChange={setStatusFilter}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
        <VerificationQueuePanel
          applications={applications}
          selectedApplication={selectedApplication}
          loading={loading}
          onSelect={setSelectedApplication}
        />

        <Card className="brand-card">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="font-heading text-xl tracking-normal">
                  Document Review
                </CardTitle>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {selectedApplication
                    ? `${selectedApplication.candidate?.full_name || "Selected candidate"} - ${formatDivision(selectedApplication.division)}`
                    : "Select an application from the queue."}
                </p>
              </div>
              {selectedApplication && (
                <Button
                  type="button"
                  onClick={() => setConfirmFinalizeOpen(true)}
                  disabled={!canFinalize || finalizing || documentsLoading}
                  className="gap-2"
                >
                  {finalizing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Finalize Review
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedApplication ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Pick a candidate to inspect their uploaded documents.
              </p>
            ) : documentsLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading documents...
              </div>
            ) : documents.length ? (
              documents.map((document) => {
                const rejected = document.verification_status === "rejected";
                const verified = document.verification_status === "verified";
                const preview = previews[document.id];
                return (
                  <div key={document.id} className="rounded-xl bg-surface-container-low p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-foreground">
                          {formatStatus(document.doc_type)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {document.file_name} - {(document.file_size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <StatusBadge status={document.verification_status || "pending"} entityType="document" />
                    </div>

                    {rejected && document.rejection_reason && (
                      <p className="mt-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {document.rejection_reason}
                      </p>
                    )}

                    <div className="mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => togglePreview(document)}
                        disabled={previewLoadingDocId === document.id}
                        className="gap-2"
                      >
                        {previewLoadingDocId === document.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : preview ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                        {preview ? "Hide Preview" : "Preview"}
                      </Button>
                    </div>

                    {preview && (
                      <div className="mt-3 overflow-hidden rounded-xl border bg-background">
                        {preview.mime.includes("pdf") ? (
                          <iframe
                            title={`Preview ${document.file_name}`}
                            src={preview.url}
                            className="h-[420px] w-full bg-background"
                          />
                        ) : preview.mime.startsWith("image/") ? (
                          <img
                            src={preview.url}
                            alt={document.file_name}
                            className="max-h-[420px] w-full bg-background object-contain"
                          />
                        ) : (
                          <div className="p-4">
                            <Button asChild variant="outline" className="gap-2">
                              <a href={preview.url} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" />
                                Open downloaded preview
                              </a>
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-1 items-start gap-2 md:grid-cols-[1fr_auto_auto]">
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
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Verify
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleReject(document)}
                        disabled={workingDocId === document.id || rejected || !reviewableSelected}
                        className="gap-2"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No documents found for this application.
              </p>
            )}

            {selectedApplication && !canFinalize && (
              <p className="text-xs leading-5 text-muted-foreground">
                Finalize is enabled only after every document is verified or rejected.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmActionDialog
        open={confirmFinalizeOpen}
        onOpenChange={setConfirmFinalizeOpen}
        title={rejectedCount ? "Request document correction?" : "Approve all documents?"}
        description={
          rejectedCount
            ? "This will finalize review and request document correction from this candidate."
            : "This will finalize review and approve all documents for this candidate."
        }
        confirmLabel="Finalize Review"
        cancelLabel="Cancel"
        loading={finalizing}
        onConfirm={handleFinalize}
      />
    </div>
  );
}
