import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, Mail, Send } from "lucide-react";

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
import { forgotPassword, getApiErrorMessage } from "@/lib/api";

const GENERIC_SUCCESS_MESSAGE =
  "Jika email terdaftar, link reset password telah dikirim.";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast.error("Email wajib diisi.");
      return;
    }

    setSubmitting(true);
    try {
      await forgotPassword(trimmedEmail);
      setSubmitted(true);
      toast.success(GENERIC_SUCCESS_MESSAGE);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Permintaan reset password gagal."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto w-11 h-11 rounded-lg bg-primary flex items-center justify-center">
            {submitted ? (
              <CheckCircle2 className="w-6 h-6 text-primary-foreground" />
            ) : (
              <Mail className="w-6 h-6 text-primary-foreground" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {submitted ? "Cek email kamu" : "Reset password"}
          </CardTitle>
          <CardDescription>
            {submitted
              ? GENERIC_SUCCESS_MESSAGE
              : "Masukkan email akun untuk menerima link reset password."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Mengirim...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Kirim Link Reset
                  </>
                )}
              </Button>
            </form>
          ) : (
            <div className="rounded-lg border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
              Periksa inbox dan folder spam, lalu buka link reset password dari email.
            </div>
          )}

          <Button asChild variant={submitted ? "default" : "outline"} className="w-full">
            <Link to="/login">
              <ArrowLeft className="w-4 h-4" />
              Kembali ke Login
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
