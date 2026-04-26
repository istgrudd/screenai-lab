import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Save,
  X,
  XCircle,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  closePeriod,
  createPeriod,
  listPeriods,
  updatePeriod,
} from "@/lib/api";

function toLocalInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function toIsoFromInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function StatusBadge({ active }) {
  return active ? (
    <Badge variant="default" className="text-[10px] uppercase gap-1">
      <CheckCircle2 className="w-3 h-3" /> Aktif
    </Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] uppercase gap-1">
      <XCircle className="w-3 h-3" /> Tutup
    </Badge>
  );
}

function ActivePeriodCard({ period, onClosed }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!period) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Belum ada periode aktif. Buat periode baru di bawah.
        </CardContent>
      </Card>
    );
  }

  const onClose = async () => {
    setBusy(true);
    try {
      await closePeriod(period.id);
      toast.success("Periode ditutup.");
      setConfirmOpen(false);
      onClosed();
    } catch (err) {
      toast.error(err.message || "Gagal menutup periode");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" />
            Periode Aktif
          </CardTitle>
          <CardDescription>{period.name}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase">Mulai</p>
              <p className="font-medium">{formatDateTime(period.start_date)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Tutup</p>
              <p className="font-medium">{formatDateTime(period.end_date)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Threshold N</p>
              <p className="font-medium">
                {period.threshold_n ?? <span className="text-muted-foreground">— tidak ada</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Total Aplikasi</p>
              <p className="font-medium">{period.application_count ?? 0}</p>
            </div>
          </div>
          <div className="pt-1">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              Tutup Periode
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tutup periode "{period.name}"?</DialogTitle>
            <DialogDescription>
              Setelah ditutup, kandidat tidak bisa submit lagi sampai
              periode baru dibuat. Tindakan ini bisa dibatalkan dengan
              mengaktifkan kembali periode di tabel.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Batal
            </Button>
            <Button variant="destructive" onClick={onClose} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Ya, tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreatePeriodForm({ onCreated }) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [thresholdN, setThresholdN] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setStartDate("");
    setEndDate("");
    setThresholdN("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !startDate || !endDate) {
      toast.error("Lengkapi nama, tanggal mulai, dan tanggal tutup.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        start_date: toIsoFromInput(startDate),
        end_date: toIsoFromInput(endDate),
        threshold_n: thresholdN === "" ? null : Number(thresholdN),
      };
      await createPeriod(payload);
      toast.success("Periode dibuat dan diaktifkan.");
      reset();
      onCreated();
    } catch (err) {
      toast.error(err.message || "Gagal membuat periode");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Plus className="w-5 h-5 text-primary" />
          Buat Periode Baru
        </CardTitle>
        <CardDescription>
          Membuat periode baru otomatis menonaktifkan periode aktif sebelumnya.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <Label htmlFor="name">Nama Periode</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rekrutasi Lab MBC 2026-2027"
              maxLength={255}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="start">Tanggal Mulai</Label>
            <Input
              id="start"
              type="datetime-local"
              step={1}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end">Tanggal Tutup</Label>
            <Input
              id="end"
              type="datetime-local"
              step={1}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label htmlFor="threshold">
              Top N kandidat lolos per divisi (kosongkan jika tidak ada threshold)
            </Label>
            <Input
              id="threshold"
              type="number"
              min={1}
              value={thresholdN}
              onChange={(e) => setThresholdN(e.target.value)}
              placeholder="mis. 10"
              disabled={busy}
            />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={busy} className="gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Buat & Aktifkan
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PeriodRow({ period, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(period.name);
  const [endDate, setEndDate] = useState(toLocalInputValue(period.end_date));
  const [thresholdN, setThresholdN] = useState(period.threshold_n ?? "");
  const [busy, setBusy] = useState(false);

  const onSave = async () => {
    setBusy(true);
    try {
      await updatePeriod(period.id, {
        name: name.trim(),
        end_date: toIsoFromInput(endDate),
        threshold_n: thresholdN === "" ? null : Number(thresholdN),
      });
      toast.success("Periode diperbarui.");
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(err.message || "Gagal memperbarui");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <TableRow>
        <TableCell>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </TableCell>
        <TableCell className="text-xs whitespace-nowrap">
          {formatDateTime(period.start_date)}
        </TableCell>
        <TableCell>
          <Input
            type="datetime-local"
            step={1}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={busy}
          />
        </TableCell>
        <TableCell><StatusBadge active={period.is_active} /></TableCell>
        <TableCell>
          <Input
            type="number"
            min={1}
            value={thresholdN}
            onChange={(e) => setThresholdN(e.target.value)}
            disabled={busy}
            className="w-24"
          />
        </TableCell>
        <TableCell>{period.application_count ?? 0}</TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="default" onClick={onSave} disabled={busy} className="gap-1">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Simpan
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={busy}>
              Batal
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{period.name}</TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {formatDateTime(period.start_date)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {formatDateTime(period.end_date)}
      </TableCell>
      <TableCell><StatusBadge active={period.is_active} /></TableCell>
      <TableCell>{period.threshold_n ?? "—"}</TableCell>
      <TableCell>{period.application_count ?? 0}</TableCell>
      <TableCell className="text-right">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-1">
          <Pencil className="w-3.5 h-3.5" /> Edit
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function RecruitmentPeriodPage() {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPeriods();
      setPeriods(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err.message || "Gagal memuat periode");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const active = periods.find((p) => p.is_active) || null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <CalendarClock className="w-6 h-6 text-primary" />
          Kelola Periode Rekrutasi
        </h1>
        <p className="text-muted-foreground mt-1">
          Buat, ubah, dan tutup periode rekrutasi MBC Laboratory.
        </p>
      </div>

      <ActivePeriodCard period={active} onClosed={fetchAll} />

      <CreatePeriodForm onCreated={fetchAll} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Riwayat Periode</CardTitle>
          <CardDescription>
            {periods.length} total periode tercatat.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Memuat…
            </div>
          ) : periods.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Belum ada periode.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Mulai</TableHead>
                  <TableHead>Tutup</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Threshold N</TableHead>
                  <TableHead>Total Aplikasi</TableHead>
                  <TableHead className="text-right w-[160px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((p) => (
                  <PeriodRow key={p.id} period={p} onChanged={fetchAll} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
