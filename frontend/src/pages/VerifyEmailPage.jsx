import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
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
  getApiErrorCode,
  getApiErrorMessage,
  resendVerification,
  verifyEmail,
} from "@/lib/api";

const verifyEmailRequests = new Map();

function verifyEmailOnce(code) {
  if (!verifyEmailRequests.has(code)) {
    verifyEmailRequests.set(
      code,
      verifyEmail(code)
        .then((data) => ({ data, error: null }))
        .catch((error) => ({ data: null, error }))
    );
  }
  return verifyEmailRequests.get(code);
}

function verificationCopy(code) {
  if (code === "MISSING_CODE") {
    return {
      title: "Link verifikasi tidak lengkap",
      description: "Kode verifikasi tidak ditemukan pada link email.",
      canResend: true,
    };
  }
  if (code === "VERIFICATION_CODE_EXPIRED") {
    return {
      title: "Kode verifikasi kedaluwarsa",
      description: "Silakan minta email verifikasi baru untuk melanjutkan.",
      canResend: true,
    };
  }
  if (code === "VERIFICATION_CODE_USED") {
    return {
      title: "Kode verifikasi sudah digunakan",
      description: "Jika email sudah terverifikasi, silakan kembali ke login.",
      canResend: false,
    };
  }
  if (code === "INVALID_VERIFICATION_CODE") {
    return {
      title: "Kode verifikasi tidak valid",
      description: "Link verifikasi tidak dapat digunakan.",
      canResend: true,
    };
  }
  return {
    title: "Verifikasi email gagal",
    description: "Link verifikasi tidak dapat diproses saat ini.",
    canResend: true,
  };
}

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code")?.trim() || "";
  const [state, setState] = useState({
    status: code ? "loading" : "error",
    email: null,
    code: code ? null : "MISSING_CODE",
    message: code ? "Memverifikasi email..." : null,
  });
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (!code) {
      setState({
        status: "error",
        email: null,
        code: "MISSING_CODE",
        message: null,
      });
      return;
    }

    let cancelled = false;
    setState({
      status: "loading",
      email: null,
      code: null,
      message: "Memverifikasi email...",
    });

    verifyEmailOnce(code).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setState({
          status: "error",
          email: null,
          code: getApiErrorCode(error),
          message: getApiErrorMessage(error, "Verifikasi email gagal."),
        });
        return;
      }
      setState({
        status: "success",
        email: data?.email || null,
        code: null,
        message: data?.message || "Email berhasil diverifikasi. Silakan login.",
      });
    });

    return () => {
      cancelled = true;
    };
  }, [code]);

  const handleResend = async (event) => {
    event.preventDefault();
    const email = resendEmail.trim();
    if (!email) {
      toast.error("Email wajib diisi.");
      return;
    }

    setResending(true);
    setResendSent(false);
    try {
      await resendVerification(email);
      setResendSent(true);
      toast.success("Jika akun kandidat belum diverifikasi, email verifikasi telah dikirim.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Gagal mengirim ulang email verifikasi."));
    } finally {
      setResending(false);
    }
  };

  const isSuccess = state.status === "success";
  const isLoading = state.status === "loading";
  const copy = verificationCopy(state.code);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto w-11 h-11 rounded-lg bg-primary flex items-center justify-center">
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-primary-foreground" />
            ) : isSuccess ? (
              <ShieldCheck className="w-6 h-6 text-primary-foreground" />
            ) : (
              <AlertCircle className="w-6 h-6 text-primary-foreground" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {isLoading
              ? "Memverifikasi email"
              : isSuccess
                ? "Email berhasil diverifikasi"
                : copy.title}
          </CardTitle>
          <CardDescription>
            {isLoading
              ? "Mohon tunggu sebentar."
              : isSuccess
                ? state.message
                : copy.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isSuccess && state.email && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span className="break-all">{state.email}</span>
            </div>
          )}

          {!isLoading && !isSuccess && state.message && (
            <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.message}
            </div>
          )}

          {!isLoading && !isSuccess && copy.canResend && (
            <form onSubmit={handleResend} className="space-y-3 rounded-lg border p-3">
              <div className="space-y-2">
                <Label htmlFor="resend_email">Email</Label>
                <Input
                  id="resend_email"
                  type="email"
                  autoComplete="email"
                  value={resendEmail}
                  onChange={(event) => setResendEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <Button type="submit" variant="outline" className="w-full" disabled={resending}>
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
              {resendSent && (
                <p className="text-xs text-muted-foreground">
                  Jika akun kandidat belum diverifikasi, email verifikasi telah dikirim.
                </p>
              )}
            </form>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="flex-1">
              <Link to="/login">
                <ArrowLeft className="w-4 h-4" />
                Kembali ke Login
              </Link>
            </Button>
            {!isLoading && !isSuccess && !copy.canResend && (
              <Button asChild variant="outline" className="flex-1">
                <Link to="/forgot-password">
                  <Mail className="w-4 h-4" />
                  Bantuan Akun
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
