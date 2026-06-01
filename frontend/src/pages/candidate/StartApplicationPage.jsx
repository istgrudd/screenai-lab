import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Lock,
} from "lucide-react";

import LoadingState from "@/components/common/LoadingState";
import PhaseBadge from "@/components/common/PhaseBadge";
import StatusBadge from "@/components/common/StatusBadge";
import PageHeader from "@/components/layout/PageHeader";
import CandidateApplicationStepTrack from "@/components/candidate/CandidateApplicationStepTrack";
import DivisionSelection from "@/components/candidate/DivisionSelection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createApplication,
  getActivePeriod,
  getMyApplication,
  getMyProfile,
} from "@/lib/api";
import {
  formatDivision,
  isNotFoundError,
  isSubmissionPhase,
  isSubmittedOrLater,
  submissionPhaseMessage,
} from "@/lib/candidateApplication";
import { periodDeadlineContext } from "@/lib/candidateUx";

export default function StartApplicationPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [application, setApplication] = useState(null);
  const [activePeriod, setActivePeriod] = useState(null);
  const [selectedDivision, setSelectedDivision] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const profileData = await getMyProfile();
        if (cancelled) return;
        setProfile(profileData);
        setSelectedDivision(profileData.division || null);

        try {
          const period = await getActivePeriod();
          if (!cancelled) setActivePeriod(period);
        } catch {
          if (!cancelled) setActivePeriod(null);
        }

        try {
          const app = await getMyApplication();
          if (cancelled) return;
          setApplication(app);
          setSelectedDivision(app.division || profileData.division || null);
        } catch (error) {
          if (!isNotFoundError(error)) {
            toast.error(error.message || "Gagal memuat pendaftaran.");
          }
        }
      } catch (error) {
        toast.error(error.message || "Gagal memuat profil.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const submittedOrLater = isSubmittedOrLater(application);
  const divisionLocked = Boolean(application);
  const submissionOpen = isSubmissionPhase(activePeriod);
  const periodContext = periodDeadlineContext(activePeriod);

  const handleSelect = (division) => {
    if (divisionLocked) return;
    setSelectedDivision(division);
  };

  const handleStart = async () => {
    if (!selectedDivision) {
      toast.error("Pilih divisi terlebih dahulu.");
      return;
    }

    setSaving(true);
    try {
      await createApplication(selectedDivision);
      toast.success("Pendaftaran dimulai. Lanjutkan dengan unggah dokumen.");
      navigate("/documents");
    } catch (error) {
      toast.error(error.message || "Gagal memulai pendaftaran.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState label="Memuat halaman pendaftaran..." />;
  }

  if (!profile) return null;

  const currentStep = !application
    ? "division"
    : submittedOrLater
    ? "status"
    : "documents";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pendaftaran"
        title="Mulai Pendaftaran"
        description="Pilih satu divisi MBC Laboratory. Divisi akan terkunci setelah draft pendaftaran dibuat."
      />

      <CandidateApplicationStepTrack
        currentStep={currentStep}
        application={application}
        profile={profile}
        title="Alur Pendaftaran"
      />

      <Card className="brand-card">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
              Konteks Periode
            </p>
            <h2 className="mt-1 font-heading text-xl font-bold tracking-normal">
              {activePeriod?.name || "Tidak ada periode aktif"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {periodContext.deadlineText}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {activePeriod?.current_phase ? (
              <PhaseBadge phase={activePeriod.current_phase} size="md" />
            ) : (
              <PhaseBadge label="Tidak Aktif" tone="neutral" size="md" />
            )}
            {!submissionOpen && !application && (
              <StatusBadge label="Belum bisa daftar" tone="warning" size="md" />
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="brand-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
            Pilih Divisi
            {divisionLocked && <Lock className="h-4 w-4 text-muted-foreground" />}
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            {divisionLocked
              ? "Divisi sudah terkunci agar dokumen dan pendaftaran tetap konsisten."
              : "Pilih divisi yang paling sesuai dengan minat riset dan kemampuanmu."}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <DivisionSelection
            selected={selectedDivision}
            disabled={divisionLocked || saving || !submissionOpen}
            onSelect={handleSelect}
          />

          {!submissionOpen && !application && (
            <div className="rounded-xl bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
              {submissionPhaseMessage(activePeriod)}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {application ? (
                <span className="inline-flex flex-wrap items-center gap-2 text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Divisi saat ini:{" "}
                  <span className="font-medium">
                    {formatDivision(application.division)}
                  </span>
                  <StatusBadge status={application.status} />
                </span>
              ) : (
                "Draft akan dibuat setelah kamu menekan tombol mulai."
              )}
            </div>

            {!application ? (
              <Button
                type="button"
                onClick={handleStart}
                disabled={!selectedDivision || saving || !submissionOpen}
                className="gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memulai...
                  </>
                ) : (
                  <>
                    <ClipboardList className="h-4 w-4" />
                    Mulai Pendaftaran
                  </>
                )}
              </Button>
            ) : submittedOrLater ? (
              <Button asChild className="gap-2">
                <Link to="/application/status">
                  Lihat Status Pendaftaran
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild variant="outline" className="gap-2">
                  <Link to="/application">
                    Ringkasan
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild className="gap-2">
                  <Link to="/documents">
                    Lanjut Unggah Dokumen
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
