import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Send,
} from "lucide-react";

import AuthLayout from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getApiErrorCode,
  getApiErrorMessage,
  resetPassword,
} from "@/lib/api";
import { removeToken } from "@/lib/auth";

function resetErrorCopy(code, fallbackMessage) {
  if (code === "MISSING_CODE") {
    return {
      title: "Link reset tidak lengkap",
      description: "Kode reset password tidak ditemukan pada link email.",
    };
  }
  if (code === "RESET_CODE_EXPIRED") {
    return {
      title: "Kode reset kedaluwarsa",
      description: "Silakan minta link reset password baru.",
    };
  }
  if (code === "RESET_CODE_USED") {
    return {
      title: "Kode reset sudah digunakan",
      description: "Kode reset password ini sudah pernah digunakan.",
    };
  }
  if (code === "INVALID_RESET_CODE") {
    return {
      title: "Kode reset tidak valid",
      description: "Link reset password tidak dapat digunakan.",
    };
  }
  return {
    title: "Reset password gagal",
    description: fallbackMessage || "Password belum dapat direset saat ini.",
  };
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code")?.trim() || "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorState, setErrorState] = useState(
    code ? null : { code: "MISSING_CODE", message: null }
  );
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorState(null);

    if (!code) {
      setErrorState({ code: "MISSING_CODE", message: null });
      return;
    }
    if (!newPassword) {
      toast.error("Password baru wajib diisi.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Konfirmasi password harus sama.");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(code, newPassword);
      removeToken();
      setSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password berhasil direset. Silakan login ulang.");
    } catch (error) {
      setErrorState({
        code: getApiErrorCode(error),
        message: getApiErrorMessage(error, "Reset password gagal."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const errorCopy = errorState
    ? resetErrorCopy(errorState.code, errorState.message)
    : null;
  const terminalCodeError =
    errorState &&
    [
      "MISSING_CODE",
      "INVALID_RESET_CODE",
      "RESET_CODE_EXPIRED",
      "RESET_CODE_USED",
    ].includes(errorState.code);

  return (
    <AuthLayout
      eyebrow="Keamanan Akun"
      title={
        success
          ? "Password Berhasil Direset"
          : terminalCodeError
            ? errorCopy.title
            : "Atur Password Baru"
      }
      description={
        success
          ? "Silakan login ulang menggunakan password baru."
          : terminalCodeError
            ? errorCopy.description
            : "Masukkan password baru untuk mengamankan akses akun kandidat."
      }
      sideTitle="Pulihkan akses portal"
      sideDescription="Gunakan link reset dari email resmi untuk mengganti password dan kembali melanjutkan proses rekrutmen."
    >
      <div className="space-y-5">
        {success ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-primary/15 bg-primary/10 px-4 py-5 text-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-heading text-base font-bold tracking-normal text-foreground">
                    Password baru sudah aktif
                  </div>
                  <p className="mt-2 leading-6 text-muted-foreground">
                    Token sesi lama telah dihapus. Masuk kembali untuk melanjutkan.
                  </p>
                </div>
              </div>
            </div>
            <Button asChild className="brand-gradient h-10 w-full rounded-full shadow-sm hover:opacity-95">
              <Link to="/login">
                <ArrowLeft className="h-4 w-4" />
                Kembali ke Login
              </Link>
            </Button>
          </div>
        ) : (
          <>
            {code && !terminalCodeError && (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="new_password">Password baru</Label>
                  <div className="relative">
                    <Input
                      id="new_password"
                      type={showNewPassword ? "text" : "password"}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className="h-10 bg-input/70 pr-11"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowNewPassword((value) => !value)}
                      aria-label={
                        showNewPassword ? "Sembunyikan password baru" : "Tampilkan password baru"
                      }
                    >
                      {showNewPassword ? (
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

                <div className="space-y-2">
                  <Label htmlFor="confirm_password">Konfirmasi password</Label>
                  <div className="relative">
                    <Input
                      id="confirm_password"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="h-10 bg-input/70 pr-11"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowConfirmPassword((value) => !value)}
                      aria-label={
                        showConfirmPassword
                          ? "Sembunyikan konfirmasi password"
                          : "Tampilkan konfirmasi password"
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
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
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Reset Password
                    </>
                  )}
                </Button>
              </form>
            )}

            {errorState && (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-4 text-sm text-destructive">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-semibold">{errorCopy.title}</div>
                    <div className="mt-1 leading-6">{errorCopy.description}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="outline" className="h-10 flex-1 rounded-full">
                <Link to="/login">
                  <ArrowLeft className="h-4 w-4" />
                  Kembali ke Login
                </Link>
              </Button>
              {errorState && (
                <Button asChild className="brand-gradient h-10 flex-1 rounded-full shadow-sm hover:opacity-95">
                  <Link to="/forgot-password">
                    <KeyRound className="h-4 w-4" />
                    Minta Link Baru
                  </Link>
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
