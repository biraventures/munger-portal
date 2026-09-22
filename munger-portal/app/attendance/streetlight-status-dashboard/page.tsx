"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, ChevronLeft, ChevronDown, ChevronRight, CheckCircle2, XCircle, PlusCircle, Pencil, X } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import {
  fetchWardStatusDashboard,
  fetchStreetStatusDashboard,
  fetchSegmentLightStatus,
  setLightSwitchStatus,
  insertLight,
  createStreetSegment,
  updateStreetSegment,
  type WardStatus,
  type StreetStatus,
  type SegmentLightStatus,
  type LightSwitchStatus,
} from "@/lib/streetlight-api";

const OVERSIGHT_ROLES = ["city_manager", "deputy_municipal_commissioner", "municipal_commissioner", "attendance_admin"];
const COMMISSIONER_ROLES = ["municipal_commissioner", "attendance_admin"];
const SWITCH_STATUS_LABELS: Record<LightSwitchStatus, string> = { working: "Working", not_working: "Not Working", automatic: "Automatic", joint: "Joint" };
const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

const emptyStreetForm = { agency: "NN" as "NN" | "EESL", startPoint: "", intermediatePoint: "", endPoint: "", lightCount: "0" };

export default function StreetlightStatusDashboardPage() {
  const attendance = useAttendanceGuard();
  const [wards, setWards] = useState<WardStatus[] | null>(null);
  const [streets, setStreets] = useState<StreetStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openWard, setOpenWard] = useState<string | null>(null);
  const [expandedSegmentId, setExpandedSegmentId] = useState<number | null>(null);
  const [segmentLights, setSegmentLights] = useState<Record<number, SegmentLightStatus[]>>({});
  const [loadingSegmentId, setLoadingSegmentId] = useState<number | null>(null);

  const [showAddStreet, setShowAddStreet] = useState(false);
  const [addStreetForm, setAddStreetForm] = useState(emptyStreetForm);
  const [addStreetSaving, setAddStreetSaving] = useState(false);

  const [editingSegmentId, setEditingSegmentId] = useState<number | null>(null);
  const [editStreetForm, setEditStreetForm] = useState(emptyStreetForm);
  const [editStreetSaving, setEditStreetSaving] = useState(false);

  const [changingStatusLightId, setChangingStatusLightId] = useState<number | null>(null);
  const [insertingSeq, setInsertingSeq] = useState<number | null>(null);

  function load() {
    Promise.all([fetchWardStatusDashboard(), fetchStreetStatusDashboard()])
      .then(([w, s]) => {
        setWards(w);
        setStreets(s);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the status dashboard."));
  }

  useEffect(() => {
    if (!attendance) return;
    load();
  }, [attendance]);

  const wardTotals = useMemo(() => {
    if (!wards) return null;
    return wards.reduce((acc, w) => ({ total: acc.total + w.totalLights, working: acc.working + w.working, notWorking: acc.notWorking + w.notWorking }), { total: 0, working: 0, notWorking: 0 });
  }, [wards]);

  const streetsInOpenWard = useMemo(() => {
    if (!streets || !openWard) return [];
    return streets.filter((s) => s.wardName === openWard);
  }, [streets, openWard]);

  const openWardId = useMemo(() => wards?.find((w) => w.wardName === openWard)?.wardId ?? null, [wards, openWard]);

  const streetTotalsForWard = useMemo(() => {
    if (streetsInOpenWard.length === 0) return null;
    return streetsInOpenWard.reduce((acc, s) => ({ total: acc.total + s.totalLights, working: acc.working + s.working, notWorking: acc.notWorking + s.notWorking }), { total: 0, working: 0, notWorking: 0 });
  }, [streetsInOpenWard]);

  function openWardView(wardName: string) {
    setOpenWard(wardName);
    setExpandedSegmentId(null);
    setShowAddStreet(false);
    setEditingSegmentId(null);
  }

  function backToWards() {
    setOpenWard(null);
    setExpandedSegmentId(null);
    setShowAddStreet(false);
    setEditingSegmentId(null);
  }

  async function refreshSegmentLights(segmentId: number) {
    try {
      const lights = await fetchSegmentLightStatus(segmentId);
      setSegmentLights((prev) => ({ ...prev, [segmentId]: lights }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load lights for this street.");
    }
  }

  async function toggleSegment(segmentId: number) {
    if (expandedSegmentId === segmentId) {
      setExpandedSegmentId(null);
      return;
    }
    setExpandedSegmentId(segmentId);
    if (!segmentLights[segmentId]) {
      setLoadingSegmentId(segmentId);
      await refreshSegmentLights(segmentId);
      setLoadingSegmentId(null);
    }
  }

  async function handleAddStreet(e: React.FormEvent) {
    e.preventDefault();
    if (!openWardId) return;
    setAddStreetSaving(true);
    setError(null);
    try {
      await createStreetSegment({
        wardId: openWardId,
        agency: addStreetForm.agency,
        startPoint: addStreetForm.startPoint.trim(),
        intermediatePoint: addStreetForm.intermediatePoint.trim() || null,
        endPoint: addStreetForm.endPoint.trim() || null,
        lightCount: Number(addStreetForm.lightCount) || 0,
      });
      setShowAddStreet(false);
      setAddStreetForm(emptyStreetForm);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this street.");
    } finally {
      setAddStreetSaving(false);
    }
  }

  function openEditStreet(s: StreetStatus) {
    if (!s.segmentId) return;
    setEditingSegmentId(s.segmentId);
    setEditStreetForm({
      agency: s.agencyName === "EESL" ? "EESL" : "NN",
      startPoint: s.startPoint ?? "",
      intermediatePoint: "",
      endPoint: s.endPoint ?? "",
      lightCount: "0",
    });
  }

  async function handleEditStreet(e: React.FormEvent) {
    e.preventDefault();
    if (editingSegmentId === null || !openWardId) return;
    setEditStreetSaving(true);
    setError(null);
    try {
      await updateStreetSegment(editingSegmentId, {
        wardId: openWardId,
        agency: editStreetForm.agency,
        startPoint: editStreetForm.startPoint.trim(),
        intermediatePoint: editStreetForm.intermediatePoint.trim() || null,
        endPoint: editStreetForm.endPoint.trim() || null,
      });
      setEditingSegmentId(null);
      load();
      if (segmentLights[editingSegmentId]) refreshSegmentLights(editingSegmentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save these changes.");
    } finally {
      setEditStreetSaving(false);
    }
  }

  async function handleChangeStatus(segmentId: number, lightId: number, status: LightSwitchStatus) {
    setChangingStatusLightId(lightId);
    setError(null);
    try {
      await setLightSwitchStatus(lightId, status);
      await refreshSegmentLights(segmentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the functional status.");
    } finally {
      setChangingStatusLightId(null);
    }
  }

  async function handleInsertLight(segmentId: number, afterSeq: number) {
    setInsertingSeq(afterSeq);
    setError(null);
    try {
      await insertLight(segmentId, afterSeq);
      await refreshSegmentLights(segmentId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not insert a light here.");
    } finally {
      setInsertingSeq(null);
    }
  }

  if (!attendance) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!OVERSIGHT_ROLES.includes(attendance.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AttendanceHeader user={attendance} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to City Manager, Deputy Municipal Commissioner, and Municipal Commissioner.
          </div>
        </main>
      </div>
    );
  }

  const canManageStreets = COMMISSIONER_ROLES.includes(attendance.role);

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={attendance} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <BarChart3 className="h-6 w-6" />
          Streetlight Status Dashboard
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          {openWard ? "Streets in this ward. Click a street to see individual lights." : "Click a ward to see its streets."}
        </p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!openWard ? (
          !wards ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : wards.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No lights registered yet.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-4 py-2.5"></th>
                    <th className="px-4 py-2.5">Ward</th>
                    <th className="px-4 py-2.5">Total</th>
                    <th className="px-4 py-2.5">Working</th>
                    <th className="px-4 py-2.5">Not Working</th>
                  </tr>
                </thead>
                <tbody>
                  {wards.map((w) => (
                    <tr key={w.wardId} onClick={() => openWardView(w.wardName)} className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-400">
                        <ChevronRight className="h-4 w-4" />
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{w.wardName}</td>
                      <td className="px-4 py-2.5">{w.totalLights}</td>
                      <td className="px-4 py-2.5 text-green-700">{w.working}</td>
                      <td className="px-4 py-2.5">{w.notWorking > 0 ? <span className="font-semibold text-red-600">{w.notWorking}</span> : 0}</td>
                    </tr>
                  ))}
                </tbody>
                {wardTotals && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                      <td className="px-4 py-2.5" colSpan={2}>
                        Total
                      </td>
                      <td className="px-4 py-2.5">{wardTotals.total}</td>
                      <td className="px-4 py-2.5 text-green-700">{wardTotals.working}</td>
                      <td className="px-4 py-2.5 text-red-600">{wardTotals.notWorking}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )
        ) : (
          <>
            <button onClick={backToWards} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-nnm-blue hover:underline">
              <ChevronLeft className="h-4 w-4" />
              Back to wards
            </button>

            {streetsInOpenWard.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No street segments in {openWard} yet.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-500">
                      <th className="px-4 py-2.5"></th>
                      <th className="px-4 py-2.5">Street</th>
                      <th className="px-4 py-2.5">Agency</th>
                      <th className="px-4 py-2.5">Total</th>
                      <th className="px-4 py-2.5">Working</th>
                      <th className="px-4 py-2.5">Not Working</th>
                      {canManageStreets && <th className="px-4 py-2.5"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {streetsInOpenWard.map((s) => (
                      <>
                        <tr key={s.segmentId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                          <td onClick={() => s.segmentId && toggleSegment(s.segmentId)} className="cursor-pointer px-4 py-2.5 text-slate-400">
                            {expandedSegmentId === s.segmentId ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </td>
                          <td onClick={() => s.segmentId && toggleSegment(s.segmentId)} className="cursor-pointer px-4 py-2.5 font-semibold text-slate-800">
                            {s.endPoint ? `${s.startPoint} - ${s.endPoint}` : s.startPoint}
                          </td>
                          <td className="px-4 py-2.5">{s.agencyName}</td>
                          <td className="px-4 py-2.5">{s.totalLights}</td>
                          <td className="px-4 py-2.5 text-green-700">{s.working}</td>
                          <td className="px-4 py-2.5">{s.notWorking > 0 ? <span className="font-semibold text-red-600">{s.notWorking}</span> : 0}</td>
                          {canManageStreets && (
                            <td className="px-4 py-2.5">
                              <button onClick={() => openEditStreet(s)} className="inline-flex items-center gap-1 text-xs font-medium text-nnm-blue hover:underline">
                                <Pencil className="h-3 w-3" />
                                Edit
                              </button>
                            </td>
                          )}
                        </tr>

                        {editingSegmentId === s.segmentId && (
                          <tr key={`${s.segmentId}-edit`}>
                            <td colSpan={7} className="border-b border-slate-100 bg-blue-50 p-4">
                              <form onSubmit={handleEditStreet} className="space-y-3">
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                  <select value={editStreetForm.agency} onChange={(e) => setEditStreetForm((f) => ({ ...f, agency: e.target.value as "NN" | "EESL" }))} className={inputClass}>
                                    <option value="NN">Nagar Nigam</option>
                                    <option value="EESL">EESL</option>
                                  </select>
                                  <input
                                    required
                                    placeholder="Start point"
                                    value={editStreetForm.startPoint}
                                    onChange={(e) => setEditStreetForm((f) => ({ ...f, startPoint: e.target.value }))}
                                    className={inputClass}
                                  />
                                  <input
                                    placeholder="Intermediate point"
                                    value={editStreetForm.intermediatePoint}
                                    onChange={(e) => setEditStreetForm((f) => ({ ...f, intermediatePoint: e.target.value }))}
                                    className={inputClass}
                                  />
                                  <input
                                    placeholder="End point"
                                    value={editStreetForm.endPoint}
                                    onChange={(e) => setEditStreetForm((f) => ({ ...f, endPoint: e.target.value }))}
                                    className={inputClass}
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button type="submit" disabled={editStreetSaving} className="rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60">
                                    {editStreetSaving ? "Saving…" : "Save Changes"}
                                  </button>
                                  <button type="button" onClick={() => setEditingSegmentId(null)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            </td>
                          </tr>
                        )}

                        {expandedSegmentId === s.segmentId && (
                          <tr key={`${s.segmentId}-detail`}>
                            <td colSpan={7} className="border-b border-slate-100 bg-slate-50 p-4">
                              {loadingSegmentId === s.segmentId ? (
                                <p className="text-xs text-slate-400">Loading…</p>
                              ) : !s.segmentId || !segmentLights[s.segmentId] || segmentLights[s.segmentId]!.length === 0 ? (
                                <div>
                                  <p className="mb-3 text-xs text-slate-400">No lights on this street yet.</p>
                                  {canManageStreets && (
                                    <button
                                      onClick={() => handleInsertLight(s.segmentId!, 0)}
                                      disabled={insertingSeq === 0}
                                      className="inline-flex items-center gap-1 text-xs font-semibold text-nnm-blue hover:underline"
                                    >
                                      <PlusCircle className="h-3.5 w-3.5" />
                                      {insertingSeq === 0 ? "Adding…" : "Add first light"}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {canManageStreets && (
                                    <button
                                      onClick={() => handleInsertLight(s.segmentId!, 0)}
                                      disabled={insertingSeq === 0}
                                      className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-nnm-blue hover:underline"
                                    >
                                      <PlusCircle className="h-3.5 w-3.5" />
                                      {insertingSeq === 0 ? "Adding…" : "Add light before this street's first light"}
                                    </button>
                                  )}
                                  {segmentLights[s.segmentId]!.map((l) => (
                                    <div key={l.lightId}>
                                      <div className="rounded-md border border-slate-200 bg-white p-3">
                                        <div className="mb-1 flex flex-wrap items-center gap-2">
                                          <span className="font-mono text-xs text-slate-700">{l.serialNumber}</span>
                                          {l.working ? (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-700">
                                              <CheckCircle2 className="h-3 w-3" />
                                              Working
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700">
                                              <XCircle className="h-3 w-3" />
                                              Not Working
                                            </span>
                                          )}
                                          {!l.active && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">Inactive</span>}

                                          {canManageStreets && (
                                            <select
                                              value={l.switchStatus ?? ""}
                                              disabled={changingStatusLightId === l.lightId}
                                              onChange={(e) => handleChangeStatus(s.segmentId!, l.lightId, e.target.value as LightSwitchStatus)}
                                              className="ml-auto rounded-md border border-slate-300 px-2 py-1 text-[11px] outline-none focus:ring-1 focus:ring-nnm-blue"
                                            >
                                              <option value="" disabled>
                                                Functional status…
                                              </option>
                                              {(Object.keys(SWITCH_STATUS_LABELS) as LightSwitchStatus[]).map((k) => (
                                                <option key={k} value={k}>
                                                  {SWITCH_STATUS_LABELS[k]}
                                                </option>
                                              ))}
                                            </select>
                                          )}
                                        </div>
                                        {l.faultHistory.length > 0 && (
                                          <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                                            <p className="text-[10px] font-semibold uppercase text-slate-400">Repair history</p>
                                            {l.faultHistory.map((f) => (
                                              <p key={f.faultId} className="text-xs text-slate-600">
                                                Reported {new Date(f.reportedAt).toLocaleDateString("en-IN")}
                                                {f.status === "repaired" && f.repairedAt ? ` · Repaired ${new Date(f.repairedAt).toLocaleDateString("en-IN")}` : " · Still open"}
                                                {f.reporterNotes ? ` - "${f.reporterNotes}"` : ""}
                                              </p>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      {canManageStreets && l.lightSerialSeq != null && (
                                        <button
                                          onClick={() => handleInsertLight(s.segmentId!, l.lightSerialSeq!)}
                                          disabled={insertingSeq === l.lightSerialSeq}
                                          className="my-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-nnm-blue hover:underline"
                                        >
                                          <PlusCircle className="h-3.5 w-3.5" />
                                          {insertingSeq === l.lightSerialSeq ? "Adding…" : "Add light after this"}
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                  {streetTotalsForWard && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                        <td className="px-4 py-2.5" colSpan={3}>
                          Total
                        </td>
                        <td className="px-4 py-2.5">{streetTotalsForWard.total}</td>
                        <td className="px-4 py-2.5 text-green-700">{streetTotalsForWard.working}</td>
                        <td className="px-4 py-2.5 text-red-600">{streetTotalsForWard.notWorking}</td>
                        {canManageStreets && <td className="px-4 py-2.5"></td>}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {canManageStreets && (
              <div className="mt-4">
                {!showAddStreet ? (
                  <button onClick={() => setShowAddStreet(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-nnm-blue hover:underline">
                    <PlusCircle className="h-4 w-4" />
                    Add new street
                  </button>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white p-6">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-slate-800">Add New Street - {openWard}</h2>
                      <button onClick={() => setShowAddStreet(false)} className="text-slate-400 hover:text-slate-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <form onSubmit={handleAddStreet} className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Agency</label>
                          <select value={addStreetForm.agency} onChange={(e) => setAddStreetForm((f) => ({ ...f, agency: e.target.value as "NN" | "EESL" }))} className={inputClass}>
                            <option value="NN">Nagar Nigam</option>
                            <option value="EESL">EESL</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Number of lights</label>
                          <input
                            type="number"
                            min="0"
                            value={addStreetForm.lightCount}
                            onChange={(e) => setAddStreetForm((f) => ({ ...f, lightCount: e.target.value }))}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Start point</label>
                        <input required value={addStreetForm.startPoint} onChange={(e) => setAddStreetForm((f) => ({ ...f, startPoint: e.target.value }))} className={inputClass} />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Intermediate point (optional)</label>
                          <input value={addStreetForm.intermediatePoint} onChange={(e) => setAddStreetForm((f) => ({ ...f, intermediatePoint: e.target.value }))} className={inputClass} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">End point (optional)</label>
                          <input value={addStreetForm.endPoint} onChange={(e) => setAddStreetForm((f) => ({ ...f, endPoint: e.target.value }))} className={inputClass} />
                        </div>
                      </div>
                      <button type="submit" disabled={addStreetSaving} className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60">
                        {addStreetSaving ? "Adding…" : "Add Street"}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
