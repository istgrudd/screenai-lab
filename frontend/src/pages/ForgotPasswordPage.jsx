import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, Mail, Send } from "lucide-react";

import AuthLayout from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPassword, getApiErrorMessage } from "@/lib/api";

const GENERIC_SUCCESS_MESSAGE =
  "If the email is registered, a password reset link has been sent.";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast.error("Email is required.");
      return;
    }

    setSubmitting(true);
    try {
      await forgotPassword(trimmedEmail);
      setSubmitted(true);
      toast.success(GENERIC_SUCCESS_MESSAGE);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Password reset request failed."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Account Help"
      title={submitted ? "Check Your Email" : "Forgot Password?"}
      description={
        submitted
          ? GENERIC_SUCCESS_MESSAGE
          : "Enter your account email. If it's registered, a password reset link will be sent to it."
      }
      sideTitle="Your account access stays secure"
      sideDescription="The portal only sends reset instructions to registered emails, so candidate account information stays protected."
    >
      <div className="space-y-5">
        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nama@email.com"
                className="h-10 bg-input/70"
              />
            </div>
            <Button
              type="submit"
              className="brand-gradient h-10 w-full rounded-full shadow-sm hover:opacity-95"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Reset Link
                </>
              )}
            </Button>
          </form>
        ) : (
          <div className="rounded-2xl border border-primary/15 bg-primary/10 px-4 py-5 text-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <div className="font-heading text-base font-bold tracking-normal text-foreground">
                  Reset instructions processed
                </div>
                <p className="mt-2 leading-6 text-muted-foreground">
                  Check your inbox and spam folder, then open the password reset link from the email.
                </p>
              </div>
            </div>
          </div>
        )}

        <Button
          asChild
          variant={submitted ? "default" : "outline"}
          className={
            submitted
              ? "brand-gradient h-10 w-full rounded-full shadow-sm hover:opacity-95"
              : "h-10 w-full rounded-full"
          }
        >
          <Link to="/login">
            {submitted ? (
              <ArrowLeft className="h-4 w-4" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Back to Login
          </Link>
        </Button>
      </div>
    </AuthLayout>
  );
}
