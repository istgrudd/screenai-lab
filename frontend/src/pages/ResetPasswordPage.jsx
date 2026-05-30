import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Send,
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
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto w-11 h-11 rounded-lg bg-primary flex items-center justify-center">
            {success ? (
              <CheckCircle2 className="w-6 h-6 text-primary-foreground" />
            ) : terminalCodeError ? (
              <AlertCircle className="w-6 h-6 text-primary-foreground" />
            ) : (
              <KeyRound className="w-6 h-6 text-primary-foreground" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {success
              ? "Password berhasil direset"
              : terminalCodeError
                ? errorCopy.title
                : "Buat password baru"}
          </CardTitle>
          <CardDescription>
            {success
              ? "Silakan login ulang menggunakan password baru."
              : terminalCodeError
                ? errorCopy.description
                : "Masukkan password baru untuk akun kamu."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {success ? (
            <Button asChild className="w-full">
              <Link to="/login">
                <ArrowLeft className="w-4 h-4" />
                Kembali ke Login
              </Link>
            </Button>
          ) : (
            <>
              {code && !terminalCodeError && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new_password">Password baru</Label>
                    <Input
                      id="new_password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum 8 karakter.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm_password">Konfirmasi password</Label>
                    <Input
                      id="confirm_password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Reset Password
                      </>
                    )}
                  </Button>
                </form>
              )}

              {errorState && (
                <div className="space-y-3 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                  <div className="font-medium">{errorCopy.title}</div>
                  <div>{errorCopy.description}</div>
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild variant="outline" className="flex-1">
                  <Link to="/login">
                    <ArrowLeft className="w-4 h-4" />
                    Kembali ke Login
                  </Link>
                </Button>
                {errorState && (
                  <Button asChild className="flex-1">
                    <Link to="/forgot-password">
                      <KeyRound className="w-4 h-4" />
                      Minta Link Baru
                    </Link>
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
