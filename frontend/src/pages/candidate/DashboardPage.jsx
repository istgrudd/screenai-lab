import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Megaphone, Sparkles } from "lucide-react";

import EmptyState from "@/components/common/EmptyState";
import LoadingState from "@/components/common/LoadingState";
import PageHeader from "@/components/layout/PageHeader";
import ApplicationProgressCard from "@/components/candidate/ApplicationProgressCard";
import CandidateApplicationStepTrack from "@/components/candidate/CandidateApplicationStepTrack";
import CandidateStatusHero from "@/components/candidate/CandidateStatusHero";
import DocumentRequirementCard from "@/components/candidate/DocumentRequirementCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getActivePeriod,
  getMe,
  getMyAnnouncement,
  getMyApplication,
  listApplicationDocuments,
} from "@/lib/api";
import {
  REQUIRED_DOCUMENTS,
  isAnnouncedStatus,
  isNotFoundError,
} from "@/lib/candidateApplication";
import { candidateNextAction, cx, formatDateTimeId } from "@/lib/candidateUx";

function AnnouncementCard({ application, announcement }) {
  if (!application || !isAnnouncedStatus(application.status)) return null;

  const passed = application.status === "announced_pass";
  return (
    <Card
      className={cx(
        "brand-card",
        passed ? "bg-success/10" : "bg-destructive/10"
      )}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
          <Megaphone className={cx("h-5 w-5", passed ? "text-success" : "text-destructive")} />
          {passed ? "Pengumuman: Lolos" : "Pengumuman: Tidak Lolos"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
        <p>
          {passed
            ? "Selamat, hasil seleksi kamu sudah dipublikasikan. Pantau instruksi lanjutan dari tim MBC Laboratory."
            : "Terima kasih sudah mengikuti proses seleksi MBC Laboratory pada periode ini."}
        </p>
        {announcement?.notes && (
          <p className="rounded-xl bg-card px-4 py-3 text-foreground">
            {announcement.notes}
          </p>
        )}
        {announcement?.announced_at && (
          <p className="text-xs">
            Diumumkan pada {formatDateTimeId(announcement.announced_at)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [application, setApplication] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [announcement, setAnnouncement] = useState(null);
  const [activePeriod, setActivePeriod] = useState(null);
  const [periodLoading, setPeriodLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        try {
          const period = await getActivePeriod();
          if (!cancelled) setActivePeriod(period);
        } catch {
          if (!cancelled) setActivePeriod(null);
        } finally {
          if (!cancelled) setPeriodLoading(false);
        }

        const me = await getMe();
        if (!cancelled) setUser(me);

        try {
          const app = await getMyApplication();
          if (cancelled) return;
          setApplication(app);

          const { documents: docs } = await listApplicationDocuments(app.id);
          if (!cancelled) setDocuments(docs || []);

          if (app.status !== "draft") {
            try {
              const ann = await getMyAnnouncement();
              if (!cancelled) setAnnouncement(ann);
            } catch {
              if (!cancelled) setAnnouncement(null);
            }
          }
        } catch (error) {
          if (!isNotFoundError(error)) {
            toast.error(error.message || "Gagal memuat pendaftaran.");
          }
        }
      } catch (error) {
        toast.error(error.message || "Gagal memuat dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const canManageDocuments =
    application &&
    (application.status === "draft" ||
      application.status === "correction_requested");
  const action = useMemo(
    () => candidateNextAction(application, documents),
    [application, documents]
  );
  const docsByType = useMemo(
    () => new Map(documents.map((document) => [document.doc_type, document])),
    [documents]
  );
  const stepMode =
    application && application.status !== "draft" ? "status" : "application";

  if (loading) {
    return <LoadingState label="Memuat dashboard kandidat..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Beranda Kandidat"
        title="Dashboard Pendaftaran"
        description="Pantau status, deadline, dan langkah paling penting untuk pendaftaran MBC Laboratory."
      />

      <CandidateStatusHero
        user={user}
        application={application}
        documents={documents}
        activePeriod={activePeriod}
        announcement={announcement}
        loading={periodLoading && !activePeriod}
        onPrimaryAction={() => navigate(action.to)}
        primaryActionLabel={action.label}
      />

      <CandidateApplicationStepTrack
        mode={stepMode}
        currentStep={!application ? "division" : undefined}
        application={application}
        documents={documents}
        title={stepMode === "status" ? "Tahapan Seleksi" : "Alur Pendaftaran"}
      />

      {!application ? (
        <EmptyState
          icon={Sparkles}
          title="Belum ada draft pendaftaran"
          description="Kamu belum memilih divisi dan membuat pendaftaran. Gunakan tombol utama di atas untuk memulai perjalanan kandidat."
        />
      ) : (
        <>
          <ApplicationProgressCard
            application={application}
            documents={documents}
            activePeriod={activePeriod}
            canManageDocuments={Boolean(canManageDocuments)}
            actionLabel={action.label}
            onAction={() => navigate(action.to)}
          />

          <section className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
                Checklist Dokumen
              </p>
              <h2 className="mt-1 font-heading text-xl font-bold tracking-normal">
                Kebutuhan Pendaftaran
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {REQUIRED_DOCUMENTS.map((item) => (
                <DocumentRequirementCard
                  key={item.doc_type}
                  documentType={item.doc_type}
                  label={item.label}
                  document={docsByType.get(item.doc_type)}
                  locked={!canManageDocuments}
                  correctionMode={application.status === "correction_requested"}
                />
              ))}
            </div>
          </section>

          <AnnouncementCard
            application={application}
            announcement={announcement}
          />
        </>
      )}
    </div>
  );
}
