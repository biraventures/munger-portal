"use client";

import { useState } from "react";
import { Shuffle } from "lucide-react";
import { reassignAllByWard } from "@/lib/admin-api";

/** Moves every request waiting at a Tax Surveyor to the surveyor its ward is assigned to. */
export function ReassignByWardButton({ onDone }: { onDone?: (moved: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    if (!window.confirm("Move every request now waiting at a Tax Surveyor to the surveyor of its ward?")) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await reassignAllByWard();
      setMsg(r.moved ? `${r.moved} request(s) moved to their ward's surveyor.` : "Every waiting request is already with its ward's surveyor.");
      onDone?.(r.moved);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not reassign.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md border border-nnm-blue bg-white px-4 py-2 text-sm font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-60"
      >
        <Shuffle className="h-4 w-4" /> {busy ? "Moving…" : "Reassign all waiting requests by ward"}
      </button>
      {msg && (
        <span role="status" className="text-sm text-slate-700">
          {msg}
        </span>
      )}
    </div>
  );
}
