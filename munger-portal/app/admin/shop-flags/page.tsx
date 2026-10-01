"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Flag, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchOpenShopFlags, resolveShopFlag, type ShopFlag } from "@/lib/admin-shop-api";

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "-";
  return new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ShopFlagsPage() {
  const admin = useAdminGuard();
  const [flags, setFlags] = useState<ShopFlag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);

  function load() {
    fetchOpenShopFlags()
      .then(setFlags)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load flagged shops."));
  }

  useEffect(() => {
    if (!admin || admin.role !== "stall_prabhari") return;
    load();
  }, [admin]);

  async function handleResolve(id: number) {
    const notes = (notesDraft[id] ?? "").trim();
    if (!notes) {
      setError("Add a note explaining the correction or justification before submitting.");
      return;
    }
    setSaving(id);
    setError(null);
    try {
      await resolveShopFlag(id, notes);
      setFlags((prev) => (prev ? prev.filter((f) => f.id !== id) : prev));
      setResponding(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this response.");
    } finally {
      setSaving(null);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (admin.role !== "stall_prabhari") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Flagged shops are for the Stall Prabhari to respond to.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Flag className="h-6 w-6" />
          Flagged Shops
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          Shops the Commissioner or City Manager flagged while reviewing the shop-wise report. Add a correction or
          justification note to close each one out.
        </p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!flags ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : flags.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Nothing flagged right now.
          </div>
        ) : (
          <div className="space-y-4">
            {flags.map((f) => (
              <div key={f.id} className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold text-slate-800">{f.shop_no}</span>
                  <span className="text-xs text-slate-500">{fmtDateTime(f.flagged_at)} - {f.flagged_by_display_name}</span>
                </div>
                <p className="mb-3 text-sm text-slate-700">{f.remarks}</p>

                {responding === f.id ? (
                  <div>
                    <textarea
                      value={notesDraft[f.id] ?? ""}
                      onChange={(e) => setNotesDraft((prev) => ({ ...prev, [f.id]: e.target.value }))}
                      rows={3}
                      placeholder="Correction made, or justification..."
                      className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleResolve(f.id)}
                        disabled={saving === f.id}
                        className="rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                      >
                        {saving === f.id ? "Saving…" : "Submit Response"}
                      </button>
                      <button onClick={() => setResponding(null)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setResponding(f.id)}
                    className="rounded-md border border-nnm-blue px-3 py-1.5 text-xs font-semibold text-nnm-blue hover:bg-blue-50"
                  >
                    Respond
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
