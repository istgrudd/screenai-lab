import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Lock,
  Save,
  ShieldCheck,
  Swords,
  Map as MapIcon,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  createApplication,
  getMyProfile,
  updateMyProfile,
} from "@/lib/api";

const DIVISIONS = [
  {
    id: "big_data",
    name: "Big Data",
    blurb: "Data pipelines, analytics, and large-scale data engineering.",
    icon: BarChart3,
    accent: "from-sky-500/10 to-sky-500/5",
  },
  {
    id: "cyber_security",
    name: "Cyber Security",
    blurb: "Offensive & defensive security research, CTFs, and audits.",
    icon: ShieldCheck,
    accent: "from-emerald-500/10 to-emerald-500/5",
  },
  {
    id: "game_tech",
    name: "Game Technology",
    blurb: "Game engines, interactive experiences, and graphics programming.",
    icon: Swords,
    accent: "from-rose-500/10 to-rose-500/5",
  },
  {
    id: "gis",
    name: "Geographic Information Systems",
    blurb: "Spatial data, mapping, and geospatial analysis.",
    icon: MapIcon,
    accent: "from-amber-500/10 to-amber-500/5",
  },
];

// Statuses past DRAFT — these lock the academic identity fields.
const POST_SUBMIT_STATUSES = new Set([
  "submitted",
  "screening",
  "announced_pass",
  "announced_fail",
]);

function LockHint() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center text-muted-foreground"
          aria-label="Field terkunci"
        >
          <Lock className="w-3.5 h-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Tidak dapat diubah setelah submit.</TooltipContent>
    </Tooltip>
  );
}

function FieldLabel({ children, htmlFor, locked }) {
  return (
    <Label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
      {children}
      {locked && <LockHint />}
    </Label>
  );
}

function PersonalInfoForm({ profile, locked, onSaved }) {
  const [fullName, setFullName] = useState(profile.full_name || "");
  const [email, setEmail] = useState(profile.email || "");
  const [whatsapp, setWhatsapp] = useState(profile.whatsapp || "");
  const [nim, setNim] = useState(profile.nim || "");
  const [faculty, setFaculty] = useState(profile.faculty || "");
  const [major, setMajor] = useState(profile.major || "");
  const [year, setYear] = useState(
    profile.year != null ? String(profile.year) : ""
  );
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password && password !== passwordConfirm) {
      toast.error("Konfirmasi password tidak cocok.");
      return;
    }
    if (password && password.length < 8) {
      toast.error("Password minimal 8 karakter.");
      return;
    }

    // Build the payload — only include fields that actually changed, and
    // never send the locked ones (the backend rejects them with 403).
    const payload = {};
    if (fullName.trim() !== (profile.full_name || ""))
      payload.full_name = fullName.trim();
    if (email.trim() !== (profile.email || "")) payload.email = email.trim();
    if ((whatsapp || "").trim() !== (profile.whatsapp || ""))
      payload.whatsapp = whatsapp.trim();

    if (!locked) {
      if (nim.trim() !== (profile.nim || "")) payload.nim = nim.trim();
      if (faculty.trim() !== (profile.faculty || ""))
        payload.faculty = faculty.trim();
      if (major.trim() !== (profile.major || "")) payload.major = major.trim();
      const yearNum = year === "" ? null : Number(year);
      if (yearNum != null && yearNum !== profile.year) payload.year = yearNum;
    }

    if (password) payload.password = password;

    if (Object.keys(payload).length === 0) {
      toast.info("Tidak ada perubahan untuk disimpan.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateMyProfile(payload);
      toast.success("Profil berhasil diperbarui.");
      setPassword("");
      setPasswordConfirm("");
      onSaved(updated);
    } catch (err) {
      // Field-locked rejection from the backend (403). Surface the locked
      // field names so the user understands why the save failed.
      const msg = err.message || "Gagal memperbarui profil";
      if (msg.includes("locked_fields")) {
        toast.error("Field terkunci tidak dapat diubah setelah submit.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Personal Information</CardTitle>
        <CardDescription>
          {locked
            ? "Beberapa field terkunci karena aplikasi kamu sudah disubmit. Nama, email, dan kontak tetap bisa kamu update."
            : "Lengkapi data diri kamu sebelum submit aplikasi."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="full_name">Nama lengkap</FieldLabel>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={255}
              disabled={saving}
              required
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
              disabled={saving}
              required
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="whatsapp">Nomor WhatsApp</FieldLabel>
            <Input
              id="whatsapp"
              type="tel"
              inputMode="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              maxLength={32}
              placeholder="+628123456789"
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="nim" locked={locked}>
              NIM
            </FieldLabel>
            <Input
              id="nim"
              value={nim}
              onChange={(e) => setNim(e.target.value)}
              minLength={10}
              maxLength={20}
              disabled={saving || locked}
              readOnly={locked}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="faculty" locked={locked}>
              Fakultas
            </FieldLabel>
            <Input
              id="faculty"
              value={faculty}
              onChange={(e) => setFaculty(e.target.value)}
              maxLength={255}
              disabled={saving || locked}
              readOnly={locked}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="major" locked={locked}>
              Jurusan
            </FieldLabel>
            <Input
              id="major"
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              maxLength={255}
              disabled={saving || locked}
              readOnly={locked}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="year" locked={locked}>
              Angkatan
            </FieldLabel>
            <Input
              id="year"
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              disabled={saving || locked}
              readOnly={locked}
            />
          </div>

          <div className="md:col-span-2 border-t pt-4 mt-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
              Ubah Password
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Password baru
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Kosongkan jika tidak diubah"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password_confirm" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Konfirmasi password
                </Label>
                <Input
                  id="password_confirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Ulangi password baru"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  disabled={saving || !password}
                />
              </div>
            </div>
          </div>

          <div className="md:col-span-2 flex justify-end pt-2">
            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Simpan Perubahan
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function DivisionCard({ division, selected, disabled, onSelect }) {
  const Icon = division.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(division.id)}
      disabled={disabled}
      className={`group text-left rounded-2xl border p-5 transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? "border-primary ring-2 ring-primary/30 bg-primary/5"
          : "border-border hover:border-primary/60 hover:shadow-sm"
      } bg-gradient-to-br ${division.accent}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center ${
            selected ? "bg-primary text-primary-foreground" : "bg-background border"
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground">{division.name}</p>
            {selected && (
              <Badge variant="default" className="text-[10px]">
                Selected
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {division.blurb}
          </p>
        </div>
      </div>
    </button>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [selectedDivision, setSelectedDivision] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const me = await getMyProfile();
        if (!cancelled) {
          setProfile(me);
          setSelectedDivision(me.division || null);
        }
      } catch (err) {
        toast.error(err.message || "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasApplication = Boolean(profile?.division);
  const isSubmitted =
    profile?.application_status &&
    POST_SUBMIT_STATUSES.has(profile.application_status);
  // Division is locked the moment any application exists — switching divisions
  // mid-flight would orphan uploaded documents. Distinct from `isSubmitted`,
  // which gates the academic identity fields.
  const divisionLocked = hasApplication;

  const handleStart = async () => {
    if (!selectedDivision) {
      toast.error("Pick a division first.");
      return;
    }
    setSaving(true);
    try {
      await createApplication(selectedDivision);
      const refreshed = await getMyProfile();
      setProfile(refreshed);
      toast.success("Application started. Next: upload your documents.");
      navigate("/documents");
    } catch (err) {
      toast.error(err.message || "Could not start application");
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchDivision = (divId) => {
    // Locked once an application exists — switching would orphan uploads.
    if (divisionLocked) return;
    setSelectedDivision(divId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-primary" />
          Your Profile
        </h1>
        <p className="text-muted-foreground mt-1">
          {isSubmitted
            ? "Aplikasi kamu sudah disubmit. Beberapa data akademik dikunci."
            : "Lengkapi profil kamu, lalu pilih divisi yang ingin dilamar."}
        </p>
      </div>

      <PersonalInfoForm
        profile={profile}
        locked={Boolean(isSubmitted)}
        onSaved={setProfile}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            Division Selection
            {divisionLocked && <LockHint />}
          </CardTitle>
          <CardDescription>
            {divisionLocked
              ? "Pilihan divisi terkunci setelah aplikasi dibuat — pindah divisi akan membatalkan dokumen yang sudah diupload."
              : "Pilih satu divisi untuk dilamar. Hanya boleh satu per periode rekrutasi."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {DIVISIONS.map((d) => (
              <DivisionCard
                key={d.id}
                division={d}
                selected={selectedDivision === d.id}
                disabled={divisionLocked}
                onSelect={handleSwitchDivision}
              />
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t">
            <div className="text-sm text-muted-foreground">
              {hasApplication ? (
                <span className="inline-flex items-center gap-2 text-foreground">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Application started — status{" "}
                  <Badge
                    variant={isSubmitted ? "default" : "secondary"}
                    className="ml-1 text-[10px] uppercase"
                  >
                    {profile.application_status}
                  </Badge>
                </span>
              ) : (
                "Ready when you are."
              )}
            </div>
            {hasApplication ? (
              <Button
                onClick={() =>
                  navigate(isSubmitted ? "/submitted" : "/documents")
                }
                className="gap-2"
              >
                {isSubmitted ? "View status" : "Continue to documents"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleStart}
                disabled={!selectedDivision || saving}
                className="gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    Start application
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
