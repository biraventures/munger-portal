"use client";

import { useCallback, useEffect, useState } from "react";
import { Home, Loader2 } from "lucide-react";
import { applyResidentialSolidWaste, fetchResidentialSolidWastePreview, type ResidentialSolidWastePreview } from "@/lib/holding-import-api";

/**
 * City Manager: for pending holdings of this upload whose floors are ALL residential, set the solid waste
 * user charge type to "Residential House" (₹30/month = ₹360/year). Blank types are filled by default; a
 * different type already entered is replaced only when the City Manager ticks the box.
 */
export function ResidentialSolidWastePanel({
  batchId,
  locked,
  refreshKey,
  onApplied,
}: {
  batchId: number;
  locked: boolean;
  /** Changes whenever the page reloads, so the counts stay current. */
  refreshKey: number;
  onApplied: (message: string) => void;
}) {
  const [preview, setPreview] = useState<ResidentialSolidWastePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeOther, setIncludeOther] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchResidentialSolidWastePreview(batchId)
      .then((p) => {
        setPreview(p);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load."));
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (error) return <p className="mb-3 text-xs text-red-600">Solid waste bulk update: {error}</p>;
  if (!preview || preview.allResidential === 0) return null;

  const otherCount = preview.otherTypes.reduce((a, x) => a + x.count, 0);
  const toChange = preview.blank + (includeOther ? otherCount : 0);

  async function apply() {
    if (!preview) return;
    const msg =
      `Set the solid waste user charge type to "${preview.targetType}" (₹${preview.annualCharge}/year) on ${toChange} pending holding(s) whose floors are all residential?` +
      (includeOther ? `\n\nThis also replaces a different type already entered on ${otherCount} of them.` : "") +
      "\n\nThe change is recorded on each holding.";
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      const r = await applyResidentialSolidWaste(batchId, includeOther);
      onApplied(`Solid waste type set to "${r.type}" (₹${r.annualCharge}/year) on ${r.updated} holding(s).`);
      setIncludeOther(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
        <Home className="h-4 w-4" /> Solid waste type for all-residential holdings
      </h2>
      <p className="mt-1 text-xs text-emerald-900">
        <b>{preview.allResidential}</b> pending holding(s) in this upload have every floor marked Residential. Their solid waste user charge type can be set to{" "}
        <b>{preview.targetType}</b> (₹{preview.annualCharge}/year) in one step.
      </p>
      <ul className="mt-2 space-y-0.5 text-xs text-emerald-900">
        <li>
          Type blank: <b>{preview.blank}</b> - will be set
        </li>
        <li>
          Already {preview.targetType}: <b>{preview.alreadyResidential}</b> - no change needed
        </li>
        {otherCount > 0 && (
          <li>
            Another type entered: <b>{otherCount}</b> ({preview.otherTypes.map((t) => `${t.type}: ${t.count}`).join(", ")}) - left as entered unless you tick below
          </li>
        )}
      </ul>
      {otherCount > 0 && (
        <label className="mt-2 flex items-start gap-2 text-xs text-emerald-900">
          <input type="checkbox" checked={includeOther} onChange={(e) => setIncludeOther(e.target.checked)} className="mt-0.5" />
          Also replace the type already entered on these {otherCount} holding(s)
        </label>
      )}
      <button
        disabled={locked || busy || toChange === 0}
        onClick={() => void apply()}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {toChange === 0 ? "Nothing to change" : `Set "${preview.targetType}" on ${toChange} holding(s)`}
      </button>
    </section>
  );
}
