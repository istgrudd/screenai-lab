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
import FacultyMajorSelect from "@/components/forms/FacultyMajorSelect";
import YearSelect from "@/components/forms/YearSelect";
import { updateMyProfile } from "@/lib/api";

const WHATSAPP_ERROR =
  "Invalid WhatsApp number. Use the format 08..., 628..., or +628...";
const IPK_ERROR =
  "GPA must be a number from 0.00 to 4.00 with at most 2 decimals.";

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

function isValidIpk(value) {
  // Accept a comma decimal separator: the iOS decimal keypad renders the
  // separator per device locale, and the Indonesian locale shows only a comma.
  // Normalize to the canonical period form before validating.
  const trimmed = String(value).trim().replace(/,/g, ".");
  if (!trimmed) return true;
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return false;
  const number = Number(trimmed);
  return Number.isFinite(number) && number >= 0 && number <= 4;
}

function formatIpkForInput(value) {
  if (value == null || value === "") return "";
  const number = Number(value);
  return Number.isNaN(number) ? "" : number.toFixed(2);
}

function LockHint({ message = "Cannot be changed after submission." }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center text-muted-foreground"
          aria-label="Field locked"
        >
          <Lock className="w-3.5 h-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{message}</TooltipContent>
    </Tooltip>
  );
}

function FieldLabel({ children, htmlFor, locked, lockMessage }) {
  return (
    <Label
      htmlFor={htmlFor}
      className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground"
    >
      {children}
      {locked && <LockHint message={lockMessage} />}
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
  const [ipk, setIpk] = useState(formatIpkForInput(profile.ipk));
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const ipkLocked = profile.ipk_editable === false;

  const onSubmit = async (event) => {
    event.preventDefault();

    if (password && password !== passwordConfirm) {
      toast.error("Password confirmation does not match.");
      return;
    }
    if (password && password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (!isValidIndonesianWhatsapp(whatsapp || "")) {
      toast.error(WHATSAPP_ERROR);
      return;
    }
    if (!whatsapp.trim()) {
      toast.error("WhatsApp number is required before submitting your application.");
      return;
    }
    if (!isValidIpk(ipk || "")) {
      toast.error(IPK_ERROR);
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
    if (!ipkLocked) {
      // Belt-and-suspenders: normalize again here so paste/autofill values that
      // bypass the onChange normalization are still sent in the period form.
      const ipkText = String(ipk || "").replace(/,/g, ".").trim();
      const currentIpk = profile.ipk == null ? null : Number(profile.ipk);
      if (!ipkText && currentIpk != null) {
        payload.ipk = null;
      } else if (ipkText) {
        const nextIpk = Number(ipkText);
        if (currentIpk == null || nextIpk !== currentIpk) {
          payload.ipk = nextIpk;
        }
      }
    }

    if (password) payload.password = password;

    if (Object.keys(payload).length === 0) {
      toast.info("No changes to save.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateMyProfile(payload);
      toast.success("Profile updated successfully.");
      setPassword("");
      setPasswordConfirm("");
      onSaved(updated);
    } catch (error) {
      const message = error.message || "Failed to update profile";
      if (error.detail?.locked_fields?.includes("ipk")) {
        toast.error("GPA cannot be changed in the current application status.");
      } else if (error.detail?.locked_fields?.length) {
        toast.error("Locked fields cannot be changed after submission.");
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
        <FieldLabel htmlFor="full_name">Full name</FieldLabel>
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
        <FieldLabel htmlFor="whatsapp">WhatsApp Number</FieldLabel>
        <Input
          id="whatsapp"
          type="tel"
          inputMode="tel"
          value={whatsapp}
          onChange={(event) => setWhatsapp(event.target.value)}
          maxLength={32}
          placeholder="+628123456789"
          disabled={saving}
          required
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
      <FacultyMajorSelect
        faculty={faculty}
        major={major}
        onFacultyChange={setFaculty}
        onMajorChange={setMajor}
        disabled={saving || locked}
        fieldClassName="space-y-1.5"
        facultyLabel={
          <FieldLabel htmlFor="faculty" locked={locked}>
            Faculty
          </FieldLabel>
        }
        majorLabel={
          <FieldLabel htmlFor="major" locked={locked}>
            Major
          </FieldLabel>
        }
      />
      <div className="space-y-1.5">
        <FieldLabel htmlFor="year" locked={locked}>
          Year
        </FieldLabel>
        <YearSelect
          id="year"
          value={year}
          onChange={setYear}
          disabled={saving || locked}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel
          htmlFor="ipk"
          locked={ipkLocked}
          lockMessage="GPA is locked after submission unless the KHS is rejected for correction."
        >
          GPA
        </FieldLabel>
        <Input
          id="ipk"
          type="text"
          inputMode="decimal"
          value={ipk}
          onChange={(event) => setIpk(event.target.value.replace(/,/g, "."))}
          placeholder="e.g., 3.75"
          disabled={saving || ipkLocked}
          readOnly={ipkLocked}
        />
        <p className="text-xs leading-5 text-muted-foreground">
          You can type a dot or a comma — e.g., 3.75.
        </p>
      </div>

      <div className="md:col-span-2 border-t pt-4 mt-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
          Change Password
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="password"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              New password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Leave blank to keep current"
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
              Confirm password
            </Label>
            <Input
              id="password_confirm"
              type="password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              placeholder="Repeat new password"
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
          Save Changes
        </Button>
      </div>
    </form>
  );
}
