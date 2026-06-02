import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Lock, UserCircle2 } from "lucide-react";

import LoadingState from "@/components/common/LoadingState";
import StatusBadge from "@/components/common/StatusBadge";
import PageHeader from "@/components/layout/PageHeader";
import CandidateProfileForm from "@/components/candidate/CandidateProfileForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyProfile } from "@/lib/api";
import {
  POST_SUBMIT_STATUSES,
  PROFILE_FIELD_LABELS,
} from "@/lib/candidateApplication";

export default function EditProfilePage() {
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getMyProfile();
        if (!cancelled) setProfile(data);
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

  if (loading) {
    return <LoadingState label="Memuat form profil..." />;
  }

  if (!profile) return null;

  const locked = POST_SUBMIT_STATUSES.has(profile.application_status);
  const ipkCorrectionOpen = locked && profile.ipk_editable === true;
  const missingFields = location.state?.missingProfileFields || [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Akun Kandidat"
        title="Edit Profil"
        description="Lengkapi data pribadi, kontak, dan akademik agar pendaftaran bisa dikirim."
        status={
          ipkCorrectionOpen ? (
            <StatusBadge label="Koreksi IPK tersedia" tone="warning" size="md" />
          ) : locked ? (
            <StatusBadge label="Field akademik terkunci" tone="warning" size="md" />
          ) : (
            <StatusBadge label="Bisa diedit" tone="brand" size="md" />
          )
        }
        action={
          <Button asChild variant="outline" className="gap-2">
            <Link to="/profile">
              <ArrowLeft className="h-4 w-4" />
              Kembali
            </Link>
          </Button>
        }
      />

      {missingFields.length > 0 && (
        <Card className="brand-card bg-warning/10">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-medium text-foreground">
                Lengkapi profil sebelum lanjut
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Wajib diisi:{" "}
                {missingFields
                  .map((field) => PROFILE_FIELD_LABELS[field] || field)
                  .join(", ")}
                .
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {locked && (
        <Card className="brand-card bg-surface-container-low">
          <CardContent className="flex items-start gap-3 p-5">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-foreground">
                Beberapa field akademik terkunci
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Setelah pendaftaran dikirim, NIM, fakultas, jurusan, dan
                angkatan tidak dapat diubah. IPK juga terkunci setelah submit,
                tetapi dapat dibuka kembali jika KHS ditolak dan perlu koreksi.
                Nama, email, WhatsApp, dan password tetap dapat diperbarui.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="brand-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
            <UserCircle2 className="h-5 w-5 text-primary" />
            Informasi Kandidat
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Nomor WhatsApp wajib diisi dan divalidasi oleh form sebelum data
            disimpan.
          </p>
        </CardHeader>
        <CardContent>
          <CandidateProfileForm
            profile={profile}
            locked={locked}
            onSaved={setProfile}
          />
        </CardContent>
      </Card>
    </div>
  );
}
