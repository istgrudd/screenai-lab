import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Mail,
  ShieldCheck,
  Swords,
  Map as MapIcon,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  createApplication,
  getMe,
  getMyApplication,
} from "@/lib/api";

const DIVISIONS = [
  {
    id: "big_data",
    name: "Big Data",
    blurb: "Data pipelines, analytics, and large-scale data engineering.",
    icon: BarChart3,
    accent: "from-sky-500/10 to-sky-500/5",
  },
  {
    id: "cyber_security",
    name: "Cyber Security",
    blurb: "Offensive & defensive security research, CTFs, and audits.",
    icon: ShieldCheck,
    accent: "from-emerald-500/10 to-emerald-500/5",
  },
  {
    id: "game_tech",
    name: "Game Technology",
    blurb: "Game engines, interactive experiences, and graphics programming.",
    icon: Swords,
    accent: "from-rose-500/10 to-rose-500/5",
  },
  {
    id: "gis",
    name: "Geographic Information Systems",
    blurb: "Spatial data, mapping, and geospatial analysis.",
    icon: MapIcon,
    accent: "from-amber-500/10 to-amber-500/5",
  },
];

function ProfileCard({ user }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Personal Information</CardTitle>
        <CardDescription>
          Pulled from your registration. Contact an administrator if you need a correction.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <Field label="Full name" value={user.full_name} />
        <Field label="NIM" value={user.nim} mono />
        <Field label="Email" value={user.email} icon={Mail} />
        <Field label="Angkatan" value={user.year} />
        <Field label="Fakultas" value={user.faculty} />
        <Field label="Jurusan" value={user.major} />
      </CardContent>
    </Card>
  );
}

function Field({ label, value, mono, icon: Icon }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </p>
      <p
        className={`${
          mono ? "font-mono" : ""
        } flex items-center gap-2 text-foreground`}
      >
        {Icon ? <Icon className="w-3.5 h-3.5 text-muted-foreground" /> : null}
        {value || <span className="text-muted-foreground italic">—</span>}
      </p>
    </div>
  );
}

function DivisionCard({ division, selected, disabled, onSelect }) {
  const Icon = division.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(division.id)}
      disabled={disabled}
      className={`group text-left rounded-2xl border p-5 transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? "border-primary ring-2 ring-primary/30 bg-primary/5"
          : "border-border hover:border-primary/60 hover:shadow-sm"
      } bg-gradient-to-br ${division.accent}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center ${
            selected ? "bg-primary text-primary-foreground" : "bg-background border"
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground">{division.name}</p>
            {selected && (
              <Badge variant="default" className="text-[10px]">
                Selected
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {division.blurb}
          </p>
        </div>
      </div>
    </button>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [application, setApplication] = useState(null);
  const [selectedDivision, setSelectedDivision] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const me = await getMe();
        if (!cancelled) setUser(me);
      } catch (err) {
        toast.error(err.message || "Failed to load profile");
      }
      try {
        const app = await getMyApplication();
        if (!cancelled) {
          setApplication(app);
          setSelectedDivision(app.division);
        }
      } catch (err) {
        if (!err.message?.toLowerCase().includes("not found")) {
          // 404 is expected when no application exists yet.
          console.warn("getMyApplication:", err.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasApplication = Boolean(application);
  const isSubmitted = application && application.status !== "draft";

  const handleStart = async () => {
    if (!selectedDivision) {
      toast.error("Pick a division first.");
      return;
    }
    setSaving(true);
    try {
      const app = await createApplication(selectedDivision);
      setApplication(app);
      toast.success("Application started. Next: upload your documents.");
      navigate("/documents");
    } catch (err) {
      toast.error(err.message || "Could not start application");
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

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-primary" />
          Your Profile
        </h1>
        <p className="text-muted-foreground mt-1">
          Confirm your information, then select the division you want to apply to.
        </p>
      </div>

      <ProfileCard user={user} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Division Selection</CardTitle>
          <CardDescription>
            {hasApplication
              ? "You've already started an application for one division. This selection is locked to keep your application consistent."
              : "Choose one division to apply to. You can only apply to one per recruitment period."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {DIVISIONS.map((d) => (
              <DivisionCard
                key={d.id}
                division={d}
                selected={selectedDivision === d.id}
                disabled={hasApplication}
                onSelect={setSelectedDivision}
              />
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t">
            <div className="text-sm text-muted-foreground">
              {hasApplication ? (
                <span className="inline-flex items-center gap-2 text-foreground">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Application started — status{" "}
                  <Badge
                    variant={isSubmitted ? "default" : "secondary"}
                    className="ml-1 text-[10px] uppercase"
                  >
                    {application.status}
                  </Badge>
                </span>
              ) : (
                "Ready when you are."
              )}
            </div>
            {hasApplication ? (
              <Button
                onClick={() =>
                  navigate(isSubmitted ? "/submitted" : "/documents")
                }
                className="gap-2"
              >
                {isSubmitted ? "View status" : "Continue to documents"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleStart}
                disabled={!selectedDivision || saving}
                className="gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    Start application
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
