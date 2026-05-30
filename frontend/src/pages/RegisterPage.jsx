import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  GraduationCap,
  Loader2,
  MailCheck,
  RefreshCw,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  getApiErrorMessage,
  register as registerApi,
  resendVerification,
} from "@/lib/api";
import {
  isAuthenticated,
  getCurrentUser,
  defaultPathForRole,
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
      toast.error("All fields are required.");
      return;
    }
    if (!NIM_PATTERN.test(trimmed.nim)) {
      toast.error("NIM must be 13 digits starting with '103'.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    const yearNum = Number(year);
    if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
      toast.error("Please enter a valid year.");
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
      toast.error(getApiErrorMessage(err, "Registration failed"));
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
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto w-11 h-11 rounded-lg bg-primary flex items-center justify-center">
            {registrationResult ? (
              <MailCheck className="w-6 h-6 text-primary-foreground" />
            ) : (
              <GraduationCap className="w-6 h-6 text-primary-foreground" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {registrationResult
              ? "Verifikasi email diperlukan"
              : "Create your candidate account"}
          </CardTitle>
          <CardDescription>
            {registrationResult
              ? registrationResult.message
              : "Register to apply to an MBC Laboratory division."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {registrationResult ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 px-3 py-3 text-sm">
                <div className="font-medium">
                  Akun berhasil dibuat. Silakan cek email untuk verifikasi sebelum login.
                </div>
                {registrationResult.email && (
                  <div className="mt-2 break-all text-muted-foreground">
                    Email tujuan: {registrationResult.email}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild className="flex-1">
                  <Link to="/login">
                    <ArrowLeft className="w-4 h-4" />
                    Kembali ke Login
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={resending}
                  onClick={handleResendVerification}
                >
                  {resending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Mengirim...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Kirim Ulang Email Verifikasi
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="full_name">Full name</Label>
                <Input
                  id="full_name"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full legal name"
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
                />
                <p className="text-xs text-muted-foreground">
                  13 digits, starts with 103.
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
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@student.telkomuniversity.ac.id"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Minimum 8 characters.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="faculty">Fakultas</Label>
                <Input
                  id="faculty"
                  type="text"
                  required
                  value={faculty}
                  onChange={(e) => setFaculty(e.target.value)}
                  placeholder="Fakultas Informatika"
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
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Create account
                </>
              )}
            </Button>

            <p className="text-sm text-muted-foreground text-center">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-medium text-primary hover:underline"
              >
                Sign in
              </Link>
            </p>
          </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
