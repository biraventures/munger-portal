"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, PlusCircle, Wrench, BookOpen, X, Pencil } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import {
  fetchAttendanceWards,
  fetchAllAssets,
  createAsset,
  setAssetActive,
  updateAssetDetails,
  fetchAssetMaintenanceLog,
  logAssetMaintenance,
  setAssetTrackingType,
  fetchAssetLogbook,
  logAssetReading,
  type AttendanceWard,
  type AssetSummary,
  type AssetMaintenanceLogEntry,
  type AssetLogbookEntry,
} from "@/lib/attendance-api";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

const ASSET_TYPE_LABELS: Record<AssetSummary["assetType"], string> = {
  vehicle: "Vehicle",
  tricycle: "Tricycle",
  hand_cart: "Hand Cart",
};

const STATUS_STYLES: Record<AssetSummary["currentStatus"], string> = {
  working: "bg-green-100 text-green-700",
  under_repair: "bg-amber-100 text-amber-700",
  not_working: "bg-red-100 text-red-700",
};

const EDIT_ROLES = ["attendance_admin", "junior_engineer", "assistant_engineer_mechanical", "maintenance_nodal_clerk"];

export default function ManageAssetsPage() {
  const user = useAttendanceGuard();
  const canEdit = user ? EDIT_ROLES.includes(user.role) : false;

  const [wards, setWards] = useState<AttendanceWard[]>([]);
  const [assets, setAssets] = useState<AssetSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [assetType, setAssetType] = useState<AssetSummary["assetType"]>("vehicle");
  const [label, setLabel] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [chassisNumber, setChassisNumber] = useState("");
  const [trackingType, setTrackingType] = useState<"" | "km" | "hours">("");
  const [selectedWardIds, setSelectedWardIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const [logAssetId, setLogAssetId] = useState<number | null>(null);
  const [logEntries, setLogEntries] = useState<AssetMaintenanceLogEntry[] | null>(null);
  const [logType, setLogType] = useState<AssetMaintenanceLogEntry["logType"]>("service");
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [logNotes, setLogNotes] = useState("");
  const [alsoUpdateStatus, setAlsoUpdateStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<AssetSummary["currentStatus"]>("working");

  const [editAssetId, setEditAssetId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    assetType: "vehicle" as AssetSummary["assetType"],
    label: "",
    vehicleNumber: "",
    chassisNumber: "",
    registrationNumber: "",
    engineNumber: "",
    manufacturer: "",
    model: "",
    variant: "",
    yearOfManufacture: "",
    owner: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const [logbookAssetId, setLogbookAssetId] = useState<number | null>(null);
  const [logbookData, setLogbookData] = useState<{ trackingType: "km" | "hours" | null; entries: AssetLogbookEntry[] } | null>(null);
  const [logbookError, setLogbookError] = useState<string | null>(null);
  const [readingDate, setReadingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [readingValue, setReadingValue] = useState("");
  const [readingNotes, setReadingNotes] = useState("");
  const [readingSubmitting, setReadingSubmitting] = useState(false);
  const [readingError, setReadingError] = useState<string | null>(null);
  const [pendingTrackingType, setPendingTrackingType] = useState<"km" | "hours">("km");
  const [settingTrackingType, setSettingTrackingType] = useState(false);

  const wardName = (id: number) => wards.find((w) => w.id === id)?.wardName ?? "-";

  async function loadAssets() {
    try {
      setAssets(await fetchAllAssets());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load asset list.");
    }
  }

  useEffect(() => {
    if (!user) return;
    fetchAttendanceWards()
      .then(setWards)
      .catch(() => setWards([]));
    loadAssets();
  }, [user]);

  function toggleWard(id: number) {
    setSelectedWardIds((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreated(false);
    setCreating(true);
    try {
      await createAsset({
        assetType,
        label,
        vehicleNumber: vehicleNumber || null,
        chassisNumber: chassisNumber || null,
        trackingType: trackingType || null,
        wardIds: selectedWardIds,
      });
      setCreated(true);
      setLabel("");
      setVehicleNumber("");
      setChassisNumber("");
      setTrackingType("");
      setSelectedWardIds([]);
      await loadAssets();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not add asset.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(id: number, active: boolean) {
    setError(null);
    try {
      await setAssetActive(id, active);
      await loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    }
  }

  function openEdit(asset: AssetSummary) {
    setEditAssetId(asset.id);
    setEditForm({
      assetType: asset.assetType,
      label: asset.label,
      vehicleNumber: asset.vehicleNumber ?? "",
      chassisNumber: asset.chassisNumber ?? "",
      registrationNumber: asset.registrationNumber ?? "",
      engineNumber: asset.engineNumber ?? "",
      manufacturer: asset.manufacturer ?? "",
      model: asset.model ?? "",
      variant: asset.variant ?? "",
      yearOfManufacture: asset.yearOfManufacture ? String(asset.yearOfManufacture) : "",
      owner: asset.owner ?? "",
    });
    setEditError(null);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editAssetId === null) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await updateAssetDetails(editAssetId, {
        assetType: editForm.assetType,
        label: editForm.label.trim(),
        vehicleNumber: editForm.vehicleNumber.trim() || null,
        chassisNumber: editForm.chassisNumber.trim() || null,
        registrationNumber: editForm.registrationNumber.trim() || null,
        engineNumber: editForm.engineNumber.trim() || null,
        manufacturer: editForm.manufacturer.trim() || null,
        model: editForm.model.trim() || null,
        variant: editForm.variant.trim() || null,
        yearOfManufacture: editForm.yearOfManufacture.trim() ? Number(editForm.yearOfManufacture) : null,
        owner: editForm.owner.trim() || null,
      });
      setEditAssetId(null);
      await loadAssets();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not save these changes.");
    } finally {
      setEditSaving(false);
    }
  }

  async function openMaintenanceLog(assetId: number) {
    setLogAssetId(assetId);
    setLogEntries(null);
    setLogError(null);
    setLogNotes("");
    setAlsoUpdateStatus(false);
    try {
      setLogEntries(await fetchAssetMaintenanceLog(assetId));
    } catch (err) {
      setLogError(err instanceof Error ? err.message : "Could not load maintenance history.");
    }
  }

  async function handleLogSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (logAssetId === null) return;
    setLogError(null);
    setLogSubmitting(true);
    try {
      await logAssetMaintenance(logAssetId, {
        logType,
        logDate,
        notes: logNotes || null,
        updateStatus: alsoUpdateStatus
          ? { currentStatus: newStatus, notWorkingSince: newStatus === "not_working" ? logDate : null, soundSystemStatus: null, batteryStatus: null }
          : null,
      });
      setLogNotes("");
      setLogEntries(await fetchAssetMaintenanceLog(logAssetId));
      await loadAssets();
    } catch (err) {
      setLogError(err instanceof Error ? err.message : "Could not log entry.");
    } finally {
      setLogSubmitting(false);
    }
  }

  async function openLogbook(assetId: number) {
    setLogbookAssetId(assetId);
    setLogbookData(null);
    setLogbookError(null);
    setReadingValue("");
    setReadingNotes("");
    setReadingError(null);
    setPendingTrackingType("km");
    try {
      setLogbookData(await fetchAssetLogbook(assetId));
    } catch (err) {
      setLogbookError(err instanceof Error ? err.message : "Could not load the logbook.");
    }
  }

  async function handleSetTrackingType() {
    if (logbookAssetId === null) return;
    setSettingTrackingType(true);
    setLogbookError(null);
    try {
      await setAssetTrackingType(logbookAssetId, pendingTrackingType);
      setLogbookData(await fetchAssetLogbook(logbookAssetId));
      await loadAssets();
    } catch (err) {
      setLogbookError(err instanceof Error ? err.message : "Could not set tracking type.");
    } finally {
      setSettingTrackingType(false);
    }
  }

  async function handleReadingSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (logbookAssetId === null) return;
    setReadingError(null);
    if (!readingValue) {
      setReadingError("Enter a reading.");
      return;
    }
    setReadingSubmitting(true);
    try {
      await logAssetReading(logbookAssetId, { logDate: readingDate, reading: Number(readingValue), notes: readingNotes || null });
      setReadingValue("");
      setReadingNotes("");
      setLogbookData(await fetchAssetLogbook(logbookAssetId));
      await loadAssets();
    } catch (err) {
      setReadingError(err instanceof Error ? err.message : "Could not log the reading.");
    } finally {
      setReadingSubmitting(false);
    }
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  }

  const loggingAsset = assets?.find((a) => a.id === logAssetId) ?? null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Fleet & Asset Registry</h1>
        <p className="mb-6 text-sm text-slate-500">Vehicles, tricycles, and hand carts - status, maintenance history, and ward assignment.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {canEdit && (
          <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <PlusCircle className="h-4 w-4" />
              Add Asset
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
                Asset added.
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelClass}>Type</label>
                  <select value={assetType} onChange={(e) => setAssetType(e.target.value as AssetSummary["assetType"])} className={inputClass}>
                    <option value="vehicle">Vehicle</option>
                    <option value="tricycle">Tricycle</option>
                    <option value="hand_cart">Hand Cart</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Label</label>
                  <input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Dumper 1" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Vehicle Number</label>
                  <input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Chassis Number</label>
                  <input value={chassisNumber} onChange={(e) => setChassisNumber(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Logbook Tracking (optional)</label>
                  <select value={trackingType} onChange={(e) => setTrackingType(e.target.value as "" | "km" | "hours")} className={inputClass}>
                    <option value="">None</option>
                    <option value="km">Kilometers (odometer)</option>
                    <option value="hours">Hours (hour-meter)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelClass}>Wards this asset regularly serves</label>
                <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 p-3">
                  {wards.map((w) => (
                    <label key={w.id} className="flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs">
                      <input type="checkbox" checked={selectedWardIds.includes(w.id)} onChange={() => toggleWard(w.id)} />
                      {w.wardName}
                    </label>
                  ))}
                </div>
              </div>
              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-md bg-nnm-blue py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60 sm:w-auto sm:px-8"
              >
                {creating ? "Adding..." : "Add Asset"}
              </button>
            </form>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">All Assets ({assets?.length ?? "..."})</h2>
          {!assets ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : (
            <div className="max-h-[32rem] overflow-y-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">Label</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Vehicle No</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Wards</th>
                    <th className="px-3 py-2 font-medium">Last Serviced</th>
                    <th className="px-3 py-2 font-medium">Last Repaired</th>
                    <th className="px-3 py-2 font-medium">Latest Reading</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-medium text-slate-800">{a.label}</td>
                      <td className="px-3 py-2">{ASSET_TYPE_LABELS[a.assetType]}</td>
                      <td className="px-3 py-2 font-mono text-xs">{a.vehicleNumber ?? "-"}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[a.currentStatus]}`}>
                          {a.currentStatus.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{a.wardIds.map(wardName).join(", ") || "-"}</td>
                      <td className="px-3 py-2 text-xs">{a.lastServicedOn ? a.lastServicedOn.slice(0, 10) : "-"}</td>
                      <td className="px-3 py-2 text-xs">{a.lastRepairedOn ? a.lastRepairedOn.slice(0, 10) : "-"}</td>
                      <td className="px-3 py-2 text-xs">
                        {a.latestLogbookReading
                          ? `${a.latestLogbookReading.reading} ${a.trackingType} (${a.latestLogbookReading.logDate.slice(0, 10)})`
                          : "-"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => openLogbook(a.id)} className="inline-flex items-center gap-1 text-xs font-medium text-nnm-blue hover:underline">
                            <BookOpen className="h-3 w-3" />
                            Logbook
                          </button>
                          <button onClick={() => openMaintenanceLog(a.id)} className="inline-flex items-center gap-1 text-xs font-medium text-nnm-blue hover:underline">
                            <Wrench className="h-3 w-3" />
                            Log
                          </button>
                          {canEdit && (
                            <button onClick={() => openEdit(a)} className="inline-flex items-center gap-1 text-xs font-medium text-nnm-blue hover:underline">
                              <Pencil className="h-3 w-3" />
                              Edit
                            </button>
                          )}
                          {canEdit && (
                            <button onClick={() => handleToggleActive(a.id, !a.active)} className="text-xs font-medium text-slate-500 hover:underline">
                              {a.active ? "Deactivate" : "Activate"}
                            </button>
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

      {logAssetId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Maintenance Log - {loggingAsset?.label}</h2>
              <button onClick={() => setLogAssetId(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            {logError && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {logError}
              </div>
            )}

            <div className="mb-5 max-h-48 overflow-y-auto rounded-md border border-slate-200">
              {!logEntries ? (
                <div className="p-4 text-center text-sm text-slate-400">Loading...</div>
              ) : logEntries.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-400">No history yet.</div>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {logEntries.map((l) => (
                      <tr key={l.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-2.5 py-1.5 whitespace-nowrap">{l.logDate.slice(0, 10)}</td>
                        <td className="px-2.5 py-1.5 font-medium capitalize">{l.logType.replace("_", " ")}</td>
                        <td className="px-2.5 py-1.5 text-slate-500">{l.notes ?? "-"}</td>
                        <td className="px-2.5 py-1.5 text-slate-400">{l.loggedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {canEdit && (
              <form onSubmit={handleLogSubmit} className="space-y-3 border-t border-slate-200 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Type</label>
                    <select value={logType} onChange={(e) => setLogType(e.target.value as AssetMaintenanceLogEntry["logType"])} className={inputClass}>
                      <option value="service">Service</option>
                      <option value="repair">Repair</option>
                      <option value="status_update">Status Update</option>
                      <option value="note">Note</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Date</label>
                    <input required type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Notes</label>
                  <textarea value={logNotes} onChange={(e) => setLogNotes(e.target.value)} rows={2} className={inputClass} />
                </div>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <input type="checkbox" checked={alsoUpdateStatus} onChange={(e) => setAlsoUpdateStatus(e.target.checked)} />
                  Also update current status
                </label>
                {alsoUpdateStatus && (
                  <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as AssetSummary["currentStatus"])} className={inputClass}>
                    <option value="working">Working</option>
                    <option value="under_repair">Under Repair</option>
                    <option value="not_working">Not Working</option>
                  </select>
                )}
                <button
                  type="submit"
                  disabled={logSubmitting}
                  className="w-full rounded-md bg-nnm-blue py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                >
                  {logSubmitting ? "Saving..." : "Add Log Entry"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {logbookAssetId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">
                Daily Logbook - {assets?.find((a) => a.id === logbookAssetId)?.label}
              </h2>
              <button onClick={() => setLogbookAssetId(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            {logbookError && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {logbookError}
              </div>
            )}

            {!logbookData ? (
              <div className="py-4 text-center text-sm text-slate-400">Loading...</div>
            ) : !logbookData.trackingType ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                <p className="mb-3 text-sm text-amber-800">
                  No tracking type set for this asset yet - choose whether it&apos;s tracked by odometer distance or engine hours
                  before logging daily readings.
                </p>
                <div className="flex items-center gap-3">
                  <select value={pendingTrackingType} onChange={(e) => setPendingTrackingType(e.target.value as "km" | "hours")} className={inputClass}>
                    <option value="km">Kilometers (odometer)</option>
                    <option value="hours">Hours (hour-meter)</option>
                  </select>
                  <button
                    onClick={handleSetTrackingType}
                    disabled={settingTrackingType}
                    className="whitespace-nowrap rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                  >
                    {settingTrackingType ? "Saving..." : "Set"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-5 max-h-56 overflow-y-auto rounded-md border border-slate-200">
                  {logbookData.entries.length === 0 ? (
                    <div className="p-4 text-center text-sm text-slate-400">No readings recorded yet.</div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr className="text-left uppercase tracking-wide text-slate-500">
                          <th className="px-2.5 py-1.5 font-medium">Date</th>
                          <th className="px-2.5 py-1.5 font-medium">Reading</th>
                          <th className="px-2.5 py-1.5 font-medium">{logbookData.trackingType === "km" ? "Distance Covered" : "Hours Run"}</th>
                          <th className="px-2.5 py-1.5 font-medium">By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logbookData.entries.map((e) => (
                          <tr key={e.id} className="border-t border-slate-100">
                            <td className="px-2.5 py-1.5 whitespace-nowrap">{e.logDate.slice(0, 10)}</td>
                            <td className="px-2.5 py-1.5">
                              {e.reading} {logbookData.trackingType}
                            </td>
                            <td className="px-2.5 py-1.5">{e.delta !== null ? `${e.delta} ${logbookData.trackingType}` : "-"}</td>
                            <td className="px-2.5 py-1.5 text-slate-400">{e.recordedBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <form onSubmit={handleReadingSubmit} className="space-y-3 border-t border-slate-200 pt-4">
                  <p className="text-xs font-medium text-slate-600">
                    Add today&apos;s reading ({logbookData.trackingType === "km" ? "odometer, in km" : "hour-meter, in hours"})
                  </p>
                  {readingError && (
                    <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {readingError}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Date</label>
                      <input required type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Reading ({logbookData.trackingType})</label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        min="0"
                        value={readingValue}
                        onChange={(e) => setReadingValue(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Notes (optional)</label>
                    <input value={readingNotes} onChange={(e) => setReadingNotes(e.target.value)} className={inputClass} />
                  </div>
                  <button
                    type="submit"
                    disabled={readingSubmitting}
                    className="w-full rounded-md bg-nnm-blue py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                  >
                    {readingSubmitting ? "Saving..." : "Add Reading"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {editAssetId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Edit Vehicle/Machine Details</h2>
              <button onClick={() => setEditAssetId(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            {editError && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Type</label>
                  <select
                    value={editForm.assetType}
                    onChange={(e) => setEditForm((f) => ({ ...f, assetType: e.target.value as AssetSummary["assetType"] }))}
                    className={inputClass}
                  >
                    <option value="vehicle">Vehicle</option>
                    <option value="tricycle">Tricycle</option>
                    <option value="hand_cart">Hand Cart</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Label / Name</label>
                  <input required value={editForm.label} onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))} className={inputClass} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Vehicle No</label>
                  <input value={editForm.vehicleNumber} onChange={(e) => setEditForm((f) => ({ ...f, vehicleNumber: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Chassis No</label>
                  <input value={editForm.chassisNumber} onChange={(e) => setEditForm((f) => ({ ...f, chassisNumber: e.target.value }))} className={inputClass} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Registration No</label>
                  <input value={editForm.registrationNumber} onChange={(e) => setEditForm((f) => ({ ...f, registrationNumber: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Engine No</label>
                  <input value={editForm.engineNumber} onChange={(e) => setEditForm((f) => ({ ...f, engineNumber: e.target.value }))} className={inputClass} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Manufacturer</label>
                  <input value={editForm.manufacturer} onChange={(e) => setEditForm((f) => ({ ...f, manufacturer: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Model</label>
                  <input value={editForm.model} onChange={(e) => setEditForm((f) => ({ ...f, model: e.target.value }))} className={inputClass} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Variant</label>
                  <input value={editForm.variant} onChange={(e) => setEditForm((f) => ({ ...f, variant: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Year of Manufacture</label>
                  <input
                    type="number"
                    min="1900"
                    max="2100"
                    value={editForm.yearOfManufacture}
                    onChange={(e) => setEditForm((f) => ({ ...f, yearOfManufacture: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Owner</label>
                <input value={editForm.owner} onChange={(e) => setEditForm((f) => ({ ...f, owner: e.target.value }))} className={inputClass} />
              </div>

              <button
                type="submit"
                disabled={editSaving}
                className="w-full rounded-md bg-nnm-blue py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
              >
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
