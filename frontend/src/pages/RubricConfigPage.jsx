import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  FileText,
  X,
  Save,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listRubrics,
  getRubric,
  createRubric,
  updateRubric,
  deleteRubric,
} from "@/lib/api";

const DIVISION_OPTIONS = [
  { value: "big_data", label: "Big Data" },
  { value: "cyber_security", label: "Cyber Security" },
  { value: "game_tech", label: "Game Tech" },
  { value: "gis", label: "GIS" },
];

const DIVISION_LABEL = Object.fromEntries(
  DIVISION_OPTIONS.map((d) => [d.value, d.label])
);

const NO_DIVISION = "__none__";

const emptyDimension = () => ({
  name: "",
  weight: 0,
  description: "",
  indicators: [""],
});

const emptyForm = () => ({
  name: "",
  position: "",
  division: null,
  description: "",
  dimensions: [emptyDimension()],
});

export default function RubricConfigPage() {
  const [rubrics, setRubrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRubrics = async () => {
    setLoading(true);
    try {
      const data = await listRubrics();
      setRubrics(data);
    } catch (err) {
      toast.error(`Failed to load rubrics: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(fetchRubrics);
  }, []);

  const totalWeight = form.dimensions.reduce((s, d) => s + (Number(d.weight) || 0), 0);
  const weightValid = Math.abs(totalWeight - 100) < 1;

  const openCreate = () => {
    setForm(emptyForm());
    setEditId(null);
    setEditing(true);
  };

  const openEdit = async (rubricId) => {
    try {
      const data = await getRubric(rubricId);
      setForm({
        name: data.name,
        position: data.position,
        division: data.division || null,
        description: data.description || "",
        dimensions: data.dimensions.map((d) => ({
          id: d.id,
          name: d.name,
          weight: Math.round(d.weight * 100),
          description: d.description || "",
          indicators: d.indicators && d.indicators.length > 0 ? d.indicators : [""],
        })),
      });
      setEditId(rubricId);
      setEditing(true);
    } catch (err) {
      toast.error(`Failed to load rubric: ${err.message}`);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.position.trim()) {
      toast.error("Name and position are required.");
      return;
    }
    if (form.dimensions.length === 0) {
      toast.error("Add at least one dimension.");
      return;
    }
    if (!weightValid) {
      toast.error(`Weights must sum to 100%. Current total: ${totalWeight}%`);
      return;
    }

    const payload = {
      name: form.name.trim(),
      position: form.position.trim(),
      division: form.division || null,
      description: form.description.trim() || null,
      dimensions: form.dimensions.map((d) => ({
        ...(d.id ? { id: d.id } : {}),
        name: d.name.trim(),
        weight: Number(d.weight) / 100,
        description: d.description.trim() || null,
        indicators: d.indicators.filter((i) => i.trim()),
      })),
    };

    setSaving(true);
    try {
      if (editId) {
        await updateRubric(editId, payload);
        toast.success("Rubric updated!");
      } else {
        await createRubric(payload);
        toast.success("Rubric created!");
      }
      setEditing(false);
      fetchRubrics();
    } catch (err) {
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    setDeleting(true);
    try {
      await deleteRubric(deleteDialog);
      toast.success("Rubric deleted.");
      setDeleteDialog(null);
      fetchRubrics();
    } catch (err) {
      toast.error(`Failed to delete: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const updateDimension = (idx, field, value) => {
    setForm((prev) => ({
      ...prev,
      dimensions: prev.dimensions.map((d, i) =>
        i === idx ? { ...d, [field]: value } : d
      ),
    }));
  };

  const addDimension = () => {
    setForm((prev) => ({
      ...prev,
      dimensions: [...prev.dimensions, emptyDimension()],
    }));
  };

  const removeDimension = (idx) => {
    setForm((prev) => ({
      ...prev,
      dimensions: prev.dimensions.filter((_, i) => i !== idx),
    }));
  };

  const updateIndicator = (dimIdx, indIdx, value) => {
    setForm((prev) => ({
      ...prev,
      dimensions: prev.dimensions.map((d, i) =>
        i === dimIdx
          ? {
              ...d,
              indicators: d.indicators.map((ind, j) =>
                j === indIdx ? value : ind
              ),
            }
          : d
      ),
    }));
  };

  const addIndicator = (dimIdx) => {
    setForm((prev) => ({
      ...prev,
      dimensions: prev.dimensions.map((d, i) =>
        i === dimIdx ? { ...d, indicators: [...d.indicators, ""] } : d
      ),
    }));
  };

  const removeIndicator = (dimIdx, indIdx) => {
    setForm((prev) => ({
      ...prev,
      dimensions: prev.dimensions.map((d, i) =>
        i === dimIdx
          ? { ...d, indicators: d.indicators.filter((_, j) => j !== indIdx) }
          : d
      ),
    }));
  };

  // ── Editing view ──
  if (editing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {editId ? "Edit Rubric" : "New Rubric"}
            </h1>
            <p className="text-muted-foreground mt-1">
              Define competency dimensions and their weights.
            </p>
          </div>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            <X className="w-4 h-4 mr-2" /> Cancel
          </Button>
        </div>

        {/* Basic info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rubric Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Rubric Name</Label>
                <Input
                  placeholder="e.g. Junior Data Analyst 2026"
                  value={form.name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Position</Label>
                <Input
                  placeholder="e.g. Junior Data Analyst"
                  value={form.position}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, position: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Division</Label>
                <Select
                  value={form.division ?? NO_DIVISION}
                  onValueChange={(v) =>
                    setForm((p) => ({
                      ...p,
                      division: v === NO_DIVISION ? null : v,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select division…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DIVISION}>
                      <span className="text-muted-foreground">Unassigned</span>
                    </SelectItem>
                    {DIVISION_OPTIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Describe what this rubric evaluates…"
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Dimensions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Dimensions</CardTitle>
              <CardDescription>
                Total weight:{" "}
                <span
                  className={`font-semibold ${
                    weightValid ? "text-green-600" : "text-destructive"
                  }`}
                >
                  {totalWeight}%
                </span>{" "}
                / 100%
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={addDimension}>
              <Plus className="w-4 h-4 mr-1" /> Add Dimension
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {form.dimensions.map((dim, dimIdx) => (
              <div key={dimIdx} className="p-4 rounded-lg border space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 grid grid-cols-[1fr_100px] gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Dimension Name</Label>
                      <Input
                        placeholder="e.g. Technical Skills"
                        value={dim.name}
                        onChange={(e) =>
                          updateDimension(dimIdx, "name", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Weight (%)</Label>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        placeholder="25"
                        value={dim.weight || ""}
                        onChange={(e) =>
                          updateDimension(dimIdx, "weight", e.target.value)
                        }
                      />
                    </div>
                  </div>
                  {form.dimensions.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive mt-5"
                      onClick={() => removeDimension(dimIdx)}
                      aria-label={`Remove dimension ${dimIdx + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Description (optional)</Label>
                  <Input
                    placeholder="What does this dimension measure?"
                    value={dim.description}
                    onChange={(e) =>
                      updateDimension(dimIdx, "description", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Indicators</Label>
                  {dim.indicators.map((ind, indIdx) => (
                    <div key={indIdx} className="flex items-center gap-2">
                      <Input
                        placeholder="e.g. programming experience, relevant coursework"
                        value={ind}
                        onChange={(e) =>
                          updateIndicator(dimIdx, indIdx, e.target.value)
                        }
                        className="text-sm"
                      />
                      {dim.indicators.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive px-2"
                          onClick={() => removeIndicator(dimIdx, indIdx)}
                          aria-label={`Remove indicator ${indIdx + 1}`}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => addIndicator(dimIdx)}
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add Indicator
                  </Button>
                </div>
              </div>
            ))}

            {!weightValid && form.dimensions.length > 0 && (
              <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Dimension weights must sum to exactly 100%.
                Current total: {totalWeight}%
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || !weightValid}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" /> Save Rubric
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rubrics</h1>
          <p className="text-muted-foreground mt-1">
            Manage scoring rubrics used to evaluate candidates.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> New Rubric
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Loading rubrics…
            </span>
          </CardContent>
        </Card>
      ) : rubrics.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-sm font-medium text-foreground mb-1">
              No rubrics yet
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Create a scoring rubric to start evaluating candidates.
            </p>
            <Button onClick={openCreate} variant="outline">
              <Plus className="w-4 h-4 mr-2" /> Create First Rubric
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rubrics.map((r) => (
            <Card
              key={r.id}
              className="group hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => openEdit(r.id)}
            >
              <CardContent className="py-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground">{r.name}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {r.position}
                    </Badge>
                    {r.division ? (
                      <Badge variant="outline" className="text-xs">
                        {DIVISION_LABEL[r.division] ?? r.division}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-xs text-muted-foreground"
                      >
                        Unassigned
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.dimension_count} dimension(s) ·{" "}
                    {r.description || "No description"}
                  </p>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit rubric ${r.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(r.id);
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    aria-label={`Delete rubric ${r.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteDialog(r.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteDialog}
        onOpenChange={(open) => !open && setDeleteDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Rubric</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this rubric? This action cannot be
              undone and will also remove all associated dimension scores.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
