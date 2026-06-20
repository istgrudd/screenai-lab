import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2, LogIn, RefreshCw } from "lucide-react";

import AuthLayout from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  getApiErrorCode,
  getApiErrorMessage,
  login as loginApi,
  resendVerification,
} from "@/lib/api";
import {
  defaultPathForRole,
  getCurrentUser,
  isAuthenticated,
  saveToken,
} from "@/lib/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [loginError, setLoginError] = useState("");
  const [resending, setResending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      const user = getCurrentUser();
      navigate(defaultPathForRole(user?.role), { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (location.state?.registered) {
      toast.success("Account created successfully. Please check your email before signing in.");
    }
  }, [location.state]);

  const onSubmit = async (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      toast.error("Email and password are required.");
      return;
    }
    setSubmitting(true);
    setLoginError("");
    setUnverifiedEmail("");
    try {
      const data = await loginApi(trimmedEmail, password);
      saveToken(data.access_token);
      toast.success(`Welcome, ${data.user.full_name}`);
      navigate(defaultPathForRole(data.user.role), { replace: true });
    } catch (err) {
      if (getApiErrorCode(err) === "EMAIL_NOT_VERIFIED") {
        const message =
          "Email not verified. Please check your verification email before signing in.";
        setUnverifiedEmail(trimmedEmail);
        setLoginError(message);
        toast.error(message);
      } else {
        const message = getApiErrorMessage(err, "Login failed");
        setLoginError(message);
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    const targetEmail = unverifiedEmail || email.trim();
    if (!targetEmail) {
      toast.error("Email is required.");
      return;
    }

    setResending(true);
    try {
      await resendVerification(targetEmail);
      toast.success("If the candidate account is not yet verified, a verification email has been sent.");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to resend the verification email."));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Candidate Portal"
      title="Sign in to the MBC Lab Recruitment Portal"
      description="Manage your registration, documents, and selection status in one place."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/register" className="font-semibold text-primary hover:underline">
            Create an account
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@email.com"
            className="h-10 bg-input/70"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/forgot-password"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
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
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
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
              Processing...
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              Sign in
            </>
          )}
        </Button>

        {loginError && (
          <div className="space-y-3 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-4 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Access not available yet</div>
                <div className="mt-1 leading-6">{loginError}</div>
              </div>
            </div>
            {unverifiedEmail && (
              <Button
                type="button"
                variant="outline"
                className="h-9 w-full rounded-full border-destructive/30 bg-card text-foreground hover:bg-muted"
                disabled={resending}
                onClick={handleResendVerification}
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
            )}
          </div>
        )}
      </form>
    </AuthLayout>
  );
}
