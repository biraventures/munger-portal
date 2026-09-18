"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { OperatorHeader } from "@/components/operator-header";
import { useOperatorGuard } from "@/lib/use-operator-guard";
import { fetchRevertedChangeRequests, resubmitChangeRequest, type RevertedChangeRequest } from "@/lib/operator-api";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

interface FloorRow {
  floorLabel: string;
  buildupSqft: number;
  constType: "RCC" | "Asbestos" | "Other";
  usageType: string;
  occupancy: "self" | "rented";
}

function floorsFromProposed(data: Record<string, unknown>): FloorRow[] {
  const floors = data.floors;
  if (Array.isArray(floors) && floors.length > 0) {
    return floors.map((f) => {
      const row = f as Record<string, unknown>;
      return {
        floorLabel: String(row.floorLabel ?? ""),
        buildupSqft: Number(row.buildupSqft ?? 0),
        constType: (row.constType as FloorRow["constType"]) ?? "RCC",
        usageType: String(row.usageType ?? "Residential"),
        occupancy: (row.occupancy as FloorRow["occupancy"]) ?? "self",
      };
    });
  }
  return [{ floorLabel: "", buildupSqft: 0, constType: "RCC", usageType: "Residential", occupancy: "self" }];
}

export default function RevertedMutationsPage() {
  const operator = useOperatorGuard();
  const [list, setList] = useState<RevertedChangeRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [editing, setEditing] = useState<RevertedChangeRequest | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [address, setAddress] = useState("");
  const [ward, setWard] = useState("");
  const [areaSqft, setAreaSqft] = useState(0);
  const [roadType, setRoadType] = useState<"PMR" | "MR" | "OR">("MR");
  const [assessmentYear, setAssessmentYear] = useState("");
  const [changeReference, setChangeReference] = useState("");
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    fetchRevertedChangeRequests()
      .then(setList)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this worklist."));
  }

  useEffect(() => {
    if (!operator) return;
    load();
  }, [operator]);

  function openEdit(r: RevertedChangeRequest) {
    setEditing(r);
    setSuccess(null);
    setError(null);
    const d = r.proposed_data;
    setOwnerName(String(d.ownerName ?? ""));
    setAddress(String(d.address ?? ""));
    setWard(String(d.ward ?? ""));
    setAreaSqft(Number(d.areaSqft ?? 0));
    setRoadType((d.roadType as "PMR" | "MR" | "OR") ?? "MR");
    setAssessmentYear(String(d.assessmentYear ?? ""));
    setChangeReference(r.change_reference);
    setFloors(floorsFromProposed(d));
  }

  function updateFloor(i: number, patch: Partial<FloorRow>) {
    setFloors((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  async function handleResubmit() {
    if (!editing) return;
    if (!ownerName.trim() || !address.trim() || !changeReference.trim()) {
      setError("Owner name, address, and change reference are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await resubmitChangeRequest(editing.id, {
        ...editing.proposed_data,
        ownerName: ownerName.trim(),
        address: address.trim(),
        ward: ward.trim() || null,
        areaSqft,
        roadType,
        assessmentYear,
        changeReference: changeReference.trim(),
        floors,
      });
      setSuccess(`${editing.holding_no} resubmitted for approval.`);
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resubmit this correction.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!operator) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <OperatorHeader operator={operator} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <RotateCcw className="h-6 w-6" />
          Reverted Mutations
        </h1>
        <p className="mb-6 text-sm text-slate-500">Mutation requests a reviewer sent back for correction.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {success && !editing && (
          <div role="status" className="mb-5 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        {!editing ? (
          !list ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : list.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Nothing needs correction right now.</div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {list.map((r) => (
                <div key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{r.holding_no}</p>
                      <p className="text-xs text-slate-500">
                        Sent back by {r.reverted_by} on {new Date(r.reverted_at).toLocaleDateString("en-IN")}
                        {r.revision_count > 0 ? ` (revision ${r.revision_count})` : ""}
                      </p>
                      <p className="mt-1 text-sm text-amber-700">&ldquo;{r.revert_comment}&rdquo;</p>
                    </div>
                    <button onClick={() => openEdit(r)} className="shrink-0 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark">
                      Correct &amp; Resubmit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">{editing.holding_no}</h2>
              <button onClick={() => setEditing(null)} className="text-xs font-semibold text-slate-500 hover:underline">
                Back to list
              </button>
            </div>
            <p className="mb-5 text-sm text-amber-700">&ldquo;{editing.revert_comment}&rdquo;</p>

            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Owner name</label>
                <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputClass} autoFocus />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Address</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Ward</label>
                <input value={ward} onChange={(e) => setWard(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Plot area (sqft)</label>
                <input type="number" value={areaSqft || ""} onChange={(e) => setAreaSqft(Number(e.target.value))} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Road type</label>
                <select value={roadType} onChange={(e) => setRoadType(e.target.value as "PMR" | "MR" | "OR")} className={inputClass}>
                  <option value="PMR">Prime Main Road (PMR)</option>
                  <option value="MR">Main Road (MR)</option>
                  <option value="OR">Other Road (OR)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Assessment year</label>
                <input value={assessmentYear} onChange={(e) => setAssessmentYear(e.target.value)} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Change reference (what changed, and why)</label>
                <textarea value={changeReference} onChange={(e) => setChangeReference(e.target.value)} rows={2} className={inputClass} />
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
                  <select value={f.constType} onChange={(e) => updateFloor(i, { constType: e.target.value as FloorRow["constType"] })} className={inputClass}>
                    <option value="RCC">RCC</option>
                    <option value="Asbestos">Asbestos</option>
                    <option value="Other">Other</option>
                  </select>
                  <input placeholder="Usage" value={f.usageType} onChange={(e) => updateFloor(i, { usageType: e.target.value })} className={inputClass} />
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
              onClick={() => setFloors((prev) => [...prev, { floorLabel: "", buildupSqft: 0, constType: "RCC", usageType: "Residential", occupancy: "self" }])}
              className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-nnm-blue hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Add another floor
            </button>

            <button
              onClick={handleResubmit}
              disabled={submitting}
              className="w-full rounded-md bg-nnm-blue px-4 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
            >
              {submitting ? "Resubmitting…" : "Resubmit for Approval"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
