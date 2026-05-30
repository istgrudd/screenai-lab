import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { AlertCircle, BarChart3, KeyRound, Loader2, LogIn, RefreshCw } from "lucide-react";

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
  login as loginApi,
  resendVerification,
} from "@/lib/api";
import {
  saveToken,
  isAuthenticated,
  getCurrentUser,
  defaultPathForRole,
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

  useEffect(() => {
    if (isAuthenticated()) {
      const user = getCurrentUser();
      navigate(defaultPathForRole(user?.role), { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (location.state?.registered) {
      toast.success("Account created. Please check your email before logging in.");
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
      toast.success(`Welcome back, ${data.user.full_name}`);
      navigate(defaultPathForRole(data.user.role), { replace: true });
    } catch (err) {
      if (getApiErrorCode(err) === "EMAIL_NOT_VERIFIED") {
        const message =
          "Email belum diverifikasi. Silakan cek email verifikasi sebelum login.";
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
      toast.error("Email wajib diisi.");
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
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto w-11 h-11 rounded-lg bg-primary flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Sign in to ScreenAI Lab</CardTitle>
          <CardDescription>
            Access the MBC Laboratory recruitment portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <KeyRound className="w-3 h-3" />
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign in
                </>
              )}
            </Button>
            {loginError && (
              <div className="space-y-3 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 w-4 h-4" />
                  <div>{loginError}</div>
                </div>
                {unverifiedEmail && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-destructive/30 bg-background text-foreground hover:bg-muted"
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
                )}
              </div>
            )}
            <p className="text-sm text-muted-foreground text-center">
              Don't have an account?{" "}
              <Link
                to="/register"
                className="font-medium text-primary hover:underline"
              >
                Register
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
