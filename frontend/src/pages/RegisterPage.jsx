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
import FacultyMajorSelect from "@/components/forms/FacultyMajorSelect";
import YearSelect from "@/components/forms/YearSelect";

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

export default function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [nim, setNim] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [faculty, setFaculty] = useState("");
  const [major, setMajor] = useState("");
  const [year, setYear] = useState("");
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
      toast.error("All fields are required.");
      return;
    }
    if (!NIM_PATTERN.test(trimmed.nim)) {
      toast.error("NIM must be numeric with at least 10 digits.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    const yearNum = Number(year);
    if (!Number.isInteger(yearNum)) {
      toast.error("Please select a valid year.");
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
          "Account created successfully. Please check your email to verify before signing in.",
      });
      setPassword("");
      toast.success(
        "Account created successfully. Please check your email to verify before signing in."
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
      toast.error("No destination email available.");
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
      eyebrow="Candidate Registration"
      title={registrationResult ? "Email Verification Required" : "Create Candidate Account"}
      description={
        registrationResult
          ? "One more step before you can sign in to the recruitment portal."
          : "Start your selection journey with MBC Laboratory."
      }
      sideTitle="Join MBC Laboratory"
      sideDescription="Complete your candidate details and choose the right division track to take part in the ScreenAI Lab selection."
      footer={
        !registrationResult && (
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Sign in
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
                  Candidate account created
                </div>
                <p className="mt-2 leading-6 text-muted-foreground">
                  {registrationResult.message}
                </p>
                {registrationResult.email && (
                  <div className="mt-3 rounded-xl bg-card/80 px-3 py-2 text-xs text-muted-foreground">
                    Destination email:{" "}
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
                Back to Login
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
                  Sending...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Resend Email
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
                Candidate Identity
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Use accurate academic data for verification.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="full_name">Full name</Label>
                <Input
                  id="full_name"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Name as in academic records"
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
                  Enter your numeric NIM as in academic records.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <YearSelect
                  id="year"
                  required
                  value={year}
                  onChange={setYear}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="font-heading text-sm font-bold tracking-normal text-foreground">
                Contact & Account
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                This email will receive the verification link and selection updates.
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
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Minimum 8 characters.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="font-heading text-sm font-bold tracking-normal text-foreground">
                Study Program
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                This helps the team review the candidate's academic profile.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FacultyMajorSelect
                required
                faculty={faculty}
                major={major}
                onFacultyChange={setFaculty}
                onMajorChange={setMajor}
              />
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
                Creating account...
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                Create Candidate Account
              </>
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
