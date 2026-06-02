import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Pencil, UserCircle2 } from "lucide-react";

import LoadingState from "@/components/common/LoadingState";
import StatusBadge from "@/components/common/StatusBadge";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyApplication, getMyProfile } from "@/lib/api";
import {
  applicationReferenceId,
  formatDivision,
  formatIpk,
  isNotFoundError,
} from "@/lib/candidateApplication";

function Field({ label, value, mono }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className={mono ? "mt-1 font-mono text-sm" : "mt-1 text-sm"}>
        {value || <span className="text-muted-foreground">-</span>}
      </p>
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const profileData = await getMyProfile();
        if (cancelled) return;
        setProfile(profileData);

        try {
          const app = await getMyApplication();
          if (!cancelled) setApplication(app);
        } catch (error) {
          if (!isNotFoundError(error)) {
            toast.error(error.message || "Gagal memuat status pendaftaran.");
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

  if (loading) {
    return <LoadingState label="Memuat profil kandidat..." />;
  }

  if (!profile) return null;

  const appStatus = application?.status || profile.application_status;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Akun Kandidat"
        title="Profil"
        description="Data profil digunakan untuk pendaftaran, dokumen, dan komunikasi seleksi MBC Laboratory."
        status={
          appStatus ? (
            <StatusBadge status={appStatus} size="md" />
          ) : (
            <StatusBadge label="Belum Ada Pendaftaran" tone="brand" size="md" />
          )
        }
        action={
          <Button asChild className="gap-2">
            <Link to="/profile/edit">
              <Pencil className="h-4 w-4" />
              Edit Profil
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="brand-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
              <UserCircle2 className="h-5 w-5 text-primary" />
              Identitas Kandidat
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nama lengkap" value={profile.full_name} />
            <Field label="Email" value={profile.email} />
            <Field label="Nomor WhatsApp" value={profile.whatsapp} />
            <Field label="NIM" value={profile.nim} mono />
            <Field label="Fakultas" value={profile.faculty} />
            <Field label="Jurusan" value={profile.major} />
            <Field label="Angkatan" value={profile.year} />
            <Field label="IPK" value={formatIpk(profile.ipk)} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Akun
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge label={profile.role || "Candidate"} tone="neutral" />
                <StatusBadge
                  label={profile.is_active ? "Aktif" : "Tidak Aktif"}
                  tone={profile.is_active ? "success" : "destructive"}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="brand-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-normal">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Pendaftaran Saat Ini
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-4 text-sm">
              <Field
                label="Divisi"
                value={formatDivision(application?.division || profile.division)}
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Status aplikasi
                </p>
                <div className="mt-1">
                  {appStatus ? (
                    <StatusBadge status={appStatus} />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Belum ada pendaftaran
                    </span>
                  )}
                </div>
              </div>
              {application && (
                <Field
                  label="Reference ID"
                  value={applicationReferenceId(application)}
                  mono
                />
              )}
            </div>

            <div className="flex justify-end border-t border-border/60 pt-4">
              <Button asChild variant="outline" className="gap-2">
                <Link to="/application">
                  Buka Ringkasan Pendaftaran
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
