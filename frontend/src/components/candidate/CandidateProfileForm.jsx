import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { updateMyProfile } from "@/lib/api";

const WHATSAPP_ERROR =
  "Nomor WhatsApp tidak valid. Gunakan format 08..., 628..., atau +628...";

function isValidIndonesianWhatsapp(value) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return false;

  const normalized = trimmed.replace(/[\s().-]/g, "");
  if (!/^\+?\d+$/.test(normalized)) return false;

  const digits = normalized.startsWith("+")
    ? normalized.slice(1)
    : normalized;
  if (digits.length < 10 || digits.length > 15) return false;

  return (
    /^08\d+$/.test(normalized) ||
    /^628\d+$/.test(normalized) ||
    /^\+628\d+$/.test(normalized)
  );
}

function LockHint() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center text-muted-foreground"
          aria-label="Field terkunci"
        >
          <Lock className="w-3.5 h-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Tidak dapat diubah setelah submit.</TooltipContent>
    </Tooltip>
  );
}

function FieldLabel({ children, htmlFor, locked }) {
  return (
    <Label
      htmlFor={htmlFor}
      className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground"
    >
      {children}
      {locked && <LockHint />}
    </Label>
  );
}

export default function CandidateProfileForm({ profile, locked, onSaved }) {
  const [fullName, setFullName] = useState(profile.full_name || "");
  const [email, setEmail] = useState(profile.email || "");
  const [whatsapp, setWhatsapp] = useState(profile.whatsapp || "");
  const [nim, setNim] = useState(profile.nim || "");
  const [faculty, setFaculty] = useState(profile.faculty || "");
  const [major, setMajor] = useState(profile.major || "");
  const [year, setYear] = useState(
    profile.year != null ? String(profile.year) : ""
  );
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();

    if (password && password !== passwordConfirm) {
      toast.error("Konfirmasi password tidak cocok.");
      return;
    }
    if (password && password.length < 8) {
      toast.error("Password minimal 8 karakter.");
      return;
    }
    if (!isValidIndonesianWhatsapp(whatsapp || "")) {
      toast.error(WHATSAPP_ERROR);
      return;
    }

    const payload = {};
    if (fullName.trim() !== (profile.full_name || "")) {
      payload.full_name = fullName.trim();
    }
    if (email.trim() !== (profile.email || "")) {
      payload.email = email.trim();
    }
    if ((whatsapp || "").trim() !== (profile.whatsapp || "")) {
      payload.whatsapp = whatsapp.trim();
    }

    if (!locked) {
      if (nim.trim() !== (profile.nim || "")) payload.nim = nim.trim();
      if (faculty.trim() !== (profile.faculty || "")) {
        payload.faculty = faculty.trim();
      }
      if (major.trim() !== (profile.major || "")) {
        payload.major = major.trim();
      }
      const yearNum = year === "" ? null : Number(year);
      if (yearNum != null && yearNum !== profile.year) payload.year = yearNum;
    }

    if (password) payload.password = password;

    if (Object.keys(payload).length === 0) {
      toast.info("Tidak ada perubahan untuk disimpan.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateMyProfile(payload);
      toast.success("Profil berhasil diperbarui.");
      setPassword("");
      setPasswordConfirm("");
      onSaved(updated);
    } catch (error) {
      const message = error.message || "Gagal memperbarui profil";
      if (message.includes("locked_fields")) {
        toast.error("Field terkunci tidak dapat diubah setelah submit.");
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <FieldLabel htmlFor="full_name">Nama lengkap</FieldLabel>
        <Input
          id="full_name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          maxLength={255}
          disabled={saving}
          required
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={255}
          disabled={saving}
          required
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="whatsapp">Nomor WhatsApp</FieldLabel>
        <Input
          id="whatsapp"
          type="tel"
          inputMode="tel"
          value={whatsapp}
          onChange={(event) => setWhatsapp(event.target.value)}
          maxLength={32}
          placeholder="+628123456789"
          disabled={saving}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="nim" locked={locked}>
          NIM
        </FieldLabel>
        <Input
          id="nim"
          value={nim}
          onChange={(event) => setNim(event.target.value)}
          minLength={10}
          maxLength={20}
          disabled={saving || locked}
          readOnly={locked}
          className="font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="faculty" locked={locked}>
          Fakultas
        </FieldLabel>
        <Input
          id="faculty"
          value={faculty}
          onChange={(event) => setFaculty(event.target.value)}
          maxLength={255}
          disabled={saving || locked}
          readOnly={locked}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="major" locked={locked}>
          Jurusan
        </FieldLabel>
        <Input
          id="major"
          value={major}
          onChange={(event) => setMajor(event.target.value)}
          maxLength={255}
          disabled={saving || locked}
          readOnly={locked}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="year" locked={locked}>
          Angkatan
        </FieldLabel>
        <Input
          id="year"
          type="number"
          min={2000}
          max={2100}
          value={year}
          onChange={(event) => setYear(event.target.value)}
          disabled={saving || locked}
          readOnly={locked}
        />
      </div>

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
              onChange={(event) => setPassword(event.target.value)}
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
              onChange={(event) => setPasswordConfirm(event.target.value)}
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
  );
}
