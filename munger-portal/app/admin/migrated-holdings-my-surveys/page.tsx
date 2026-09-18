"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardList, Plus, Trash2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchMyMigratedSurveys, submitTaxSurveyorEntry, type MigratedHoldingSurvey, type MigratedHoldingFloorInput } from "@/lib/admin-api";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

function emptyFloor(): MigratedHoldingFloorInput {
  return { floorLabel: "", buildupSqft: 0, constType: "RCC", usageType: "Residential", occupancy: "self" };
}

export default function MyMigratedSurveysPage() {
  const admin = useAdminGuard();
  const [list, setList] = useState<MigratedHoldingSurvey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [entering, setEntering] = useState<MigratedHoldingSurvey | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [address, setAddress] = useState("");
  const [zone, setZone] = useState("");
  const [pincode, setPincode] = useState("");
  const [roadType, setRoadType] = useState<"PMR" | "MR" | "OR">("MR");
  const [floors, setFloors] = useState<MigratedHoldingFloorInput[]>([emptyFloor()]);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    fetchMyMigratedSurveys()
      .then(setList)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this worklist."));
  }

  useEffect(() => {
    if (!admin) return;
    load();
  }, [admin]);

  function openEntry(s: MigratedHoldingSurvey) {
    setEntering(s);
    setOwnerName("");
    setAddress("");
    setZone("");
    setPincode("");
    setRoadType("MR");
    setFloors([emptyFloor()]);
    setError(null);
    setSuccess(null);
  }

  function updateFloor(i: number, patch: Partial<MigratedHoldingFloorInput>) {
    setFloors((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  async function handleSubmit() {
    if (!entering) return;
    if (!address.trim()) {
      setError("Address is required.");
      return;
    }
    if (floors.some((f) => !f.floorLabel.trim() || f.buildupSqft <= 0)) {
      setError("Every floor needs a label and a positive area.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitTaxSurveyorEntry(entering.holding_no, {
        ownerName: ownerName.trim() || undefined,
        address: address.trim(),
        zone: zone.trim() || null,
        pincode: pincode.trim() || null,
        roadType,
        floors,
      });
      setSuccess(`${entering.holding_no} submitted for verification.`);
      setEntering(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit these details.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (admin.role !== "tax_surveyor") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Tax Surveyor.
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
          <ClipboardList className="h-6 w-6" />
          My Surveys
        </h1>
        <p className="mb-6 text-sm text-slate-500">Old holdings assigned to you for physical survey.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {success && !entering && (
          <div role="status" className="mb-5 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        {!entering ? (
          !list ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : list.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Nothing assigned to you right now.</div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {list.map((s) => (
                <div key={s.holding_no} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {s.holding_no} <span className="font-normal text-slate-500">- Ward {s.ward}</span>
                    </p>
                    {s.revision_count > 0 && <p className="text-xs text-amber-700">Sent back for correction (revision {s.revision_count})</p>}
                  </div>
                  <button onClick={() => openEntry(s)} className="rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark">
                    Enter Survey
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">{entering.holding_no}</h2>
              <button onClick={() => setEntering(null)} className="text-xs font-semibold text-slate-500 hover:underline">
                Back to list
              </button>
            </div>

            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Owner name (leave blank to keep the recorded name)</label>
                <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Corrected owner name, if needed" className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Address</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} autoFocus />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Zone (optional)</label>
                <input value={zone} onChange={(e) => setZone(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Pincode (optional)</label>
                <input value={pincode} onChange={(e) => setPincode(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Road type</label>
                <select value={roadType} onChange={(e) => setRoadType(e.target.value as "PMR" | "MR" | "OR")} className={inputClass}>
                  <option value="PMR">Prime Main Road (PMR)</option>
                  <option value="MR">Main Road (MR)</option>
                  <option value="OR">Other Road (OR)</option>
                </select>
              </div>
            </div>

            <h3 className="mb-2 text-sm font-semibold text-slate-700">Floors</h3>
            <div className="mb-3 space-y-3">
              {floors.map((f, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-6">
                  <input placeholder="Floor label" value={f.floorLabel} onChange={(e) => updateFloor(i, { floorLabel: e.target.value })} className={`${inputClass} sm:col-span-2`} />
                  <input
                    type="number"
                    placeholder="Area (sqft)"
                    value={f.buildupSqft || ""}
                    onChange={(e) => updateFloor(i, { buildupSqft: Number(e.target.value) })}
                    className={inputClass}
                  />
                  <select value={f.constType} onChange={(e) => updateFloor(i, { constType: e.target.value as MigratedHoldingFloorInput["constType"] })} className={inputClass}>
                    <option value="RCC">RCC</option>
                    <option value="Asbestos">Asbestos</option>
                    <option value="Other">Other</option>
                  </select>
                  <input placeholder="Usage (e.g. Residential)" value={f.usageType} onChange={(e) => updateFloor(i, { usageType: e.target.value })} className={inputClass} />
                  <div className="flex items-center gap-2">
                    <select value={f.occupancy} onChange={(e) => updateFloor(i, { occupancy: e.target.value as "self" | "rented" })} className={inputClass}>
                      <option value="self">Self</option>
                      <option value="rented">Rented</option>
                    </select>
                    {floors.length > 1 && (
                      <button onClick={() => setFloors((prev) => prev.filter((_, idx) => idx !== i))} className="shrink-0 text-red-500 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setFloors((prev) => [...prev, emptyFloor()])}
              className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-nnm-blue hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Add another floor
            </button>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-md bg-nnm-blue px-4 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit for Verification"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
