import { CheckCircle2, Loader2 } from "lucide-react";

const STEPS = [
  "Menyiapkan kandidat",
  "Mengirim permintaan evaluasi",
  "Memproses hasil",
  "Memperbarui data aplikasi",
];

export default function EvaluationRunningOverlay({ running = false }) {
  if (!running) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl bg-card p-6 shadow-[var(--shadow-navy)]">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <div>
            <h2 className="font-heading text-xl font-bold tracking-normal">
              Evaluasi sedang berjalan
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Mohon tunggu hingga proses selesai. Jangan menjalankan aksi lain
              agar hasil evaluasi tetap konsisten.
            </p>
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {STEPS.map((step, index) => (
            <div key={step} className="flex items-center gap-3 rounded-xl bg-surface-container-low px-4 py-3">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full ${
                index === 0 ? "bg-primary text-primary-foreground" : "bg-surface-container-highest text-muted-foreground"
              }`}>
                {index === 0 ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
              </div>
              <span className="text-sm font-medium">{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
