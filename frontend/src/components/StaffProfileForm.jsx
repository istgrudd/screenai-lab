import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, ShieldCheck } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { getMyProfile, updateMyProfile } from "@/lib/api";

const ROLE_LABEL = {
  super_admin: "Super Admin",
  recruiter: "Recruiter",
  candidate: "Candidate",
};

/**
 * Shared profile editor for non-candidate roles (recruiter + super_admin).
 * Both roles see the same three editable fields (name, email, password)
 * and a read-only role badge — no academic identity or division.
 */
export default function StaffProfileForm({ title, description }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await getMyProfile();
        if (!cancelled) {
          setProfile(me);
          setFullName(me.full_name || "");
          setEmail(me.email || "");
        }
      } catch (err) {
        toast.error(err.message || "Gagal memuat profil");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password && password !== passwordConfirm) {
      toast.error("Konfirmasi password tidak cocok.");
      return;
    }
    if (password && password.length < 8) {
      toast.error("Password minimal 8 karakter.");
      return;
    }

    const payload = {};
    if (profile && fullName.trim() !== (profile.full_name || ""))
      payload.full_name = fullName.trim();
    if (profile && email.trim() !== (profile.email || ""))
      payload.email = email.trim();
    if (password) payload.password = password;

    if (Object.keys(payload).length === 0) {
      toast.info("Tidak ada perubahan untuk disimpan.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateMyProfile(payload);
      setProfile(updated);
      setPassword("");
      setPasswordConfirm("");
      toast.success("Profil berhasil diperbarui.");
    } catch (err) {
      toast.error(err.message || "Gagal memperbarui profil");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!profile) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          {title}
        </h1>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-3">
            Akun Saya
            <Badge variant="secondary" className="text-[10px] uppercase">
              {ROLE_LABEL[profile.role] || profile.role}
            </Badge>
          </CardTitle>
          <CardDescription>
            Update nama, email, atau password akun kamu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={onSubmit}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div className="space-y-1.5">
              <Label
                htmlFor="full_name"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                Nama lengkap
              </Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={255}
                disabled={saving}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                disabled={saving}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="role"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                Role
              </Label>
              <Input
                id="role"
                value={ROLE_LABEL[profile.role] || profile.role}
                readOnly
                disabled
                className="bg-muted/50"
              />
            </div>
            <div /> {/* keep grid alignment */}

            <div className="md:col-span-2 border-t pt-4 mt-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                Ubah Password
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="password"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    Password baru
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Kosongkan jika tidak diubah"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={72}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="password_confirm"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    Konfirmasi password
                  </Label>
                  <Input
                    id="password_confirm"
                    type="password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    placeholder="Ulangi password baru"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={72}
                    disabled={saving || !password}
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-2 flex justify-end pt-2">
              <Button type="submit" disabled={saving} className="gap-2">
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Simpan Perubahan
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
