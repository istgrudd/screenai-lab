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

import AuthLayout from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
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

function initialVerificationState(code) {
  return {
    requestCode: code,
    status: code ? "loading" : "error",
    email: null,
    code: code ? null : "MISSING_CODE",
    message: code ? "Verifying email..." : null,
  };
}

function verificationCopy(code) {
  if (code === "MISSING_CODE") {
    return {
      title: "Verification link incomplete",
      description: "The verification code was not found in the email link.",
      canResend: true,
    };
  }
  if (code === "VERIFICATION_CODE_EXPIRED") {
    return {
      title: "Verification code expired",
      description: "Please request a new verification email to continue.",
      canResend: true,
    };
  }
  if (code === "VERIFICATION_CODE_USED") {
    return {
      title: "Verification code already used",
      description: "If your email is already verified, please return to login.",
      canResend: false,
    };
  }
  if (code === "INVALID_VERIFICATION_CODE") {
    return {
      title: "Verification code invalid",
      description: "The verification link cannot be used.",
      canResend: true,
    };
  }
  return {
    title: "Email verification failed",
    description: "The verification link cannot be processed at this time.",
    canResend: true,
  };
}

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code")?.trim() || "";
  const [state, setState] = useState(() => initialVerificationState(code));
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (!code) return;

    let cancelled = false;
    verifyEmailOnce(code).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setState({
          requestCode: code,
          status: "error",
          email: null,
          code: getApiErrorCode(error),
          message: getApiErrorMessage(error, "Email verification failed."),
        });
        return;
      }
      setState({
        requestCode: code,
        status: "success",
        email: data?.email || null,
        code: null,
        message: data?.message || "Email verified successfully. Please sign in.",
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
      toast.error("Email is required.");
      return;
    }

    setResending(true);
    setResendSent(false);
    try {
      await resendVerification(email);
      setResendSent(true);
      toast.success("If the candidate account is not yet verified, a verification email has been sent.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to resend the verification email."));
    } finally {
      setResending(false);
    }
  };

  const currentState =
    state.requestCode === code ? state : initialVerificationState(code);
  const isSuccess = currentState.status === "success";
  const isLoading = currentState.status === "loading";
  const copy = verificationCopy(currentState.code);

  return (
    <AuthLayout
      eyebrow="Account Verification"
      title="Email Verification"
      description={
        isLoading
          ? "Please wait a moment while we process the verification code."
          : isSuccess
            ? "Email verified successfully. You can now sign in to the recruitment portal."
            : copy.description
      }
      sideTitle="Activate your candidate account"
      sideDescription="Email verification ensures every candidate account is linked to the correct address before continuing the selection process."
    >
      <div className="space-y-5">
        {isLoading && (
          <div className="rounded-2xl border border-primary/15 bg-primary/10 px-4 py-5 text-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
              <div>
                <div className="font-heading text-base font-bold tracking-normal text-foreground">
                  Verifying email
                </div>
                <p className="mt-2 leading-6 text-muted-foreground">
                  {currentState.message || "Verifying email..."}
                </p>
              </div>
            </div>
          </div>
        )}

        {isSuccess && (
          <div className="rounded-2xl border border-primary/15 bg-primary/10 px-4 py-5 text-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="font-heading text-base font-bold tracking-normal text-foreground">
                  Account is active
                </div>
                <p className="mt-2 leading-6 text-muted-foreground">
                  {currentState.message}
                </p>
                {currentState.email && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-card/80 px-3 py-2 text-xs">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    <span className="break-all font-semibold text-foreground">
                      {currentState.email}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!isLoading && !isSuccess && (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-4 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">{copy.title}</div>
                <div className="mt-1 leading-6">{copy.description}</div>
                {currentState.message && (
                  <div className="mt-2 leading-6">{currentState.message}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {!isLoading && !isSuccess && copy.canResend && (
          <form onSubmit={handleResend} className="space-y-4 rounded-2xl border border-border/70 bg-muted/40 p-4">
            <div>
              <h2 className="font-heading text-sm font-bold tracking-normal text-foreground">
                Resend verification email
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Enter the candidate account email to receive a new verification link.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="resend_email">Email</Label>
              <Input
                id="resend_email"
                type="email"
                autoComplete="email"
                value={resendEmail}
                onChange={(event) => setResendEmail(event.target.value)}
                placeholder="nama@email.com"
                className="h-10 bg-card"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              className="h-10 w-full rounded-full bg-card"
              disabled={resending}
            >
              {resending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Resend Verification Email
                </>
              )}
            </Button>
            {resendSent && (
              <p className="rounded-xl bg-primary/10 px-3 py-2 text-xs leading-5 text-primary-deep">
                If the candidate account is not yet verified, a verification email has been sent.
              </p>
            )}
          </form>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            asChild
            className="brand-gradient h-10 flex-1 rounded-full shadow-sm hover:opacity-95"
          >
            <Link to="/login">
              <ArrowLeft className="h-4 w-4" />
              Back to Login
            </Link>
          </Button>
          {!isLoading && !isSuccess && !copy.canResend && (
            <Button asChild variant="outline" className="h-10 flex-1 rounded-full">
              <Link to="/forgot-password">
                <Mail className="h-4 w-4" />
                Account Help
              </Link>
            </Button>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
