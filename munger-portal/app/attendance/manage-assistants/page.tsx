"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, UserPlus, Upload, ArrowRightLeft, Repeat } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import {
  fetchAttendanceWards,
  fetchAttendanceShifts,
  fetchAllFieldDrivers,
  fetchAllFieldAssistants,
  createFieldAssistant,
  setFieldAssistantActive,
  transferFieldAssistant,
  updateFieldAssistantDetails,
  reassignFieldAssistantDriver,
  uploadFieldAssistantRosterCsv,
  type AttendanceWard,
  type AttendanceShift,
  type FieldDriverSummary,
  type FieldAssistantSummary,
  type RosterSyncResult,
} from "@/lib/attendance-api";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export default function ManageAssistantsPage() {
  const user = useAttendanceGuard(["attendance_admin", "sanitation_officer"]);
  const isAdmin = user?.role === "attendance_admin";

  const [wards, setWards] = useState<AttendanceWard[]>([]);
  const [shifts, setShifts] = useState<AttendanceShift[]>([]);
  const [drivers, setDrivers] = useState<FieldDriverSummary[]>([]);
  const [assistants, setAssistants] = useState<FieldAssistantSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [driverId, setDriverId] = useState("");
  const [wardId, setWardId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<RosterSyncResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingAssistant, setEditingAssistant] = useState<FieldAssistantSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [editExternalId, setEditExternalId] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [transferringId, setTransferringId] = useState<number | null>(null);
  const [transferWardId, setTransferWardId] = useState("");
  const [transferShiftId, setTransferShiftId] = useState("");
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const [reassigningId, setReassigningId] = useState<number | null>(null);
  const [reassignDriverId, setReassignDriverId] = useState("");
  const [reassignSubmitting, setReassignSubmitting] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);

  const wardName = (id: number) => wards.find((w) => w.id === id)?.wardName ?? "-";
  const shiftName = (id: number | null) => (id ? shifts.find((s) => s.id === id)?.shiftName : null) ?? "-";
  const driverName = (id: number) => drivers.find((d) => d.id === id)?.name ?? `#${id}`;

  async function loadAssistants() {
    try {
      setAssistants(await fetchAllFieldAssistants());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load assistant list.");
    }
  }

  useEffect(() => {
    if (!user) return;
    fetchAttendanceWards()
      .then(setWards)
      .catch(() => setWards([]));
    fetchAttendanceShifts()
      .then(setShifts)
      .catch(() => setShifts([]));
    fetchAllFieldDrivers()
      .then(setDrivers)
      .catch(() => setDrivers([]));
    loadAssistants();
  }, [user]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreated(false);
    if (!wardId) {
      setCreateError("Select a ward.");
      return;
    }
    if (!driverId) {
      setCreateError("Select a driver - every assistant must be tied to one.");
      return;
    }
    setCreating(true);
    try {
      await createFieldAssistant({ name, driverId: Number(driverId), wardId: Number(wardId), shiftId: shiftId ? Number(shiftId) : null });
      setCreated(true);
      setName("");
      setDriverId("");
      setWardId("");
      setShiftId("");
      await loadAssistants();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not add assistant.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(id: number, active: boolean) {
    setError(null);
    try {
      await setFieldAssistantActive(id, active);
      await loadAssistants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    }
  }

  function openEditAssistant(a: FieldAssistantSummary) {
    setEditingAssistant(a);
    setEditName(a.name);
    setEditExternalId(a.externalId ?? "");
    setEditError(null);
  }

  async function handleEditAssistantSubmit() {
    if (!editingAssistant) return;
    if (!editName.trim()) {
      setEditError("Name is required.");
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      await updateFieldAssistantDetails(editingAssistant.id, editName.trim(), editExternalId.trim() || null);
      setEditingAssistant(null);
      await loadAssistants();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not update this assistant.");
    } finally {
      setEditSubmitting(false);
    }
  }

  function openTransfer(a: FieldAssistantSummary) {
    setTransferringId(a.id);
    setTransferWardId(String(a.wardId));
    setTransferShiftId(a.shiftId ? String(a.shiftId) : "");
    setTransferError(null);
  }

  async function handleTransferSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (transferringId === null) return;
    setTransferError(null);
    if (!transferWardId) {
      setTransferError("Select a ward.");
      return;
    }
    setTransferSubmitting(true);
    try {
      await transferFieldAssistant(transferringId, Number(transferWardId), transferShiftId ? Number(transferShiftId) : null);
      setTransferringId(null);
      await loadAssistants();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Could not transfer assistant.");
    } finally {
      setTransferSubmitting(false);
    }
  }

  function openReassign(a: FieldAssistantSummary) {
    setReassigningId(a.id);
    setReassignDriverId(String(a.driverId));
    setReassignError(null);
  }

  async function handleReassignSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reassigningId === null) return;
    setReassignError(null);
    if (!reassignDriverId) {
      setReassignError("Select a driver.");
      return;
    }
    setReassignSubmitting(true);
    try {
      await reassignFieldAssistantDriver(reassigningId, Number(reassignDriverId));
      setReassigningId(null);
      await loadAssistants();
    } catch (err) {
      setReassignError(err instanceof Error ? err.message : "Could not reassign assistant.");
    } finally {
      setReassignSubmitting(false);
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const text = await file.text();
      const result = await uploadFieldAssistantRosterCsv(text);
      setUploadResult(result);
      await loadAssistants();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Manage Assistants</h1>
        <p className="mb-6 text-sm text-slate-500">Each assistant is tied to a driver - their supervisor is inherited automatically.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {isAdmin && (
          <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <UserPlus className="h-4 w-4" />
              Add One Assistant
            </h2>

            {createError && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {createError}
              </div>
            )}
            {created && (
              <div role="status" className="mb-4 flex items-center gap-1.5 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                Assistant added.
              </div>
            )}

            <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={labelClass}>Name</label>
                <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Driver</label>
                <select required value={driverId} onChange={(e) => setDriverId(e.target.value)} className={inputClass}>
                  <option value="">Select...</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Ward</label>
                <select required value={wardId} onChange={(e) => setWardId(e.target.value)} className={inputClass}>
                  <option value="">Select...</option>
                  {wards.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.wardName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Shift (optional)</label>
                <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} className={inputClass}>
                  <option value="">None</option>
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shiftName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full rounded-md bg-nnm-blue py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60 sm:w-auto sm:px-8"
                >
                  {creating ? "Adding..." : "Add Assistant"}
                </button>
              </div>
            </form>
          </section>
        )}

        {isAdmin && (
          <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Upload className="h-4 w-4" />
              Upload Full List (CSV)
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Columns: <code className="rounded bg-slate-100 px-1 py-0.5">ID, Name, DriverID, Ward, Shift</code>. DriverID is the
              driver&apos;s own ID (from the driver roster). Ward must match the names shown above exactly. This replaces the
              entire active roster - anyone not in the uploaded file will be marked inactive, not deleted.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelected}
              disabled={uploading}
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-nnm-blue file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-nnm-blue-dark disabled:opacity-60"
            />

            {uploading && (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing upload...
              </div>
            )}
            {uploadError && (
              <div role="alert" className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {uploadError}
              </div>
            )}
            {uploadResult && (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="mb-2 font-semibold text-slate-700">
                  Created {uploadResult.created}, updated {uploadResult.updated}, deactivated {uploadResult.deactivated}.
                </p>
                {uploadResult.errors.length > 0 && (
                  <div>
                    <p className="mb-1 font-semibold text-amber-700">{uploadResult.errors.length} row(s) skipped:</p>
                    <ul className="list-inside list-disc space-y-0.5 text-xs text-amber-700">
                      {uploadResult.errors.map((e, i) => (
                        <li key={i}>
                          Row {e.row}: {e.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">All Assistants ({assistants?.length ?? "..."})</h2>
          {!assistants ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Driver</th>
                    <th className="px-3 py-2 font-medium">Ward</th>
                    <th className="px-3 py-2 font-medium">Shift</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {assistants.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2">{a.name}</td>
                      <td className="px-3 py-2">{driverName(a.driverId)}</td>
                      <td className="px-3 py-2">{wardName(a.wardId)}</td>
                      <td className="px-3 py-2">{shiftName(a.shiftId)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${a.active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}
                        >
                          {a.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => openEditAssistant(a)} className="text-xs font-medium text-nnm-blue hover:underline">
                            Edit
                          </button>
                          <button onClick={() => openTransfer(a)} className="text-xs font-medium text-nnm-blue hover:underline">
                            Transfer
                          </button>
                          {isAdmin && (
                            <>
                              <button onClick={() => openReassign(a)} className="inline-flex items-center gap-1 text-xs font-medium text-nnm-blue hover:underline">
                                <Repeat className="h-3 w-3" />
                                Driver
                              </button>
                              <button onClick={() => handleToggleActive(a.id, !a.active)} className="text-xs font-medium text-slate-500 hover:underline">
                                {a.active ? "Deactivate" : "Activate"}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {editingAssistant !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 className="mb-4 text-sm font-semibold text-slate-800">Edit {editingAssistant.name}</h2>

            {editError && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {editError}
              </div>
            )}

            <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} className={`${inputClass} mb-3`} autoFocus />

            <label className="mb-1 block text-xs font-medium text-slate-600">Unique ID</label>
            <input value={editExternalId} onChange={(e) => setEditExternalId(e.target.value)} className={inputClass} placeholder="(optional)" />

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingAssistant(null)}
                disabled={editSubmitting}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditAssistantSubmit}
                disabled={editSubmitting}
                className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
              >
                {editSubmitting ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {transferringId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <ArrowRightLeft className="h-4 w-4" />
              Transfer {assistants?.find((a) => a.id === transferringId)?.name}
            </h2>
            {transferError && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {transferError}
              </div>
            )}
            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <div>
                <label className={labelClass}>New Ward</label>
                <select required value={transferWardId} onChange={(e) => setTransferWardId(e.target.value)} className={inputClass}>
                  <option value="">Select...</option>
                  {wards.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.wardName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>New Shift (optional)</label>
                <select value={transferShiftId} onChange={(e) => setTransferShiftId(e.target.value)} className={inputClass}>
                  <option value="">Keep current</option>
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shiftName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTransferringId(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={transferSubmitting}
                  className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                >
                  {transferSubmitting ? "Transferring..." : "Confirm Transfer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reassigningId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Repeat className="h-4 w-4" />
              Reassign Driver for {assistants?.find((a) => a.id === reassigningId)?.name}
            </h2>
            <p className="mb-4 text-xs text-slate-500">The assistant&apos;s supervisor will automatically update to match the new driver&apos;s supervisor.</p>
            {reassignError && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {reassignError}
              </div>
            )}
            <form onSubmit={handleReassignSubmit} className="space-y-4">
              <div>
                <label className={labelClass}>New Driver</label>
                <select required value={reassignDriverId} onChange={(e) => setReassignDriverId(e.target.value)} className={inputClass}>
                  <option value="">Select...</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReassigningId(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reassignSubmitting}
                  className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                >
                  {reassignSubmitting ? "Saving..." : "Confirm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
