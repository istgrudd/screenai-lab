import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  MailCheck,
  RefreshCw,
  UserPlus,
} from "lucide-react";

import AuthLayout from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  getApiErrorMessage,
  register as registerApi,
  resendVerification,
} from "@/lib/api";
import {
  defaultPathForRole,
  getCurrentUser,
  isAuthenticated,
} from "@/lib/auth";

const NIM_PATTERN = /^\d{10,}$/;
const CURRENT_YEAR = new Date().getFullYear();

export default function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [nim, setNim] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [faculty, setFaculty] = useState("");
  const [major, setMajor] = useState("");
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [submitting, setSubmitting] = useState(false);
  const [registrationResult, setRegistrationResult] = useState(null);
  const [resending, setResending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      const user = getCurrentUser();
      navigate(defaultPathForRole(user?.role), { replace: true });
    }
  }, [navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    const trimmed = {
      fullName: fullName.trim(),
      nim: nim.trim(),
      email: email.trim(),
      faculty: faculty.trim(),
      major: major.trim(),
    };
    if (
      !trimmed.fullName ||
      !trimmed.nim ||
      !trimmed.email ||
      !password ||
      !trimmed.faculty ||
      !trimmed.major ||
      !year
    ) {
      toast.error("Semua field wajib diisi.");
      return;
    }
    if (!NIM_PATTERN.test(trimmed.nim)) {
      toast.error("NIM harus berupa angka minimal 10 digit.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password minimal 8 karakter.");
      return;
    }
    const yearNum = Number(year);
    if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
      toast.error("Masukkan tahun angkatan yang valid.");
      return;
    }
    setSubmitting(true);
    try {
      const data = await registerApi({
        email: trimmed.email,
        password,
        fullName: trimmed.fullName,
        nim: trimmed.nim,
        faculty: trimmed.faculty,
        major: trimmed.major,
        year: yearNum,
      });
      setRegistrationResult({
        email: data?.email || trimmed.email,
        message:
          "Akun berhasil dibuat. Silakan cek email untuk verifikasi sebelum login.",
      });
      setPassword("");
      toast.success(
        "Akun berhasil dibuat. Silakan cek email untuk verifikasi sebelum login."
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Registrasi gagal"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    const targetEmail = registrationResult?.email || email.trim();
    if (!targetEmail) {
      toast.error("Email tujuan tidak tersedia.");
      return;
    }

    setResending(true);
    try {
      await resendVerification(targetEmail);
      toast.success("Jika akun kandidat belum diverifikasi, email verifikasi telah dikirim.");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Gagal mengirim ulang email verifikasi."));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Pendaftaran Kandidat"
      title={registrationResult ? "Verifikasi Email Diperlukan" : "Buat Akun Kandidat"}
      description={
        registrationResult
          ? "Satu langkah lagi sebelum kamu bisa masuk ke portal rekrutmen."
          : "Mulai perjalanan seleksi bersama MBC Laboratory."
      }
      sideTitle="Bergabung dengan MBC Laboratory"
      sideDescription="Lengkapi identitas kandidat dan pilih jalur divisi yang sesuai untuk mengikuti proses seleksi ScreenAI Lab."
      footer={
        !registrationResult && (
          <p className="text-center text-sm text-muted-foreground">
            Sudah punya akun?{" "}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Masuk ke portal
            </Link>
          </p>
        )
      }
    >
      {registrationResult ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-primary/15 bg-primary/10 px-4 py-5 text-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <MailCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="font-heading text-base font-bold tracking-normal text-foreground">
                  Akun kandidat berhasil dibuat
                </div>
                <p className="mt-2 leading-6 text-muted-foreground">
                  {registrationResult.message}
                </p>
                {registrationResult.email && (
                  <div className="mt-3 rounded-xl bg-card/80 px-3 py-2 text-xs text-muted-foreground">
                    Email tujuan:{" "}
                    <span className="break-all font-semibold text-foreground">
                      {registrationResult.email}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="brand-gradient h-10 flex-1 rounded-full shadow-sm hover:opacity-95">
              <Link to="/login">
                <ArrowLeft className="h-4 w-4" />
                Kembali ke Login
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1 rounded-full"
              disabled={resending}
              onClick={handleResendVerification}
            >
              {resending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Mengirim...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Kirim Ulang Email
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <h2 className="font-heading text-sm font-bold tracking-normal text-foreground">
                Identitas Kandidat
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Gunakan data akademik yang sesuai untuk proses verifikasi.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="full_name">Nama lengkap</Label>
                <Input
                  id="full_name"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nama sesuai data akademik"
                  className="h-10 bg-input/70"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nim">NIM</Label>
                <Input
                  id="nim"
                  type="text"
                  inputMode="numeric"
                  pattern="^\d{10,}$"
                  maxLength={13}
                  required
                  value={nim}
                  onChange={(e) => setNim(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="103XXXXXXXXXX"
                  className="h-10 bg-input/70"
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  Masukkan NIM numerik sesuai data akademik.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="year">Angkatan</Label>
                <Input
                  id="year"
                  type="number"
                  min={2000}
                  max={2100}
                  required
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2023"
                  className="h-10 bg-input/70"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="font-heading text-sm font-bold tracking-normal text-foreground">
                Kontak dan Akun
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Email ini akan menerima link verifikasi dan informasi seleksi.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@student.telkomuniversity.ac.id"
                  className="h-10 bg-input/70"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-10 bg-input/70 pr-11"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Minimum 8 karakter.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="font-heading text-sm font-bold tracking-normal text-foreground">
                Program Studi
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Informasi ini membantu tim meninjau profil akademik kandidat.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="faculty">Fakultas</Label>
                <Input
                  id="faculty"
                  type="text"
                  required
                  value={faculty}
                  onChange={(e) => setFaculty(e.target.value)}
                  placeholder="Fakultas Informatika"
                  className="h-10 bg-input/70"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="major">Jurusan</Label>
                <Input
                  id="major"
                  type="text"
                  required
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  placeholder="Data Science"
                  className="h-10 bg-input/70"
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            className="brand-gradient h-10 w-full rounded-full shadow-sm hover:opacity-95"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Membuat akun...
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                Buat Akun Kandidat
              </>
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
