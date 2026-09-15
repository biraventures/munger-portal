"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, UserPlus, Upload, ArrowRightLeft, Trash2 } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import {
  fetchAttendanceWards,
  fetchAttendanceShifts,
  fetchAllFieldStaff,
  createFieldStaff,
  setFieldStaffActive,
  deleteFieldStaff,
  transferFieldStaff,
  uploadFieldStaffRosterCsv,
  uploadStaffMergedImportCsv,
  deactivateAllFieldStaff,
  fetchStaffJobRoles,
  setStaffJobRoles,
  type AttendanceWard,
  type AttendanceShift,
  type FieldStaffSummary,
  type RosterSyncResult,
  type StaffMergedImportResult,
  type StaffJobRoleSummary,
} from "@/lib/attendance-api";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export default function ManageStaffPage() {
  // Sanitation officers can view the roster and transfer workers
  // between wards; only attendance_admin can create, rename, or
  // deactivate - the page below hides those sections for officers.
  const user = useAttendanceGuard(["attendance_admin", "sanitation_officer"]);
  const isAdmin = user?.role === "attendance_admin";
  const [wards, setWards] = useState<AttendanceWard[]>([]);
  const [shifts, setShifts] = useState<AttendanceShift[]>([]);
  const [staff, setStaff] = useState<FieldStaffSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [wardId, setWardId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const [jobRoles, setJobRoles] = useState<StaffJobRoleSummary[]>([]);

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<RosterSyncResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mergedImportUploading, setMergedImportUploading] = useState(false);
  const [mergedImportResult, setMergedImportResult] = useState<StaffMergedImportResult | null>(null);
  const [mergedImportError, setMergedImportError] = useState<string | null>(null);
  const mergedImportFileInputRef = useRef<HTMLInputElement>(null);
  const [deletingStaff, setDeletingStaff] = useState<FieldStaffSummary | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deactivateAllOpen, setDeactivateAllOpen] = useState(false);
  const [deactivateAllPhrase, setDeactivateAllPhrase] = useState("");
  const [deactivateAllSubmitting, setDeactivateAllSubmitting] = useState(false);
  const [deactivateAllError, setDeactivateAllError] = useState<string | null>(null);
  const [deactivateAllResult, setDeactivateAllResult] = useState<number | null>(null);

  const [transferringId, setTransferringId] = useState<number | null>(null);
  const [transferWardId, setTransferWardId] = useState("");
  const [transferShiftId, setTransferShiftId] = useState("");
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const [editingRolesId, setEditingRolesId] = useState<number | null>(null);
  const [editingRoleIds, setEditingRoleIds] = useState<number[]>([]);
  const [rolesSubmitting, setRolesSubmitting] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);

  const wardName = (id: number) => wards.find((w) => w.id === id)?.wardName ?? "-";
  const shiftName = (id: number | null) => (id ? shifts.find((s) => s.id === id)?.shiftName : null) ?? "-";
  const roleNames = (ids: number[]) =>
    ids.map((id) => jobRoles.find((r) => r.id === id)?.roleName).filter(Boolean).join(", ") || "-";

  async function loadStaff() {
    try {
      setStaff(await fetchAllFieldStaff());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load staff list.");
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
    fetchStaffJobRoles()
      .then(setJobRoles)
      .catch(() => setJobRoles([]));
    loadStaff();
  }, [user]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreated(false);
    if (!wardId) {
      setCreateError("Select a ward.");
      return;
    }
    setCreating(true);
    try {
      await createFieldStaff({ name, wardId: Number(wardId), shiftId: shiftId ? Number(shiftId) : null, roleIds: selectedRoleIds });
      setCreated(true);
      setName("");
      setWardId("");
      setShiftId("");
      setSelectedRoleIds([]);
      await loadStaff();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not add staff member.");
    } finally {
      setCreating(false);
    }
  }

  function toggleCreateRole(id: number) {
    setSelectedRoleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  async function handleToggleActive(id: number, active: boolean) {
    setError(null);
    try {
      await setFieldStaffActive(id, active);
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    }
  }

  function openTransfer(s: FieldStaffSummary) {
    setTransferringId(s.id);
    setTransferWardId(String(s.wardId));
    setTransferShiftId(s.shiftId ? String(s.shiftId) : "");
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
      await transferFieldStaff(transferringId, Number(transferWardId), transferShiftId ? Number(transferShiftId) : null);
      setTransferringId(null);
      await loadStaff();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Could not transfer staff member.");
    } finally {
      setTransferSubmitting(false);
    }
  }

  function openRolesEdit(s: FieldStaffSummary) {
    setEditingRolesId(s.id);
    setEditingRoleIds(s.roleIds);
    setRolesError(null);
  }

  function toggleEditingRole(id: number) {
    setEditingRoleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  async function handleRolesSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingRolesId === null) return;
    setRolesError(null);
    setRolesSubmitting(true);
    try {
      await setStaffJobRoles(editingRolesId, editingRoleIds);
      setEditingRolesId(null);
      await loadStaff();
    } catch (err) {
      setRolesError(err instanceof Error ? err.message : "Could not update roles.");
    } finally {
      setRolesSubmitting(false);
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
      const result = await uploadFieldStaffRosterCsv(text);
      setUploadResult(result);
      await loadStaff();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleMergedImportFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMergedImportUploading(true);
    setMergedImportError(null);
    setMergedImportResult(null);
    try {
      const text = await file.text();
      const result = await uploadStaffMergedImportCsv(text);
      setMergedImportResult(result);
      await loadStaff();
    } catch (err) {
      setMergedImportError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setMergedImportUploading(false);
      if (mergedImportFileInputRef.current) mergedImportFileInputRef.current.value = "";
    }
  }

  async function handleDeactivateAll() {
    setDeactivateAllSubmitting(true);
    setDeactivateAllError(null);
    try {
      const { deactivated } = await deactivateAllFieldStaff(deactivateAllPhrase);
      setDeactivateAllResult(deactivated);
      setDeactivateAllOpen(false);
      setDeactivateAllPhrase("");
      await loadStaff();
    } catch (err) {
      setDeactivateAllError(err instanceof Error ? err.message : "Could not deactivate staff.");
    } finally {
      setDeactivateAllSubmitting(false);
    }
  }

  async function handleDeleteStaff() {
    if (!deletingStaff) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await deleteFieldStaff(deletingStaff.id);
      setDeletingStaff(null);
      setDeleteConfirmName("");
      await loadStaff();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete this staff member.");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Manage Field Staff</h1>
        <p className="mb-6 text-sm text-slate-500">Add sanitation workers one at a time, or upload a full list.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* One-by-one entry - attendance_admin only */}
        {isAdmin && (
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <UserPlus className="h-4 w-4" />
            Add One Staff Member
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
              Staff member added.
            </div>
          )}

          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Name</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
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
              <label className={labelClass}>Job Role(s) - a worker can hold more than one</label>
              <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 p-3">
                {jobRoles.map((r) => (
                  <label key={r.id} className="flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs">
                    <input type="checkbox" checked={selectedRoleIds.includes(r.id)} onChange={() => toggleCreateRole(r.id)} />
                    {r.roleName}
                  </label>
                ))}
              </div>
            </div>
            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-md bg-nnm-blue py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60 sm:w-auto sm:px-8"
              >
                {creating ? "Adding..." : "Add Staff Member"}
              </button>
            </div>
          </form>
        </section>
        )}

        {/* Bulk upload - attendance_admin only */}
        {isAdmin && (
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Upload className="h-4 w-4" />
            Upload Full List (CSV)
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Columns: <code className="rounded bg-slate-100 px-1 py-0.5">Name, Ward, Shift</code>. Ward and Shift must match the
            names shown above exactly. This replaces the entire active roster - anyone not in the uploaded file will be marked
            inactive, not deleted.
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

        {/* Merged data import - attendance_admin only */}
        {isAdmin && (
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Upload className="h-4 w-4" />
            Import Field Staff (Merged Data CSV)
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            For a roster sheet with columns:{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5">
              SL. No., Unique ID, Name, Father Name, Phone, Employer, Location/Ward, Role, Shift
            </code>
            . Covers every municipal field role, not just sanitation - any Role name not already in the system is created
            automatically. Every distinct Location/Ward value becomes its own entry in the Wards list (not just the numbered
            wards - offices and special-duty teams too); only a genuinely blank value falls under a shared
            &quot;Central/Unassigned&quot; ward. This adds to the existing roster rather than replacing it.
          </p>

          <input
            ref={mergedImportFileInputRef}
            type="file"
            accept=".csv"
            onChange={handleMergedImportFileSelected}
            disabled={mergedImportUploading}
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-nnm-blue file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-nnm-blue-dark disabled:opacity-60"
          />

          {mergedImportUploading && (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing import...
            </div>
          )}

          {mergedImportError && (
            <div role="alert" className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {mergedImportError}
            </div>
          )}

          {mergedImportResult && (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="mb-2 font-semibold text-slate-700">
                Created {mergedImportResult.created}, updated {mergedImportResult.updated}.
                {mergedImportResult.rolesCreated.length > 0 && ` ${mergedImportResult.rolesCreated.length} new role(s) added.`}
                {mergedImportResult.wardsCreated.length > 0 && ` ${mergedImportResult.wardsCreated.length} new ward(s) added.`}
              </p>
              {mergedImportResult.rolesCreated.length > 0 && (
                <p className="mb-2 text-xs text-slate-500">New roles: {mergedImportResult.rolesCreated.join(", ")}</p>
              )}
              {mergedImportResult.wardsCreated.length > 0 && (
                <p className="mb-2 text-xs text-slate-500">New wards: {mergedImportResult.wardsCreated.join(", ")}</p>
              )}
              {mergedImportResult.skipped.length > 0 && (
                <div>
                  <p className="mb-1 font-semibold text-amber-700">{mergedImportResult.skipped.length} row(s) skipped:</p>
                  <ul className="max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto text-xs text-amber-700">
                    {mergedImportResult.skipped.map((s, i) => (
                      <li key={i}>
                        Row {s.row}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
        )}

        {/* Deactivate all - attendance_admin only, requires typed confirmation phrase */}
        {isAdmin && (
        <section className="mb-8 rounded-xl border border-red-200 bg-red-50 p-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-800">
            <Trash2 className="h-4 w-4" />
            Deactivate All Field Staff
          </h2>
          <p className="mb-4 text-xs text-red-700">
            Marks every currently-active sanitation worker inactive in one action. This does not delete anyone or their
            attendance history - it can be undone by reactivating individuals, or by uploading a fresh roster above.
          </p>

          {deactivateAllResult !== null && (
            <div role="status" className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {deactivateAllResult} staff member{deactivateAllResult === 1 ? "" : "s"} deactivated.
            </div>
          )}

          {!deactivateAllOpen ? (
            <button
              onClick={() => {
                setDeactivateAllOpen(true);
                setDeactivateAllResult(null);
                setDeactivateAllError(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              <Trash2 className="h-4 w-4" />
              Deactivate All Field Staff
            </button>
          ) : (
            <div className="rounded-md border border-red-300 bg-white p-4">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Type <code className="rounded bg-slate-100 px-1 py-0.5">deactivate all field staff</code> to confirm
              </label>
              <input
                value={deactivateAllPhrase}
                onChange={(e) => setDeactivateAllPhrase(e.target.value)}
                className={inputClass}
                placeholder="deactivate all field staff"
                autoFocus
              />

              {deactivateAllError && (
                <div role="alert" className="mt-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {deactivateAllError}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={handleDeactivateAll}
                  disabled={deactivateAllSubmitting || !deactivateAllPhrase.trim()}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {deactivateAllSubmitting ? "Deactivating..." : "Confirm Deactivation"}
                </button>
                <button
                  onClick={() => {
                    setDeactivateAllOpen(false);
                    setDeactivateAllPhrase("");
                    setDeactivateAllError(null);
                  }}
                  disabled={deactivateAllSubmitting}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
        )}

        {/* Roster table */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">All Staff ({staff?.length ?? "..."})</h2>
          {!staff ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">Unique ID</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Ward/Location</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Shift</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{s.externalId ?? "-"}</td>
                      <td className="px-3 py-2">{s.name}</td>
                      <td className="px-3 py-2">{wardName(s.wardId)}</td>
                      <td className="max-w-[160px] px-3 py-2 text-xs text-slate-500">{roleNames(s.roleIds)}</td>
                      <td className="px-3 py-2">{shiftName(s.shiftId)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${s.active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}
                        >
                          {s.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => openTransfer(s)} className="text-xs font-medium text-nnm-blue hover:underline">
                            Transfer
                          </button>
                          {isAdmin && (
                            <>
                              <button onClick={() => openRolesEdit(s)} className="text-xs font-medium text-nnm-blue hover:underline">
                                Roles
                              </button>
                              <button onClick={() => handleToggleActive(s.id, !s.active)} className="text-xs font-medium text-slate-500 hover:underline">
                                {s.active ? "Deactivate" : "Activate"}
                              </button>
                              <button
                                onClick={() => {
                                  setDeletingStaff(s);
                                  setDeleteConfirmName("");
                                  setDeleteError(null);
                                }}
                                className="text-xs font-medium text-red-600 hover:underline"
                              >
                                Delete
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

      {transferringId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <ArrowRightLeft className="h-4 w-4" />
              Transfer {staff?.find((s) => s.id === transferringId)?.name}
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

      {deletingStaff !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-800">
              <Trash2 className="h-4 w-4" />
              Permanently Delete Staff Member
            </h2>
            <p className="mb-4 text-xs text-red-700">
              This permanently deletes {deletingStaff.name} and their attendance/feedback history. Unlike Deactivate, this
              cannot be undone. If they&apos;ve simply left, use Deactivate instead.
            </p>

            {deleteError && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {deleteError}
              </div>
            )}

            <label className="mb-1 block text-xs font-medium text-slate-600">
              Type <code className="rounded bg-slate-100 px-1 py-0.5">{deletingStaff.name}</code> to confirm
            </label>
            <input value={deleteConfirmName} onChange={(e) => setDeleteConfirmName(e.target.value)} className={inputClass} autoFocus />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeletingStaff(null);
                  setDeleteConfirmName("");
                  setDeleteError(null);
                }}
                disabled={deleteSubmitting}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteStaff}
                disabled={deleteSubmitting || deleteConfirmName.trim() !== deletingStaff.name}
                className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
              >
                {deleteSubmitting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingRolesId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 className="mb-4 text-sm font-semibold text-slate-800">
              Job Role(s) for {staff?.find((s) => s.id === editingRolesId)?.name}
            </h2>
            {rolesError && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {rolesError}
              </div>
            )}
            <form onSubmit={handleRolesSubmit} className="space-y-4">
              <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 p-3">
                {jobRoles.map((r) => (
                  <label key={r.id} className="flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs">
                    <input type="checkbox" checked={editingRoleIds.includes(r.id)} onChange={() => toggleEditingRole(r.id)} />
                    {r.roleName}
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRolesId(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rolesSubmitting}
                  className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                >
                  {rolesSubmitting ? "Saving..." : "Save Roles"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
