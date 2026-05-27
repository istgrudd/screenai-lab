import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  ShieldCheck,
  Swords,
  Map as MapIcon,
} from "lucide-react";

export const DIVISIONS = [
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
    blurb: "Offensive and defensive security research, CTFs, and audits.",
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

function DivisionCard({ division, selected, disabled, onSelect }) {
  const Icon = division.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(division.id)}
      disabled={disabled}
      className={`group text-left rounded-xl border p-5 transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? "border-primary ring-2 ring-primary/30 bg-primary/5"
          : "border-border hover:border-primary/60 hover:shadow-sm"
      } bg-gradient-to-br ${division.accent}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-11 h-11 rounded-lg flex items-center justify-center ${
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

export default function DivisionSelection({ selected, disabled, onSelect }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {DIVISIONS.map((division) => (
        <DivisionCard
          key={division.id}
          division={division}
          selected={selected === division.id}
          disabled={disabled}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
