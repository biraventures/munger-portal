"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, UserPlus, Upload, ArrowRightLeft, Trash2 } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import {
  fetchAttendanceWards,
  fetchAttendanceShifts,
  fetchAttendanceUsers,
  fetchAllFieldDrivers,
  createFieldDriver,
  setFieldDriverActive,
  assignFieldDriver,
  transferFieldDriver,
  uploadFieldDriverRosterCsv,
  uploadVehicleStaffImportCsv,
  purgeAllFieldRecords,
  fetchAllAssets,
  type AttendanceWard,
  type AttendanceShift,
  type AttendanceUserSummary,
  type FieldDriverSummary,
  type AssetSummary,
  type RosterSyncResult,
  type VehicleStaffImportResult,
} from "@/lib/attendance-api";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export default function ManageDriversPage() {
  // Sanitation officers can view the roster and transfer drivers
  // between wards; only attendance_admin can create, rename, or
  // deactivate - the page below hides those sections for officers.
  const user = useAttendanceGuard(["attendance_admin", "sanitation_officer"]);
  const isAdmin = user?.role === "attendance_admin";
  const [wards, setWards] = useState<AttendanceWard[]>([]);
  const [shifts, setShifts] = useState<AttendanceShift[]>([]);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [supervisors, setSupervisors] = useState<AttendanceUserSummary[]>([]);
  const [drivers, setDrivers] = useState<FieldDriverSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [externalId, setExternalId] = useState("");
  const [dlNumber, setDlNumber] = useState("");
  const [assetId, setAssetId] = useState("");
  const [wardId, setWardId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<RosterSyncResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [vehicleStaffUploading, setVehicleStaffUploading] = useState(false);
  const [vehicleStaffResult, setVehicleStaffResult] = useState<VehicleStaffImportResult | null>(null);
  const [vehicleStaffError, setVehicleStaffError] = useState<string | null>(null);
  const vehicleStaffFileInputRef = useRef<HTMLInputElement>(null);
  const [purgeAllOpen, setPurgeAllOpen] = useState(false);
  const [purgeAllPhrase, setPurgeAllPhrase] = useState("");
  const [purgeAllSubmitting, setPurgeAllSubmitting] = useState(false);
  const [purgeAllError, setPurgeAllError] = useState<string | null>(null);
  const [purgeAllResult, setPurgeAllResult] = useState<{ staffDeleted: number; driversDeleted: number; assistantsDeleted: number } | null>(null);

  const [transferringId, setTransferringId] = useState<number | null>(null);
  const [transferWardId, setTransferWardId] = useState("");
  const [transferShiftId, setTransferShiftId] = useState("");
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [assignAssetId, setAssignAssetId] = useState("");
  const [assignSupervisorId, setAssignSupervisorId] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const wardName = (id: number) => wards.find((w) => w.id === id)?.wardName ?? "-";
  const shiftName = (id: number | null) => (id ? shifts.find((s) => s.id === id)?.shiftName : null) ?? "-";
  const ASSET_TYPE_LABELS: Record<AssetSummary["assetType"], string> = { vehicle: "Vehicle", tricycle: "Tricycle", hand_cart: "Hand Cart" };
  /** Type + vehicle number together, e.g. "Vehicle - BR06AB1234" - the label alone doesn't say what kind of asset it is or its registration number at a glance. */
  const assetDisplay = (id: number | null) => {
    const a = id ? assets.find((x) => x.id === id) : null;
    if (!a) return "-";
    const typeAndNumber = [ASSET_TYPE_LABELS[a.assetType], a.vehicleNumber].filter(Boolean).join(" - ");
    return `${a.label} (${typeAndNumber})`;
  };

  async function loadDrivers() {
    try {
      setDrivers(await fetchAllFieldDrivers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load driver list.");
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
    fetchAllAssets()
      .then(setAssets)
      .catch(() => setAssets([]));
    fetchAttendanceUsers()
      .then((users) => setSupervisors(users.filter((u) => u.role === "driver_supervisor")))
      .catch(() => setSupervisors([]));
    loadDrivers();
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
      await createFieldDriver({
        name,
        externalId: externalId || null,
        dlNumber: dlNumber || null,
        wardId: Number(wardId),
        shiftId: shiftId ? Number(shiftId) : null,
        assetId: assetId ? Number(assetId) : null,
      });
      setCreated(true);
      setName("");
      setExternalId("");
      setDlNumber("");
      setAssetId("");
      setWardId("");
      setShiftId("");
      await loadDrivers();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not add driver.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(id: number, active: boolean) {
    setError(null);
    try {
      await setFieldDriverActive(id, active);
      await loadDrivers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    }
  }

  function openTransfer(d: FieldDriverSummary) {
    setTransferringId(d.id);
    setTransferWardId(String(d.wardId));
    setTransferShiftId(d.shiftId ? String(d.shiftId) : "");
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
      await transferFieldDriver(transferringId, Number(transferWardId), transferShiftId ? Number(transferShiftId) : null);
      setTransferringId(null);
      await loadDrivers();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Could not transfer driver.");
    } finally {
      setTransferSubmitting(false);
    }
  }

  function openAssign(d: FieldDriverSummary) {
    setAssigningId(d.id);
    setAssignAssetId(d.assetId ? String(d.assetId) : "");
    setAssignSupervisorId(d.supervisorId ? String(d.supervisorId) : "");
    setAssignError(null);
  }

  async function handleAssignSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (assigningId === null) return;
    setAssignError(null);
    setAssignSubmitting(true);
    try {
      await assignFieldDriver(assigningId, assignAssetId ? Number(assignAssetId) : null, assignSupervisorId ? Number(assignSupervisorId) : null);
      setAssigningId(null);
      await loadDrivers();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Could not assign driver.");
    } finally {
      setAssignSubmitting(false);
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
      const result = await uploadFieldDriverRosterCsv(text);
      setUploadResult(result);
      await loadDrivers();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleVehicleStaffFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVehicleStaffUploading(true);
    setVehicleStaffError(null);
    setVehicleStaffResult(null);
    try {
      const text = await file.text();
      const result = await uploadVehicleStaffImportCsv(text);
      setVehicleStaffResult(result);
      await loadDrivers();
    } catch (err) {
      setVehicleStaffError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setVehicleStaffUploading(false);
      if (vehicleStaffFileInputRef.current) vehicleStaffFileInputRef.current.value = "";
    }
  }

  async function handlePurgeAll() {
    setPurgeAllSubmitting(true);
    setPurgeAllError(null);
    try {
      const result = await purgeAllFieldRecords(purgeAllPhrase);
      setPurgeAllResult(result);
      setPurgeAllOpen(false);
      setPurgeAllPhrase("");
      await loadDrivers();
    } catch (err) {
      setPurgeAllError(err instanceof Error ? err.message : "Could not delete these records.");
    } finally {
      setPurgeAllSubmitting(false);
    }
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Manage Field Drivers</h1>
        <p className="mb-6 text-sm text-slate-500">Add drivers one at a time, or upload a full list.</p>

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
            Add One Driver
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
              Driver added.
            </div>
          )}

          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Name</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Driver ID</label>
              <input
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                placeholder="e.g. D1"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>DL Number</label>
              <input value={dlNumber} onChange={(e) => setDlNumber(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Asset / Vehicle (optional)</label>
              <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className={inputClass}>
                <option value="">None</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} ({ASSET_TYPE_LABELS[a.assetType]}{a.vehicleNumber ? ` - ${a.vehicleNumber}` : ""})
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
                {creating ? "Adding..." : "Add Driver"}
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
            Columns:{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5">Name, DLNumber, Ward, Shift, VehicleNumber</code>. VehicleNumber
            (optional) links to an existing asset by its vehicle number - add the vehicle to the asset registry first if it isn&apos;t
            there yet. Ward and Shift must match the names shown above exactly. This replaces the entire active roster -
            anyone not in the uploaded file will be marked inactive, not deleted.
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

        {/* Combined driver + vehicle assistant import - attendance_admin only */}
        {isAdmin && (
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Upload className="h-4 w-4" />
            Import Drivers &amp; Vehicle Assistants (CSV)
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            For a combined roster sheet with columns:{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5">
              SL/NO, Unique ID, Location, Driver Name, Father&apos;s Name, Phone Number, Employeer, Role, Shift, Vehicle, Registration
              Number, Driving License, Status
            </code>
            . Role must be &quot;DRIVER&quot; or &quot;Vehicle assistant&quot; - each assistant is linked to the driver listed
            immediately above it. Rows with a blank Location are filed under a &quot;Central/Unassigned&quot; ward. Vehicle names are
            matched against the fleet asset registry where possible; unmatched ones are flagged but still imported. This adds to
            the existing roster rather than replacing it.
          </p>

          <input
            ref={vehicleStaffFileInputRef}
            type="file"
            accept=".csv"
            onChange={handleVehicleStaffFileSelected}
            disabled={vehicleStaffUploading}
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-nnm-blue file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-nnm-blue-dark disabled:opacity-60"
          />

          {vehicleStaffUploading && (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing import...
            </div>
          )}

          {vehicleStaffError && (
            <div role="alert" className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {vehicleStaffError}
            </div>
          )}

          {vehicleStaffResult && (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="mb-2 font-semibold text-slate-700">
                Drivers - created {vehicleStaffResult.driversCreated}, updated {vehicleStaffResult.driversUpdated}. Vehicle
                assistants - created {vehicleStaffResult.assistantsCreated}, updated {vehicleStaffResult.assistantsUpdated}.
              </p>
              {vehicleStaffResult.unmatchedVehicles.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1 font-semibold text-amber-700">
                    {vehicleStaffResult.unmatchedVehicles.length} row(s) reference a vehicle not found in the fleet registry
                    (still imported, just not linked to an asset):
                  </p>
                  <ul className="max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto text-xs text-amber-700">
                    {vehicleStaffResult.unmatchedVehicles.map((u, i) => (
                      <li key={i}>
                        Row {u.row}: {u.name} - &quot;{u.vehicle}&quot;
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {vehicleStaffResult.skipped.length > 0 && (
                <div>
                  <p className="mb-1 font-semibold text-red-700">{vehicleStaffResult.skipped.length} row(s) skipped:</p>
                  <ul className="max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto text-xs text-red-700">
                    {vehicleStaffResult.skipped.map((s, i) => (
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

        {/* Permanent purge - attendance_admin only, requires typed confirmation phrase. Deliberately more severe than the deactivate-all pattern used for staff, since this is irreversible. */}
        {isAdmin && (
        <section className="mb-8 rounded-xl border border-red-300 bg-red-50 p-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-900">
            <Trash2 className="h-4 w-4" />
            Permanently Delete All Field Records
          </h2>
          <p className="mb-4 text-xs text-red-800">
            Permanently deletes every driver, vehicle assistant, and sanitation field staff record - along with all of their
            attendance and feedback history. Unlike every other bulk action in this system, this cannot be undone. Use this
            only to clear a mistaken upload before importing corrected data.
          </p>

          {purgeAllResult && (
            <div role="status" className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Deleted {purgeAllResult.staffDeleted} staff, {purgeAllResult.driversDeleted} driver(s), and{" "}
              {purgeAllResult.assistantsDeleted} vehicle assistant(s).
            </div>
          )}

          {!purgeAllOpen ? (
            <button
              onClick={() => {
                setPurgeAllOpen(true);
                setPurgeAllResult(null);
                setPurgeAllError(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-400 bg-white px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
            >
              <Trash2 className="h-4 w-4" />
              Permanently Delete All Field Records
            </button>
          ) : (
            <div className="rounded-md border border-red-400 bg-white p-4">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Type <code className="rounded bg-slate-100 px-1 py-0.5">permanently delete all field staff and driver records</code>{" "}
                to confirm
              </label>
              <input
                value={purgeAllPhrase}
                onChange={(e) => setPurgeAllPhrase(e.target.value)}
                className={inputClass}
                placeholder="permanently delete all field staff and driver records"
                autoFocus
              />

              {purgeAllError && (
                <div role="alert" className="mt-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {purgeAllError}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={handlePurgeAll}
                  disabled={purgeAllSubmitting || !purgeAllPhrase.trim()}
                  className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                >
                  {purgeAllSubmitting ? "Deleting..." : "Confirm Permanent Deletion"}
                </button>
                <button
                  onClick={() => {
                    setPurgeAllOpen(false);
                    setPurgeAllPhrase("");
                    setPurgeAllError(null);
                  }}
                  disabled={purgeAllSubmitting}
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
          <h2 className="mb-4 text-sm font-semibold text-slate-700">All Drivers ({drivers?.length ?? "..."})</h2>
          {!drivers ? (
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
                    <th className="px-3 py-2 font-medium">Driver ID</th>
                    <th className="px-3 py-2 font-medium">Vehicle</th>
                    <th className="px-3 py-2 font-medium">Ward</th>
                    <th className="px-3 py-2 font-medium">Shift</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2">{d.name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{d.externalId ?? "-"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{assetDisplay(d.assetId)}</td>
                      <td className="px-3 py-2">{wardName(d.wardId)}</td>
                      <td className="px-3 py-2">{shiftName(d.shiftId)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${d.active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}
                        >
                          {d.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => openTransfer(d)} className="text-xs font-medium text-nnm-blue hover:underline">
                            Transfer
                          </button>
                          {isAdmin && (
                            <>
                              <button onClick={() => openAssign(d)} className="text-xs font-medium text-nnm-blue hover:underline">
                                Assign
                              </button>
                              <button onClick={() => handleToggleActive(d.id, !d.active)} className="text-xs font-medium text-slate-500 hover:underline">
                                {d.active ? "Deactivate" : "Activate"}
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
              Transfer {drivers?.find((d) => d.id === transferringId)?.name}
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

      {assigningId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              Assign Asset & Supervisor - {drivers?.find((d) => d.id === assigningId)?.name}
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Any assistants already tied to this driver will automatically inherit the same supervisor.
            </p>
            {assignError && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {assignError}
              </div>
            )}
            <form onSubmit={handleAssignSubmit} className="space-y-4">
              <div>
                <label className={labelClass}>Asset / Vehicle</label>
                <select value={assignAssetId} onChange={(e) => setAssignAssetId(e.target.value)} className={inputClass}>
                  <option value="">None</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} ({ASSET_TYPE_LABELS[a.assetType]}{a.vehicleNumber ? ` - ${a.vehicleNumber}` : ""})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Driver Supervisor</label>
                <select value={assignSupervisorId} onChange={(e) => setAssignSupervisorId(e.target.value)} className={inputClass}>
                  <option value="">None</option>
                  {supervisors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssigningId(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignSubmitting}
                  className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                >
                  {assignSubmitting ? "Saving..." : "Confirm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
