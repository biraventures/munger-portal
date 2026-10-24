"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, PlusCircle, Upload, BookOpen, X, Wrench, Pencil, Trash2, Download, AlertTriangle } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { fetchAttendanceWards, fetchAttendanceUsers, type AttendanceWard, type AttendanceUserSummary } from "@/lib/attendance-api";
import {
  fetchPyaus,
  createPyau,
  updatePyau,
  deletePyau,
  deletePyausByWard,
  deleteAllPyaus,
  uploadPyauCsv,
  setPyauActive,
  fetchPyauContractorWards,
  assignPyauContractorWard,
  fetchPyauIssuesForPyau,
  reportPyauIssue,
  markPyauIssueRepaired,
  type Pyau,
  type PyauContractorWardMapping,
  type PyauIssue,
  type PyauCsvImportResult,
} from "@/lib/pyau-api";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

const STRUCTURE_LABELS: Record<string, string> = { pcc_structure: "PCC Structure", iron_stand: "Iron Stand", nothing: "None" };

const MANAGE_ROLES = ["pyau_je", "pyau_ae", "attendance_admin"];

export default function ManagePyausPage() {
  const user = useAttendanceGuard();
  const canManage = user ? MANAGE_ROLES.includes(user.role) : false;
  const canMarkRepaired = user ? [...MANAGE_ROLES, "pyau_contractor"].includes(user.role) : false;

  const [wards, setWards] = useState<AttendanceWard[]>([]);
  const [contractors, setContractors] = useState<AttendanceUserSummary[]>([]);
  const [pyaus, setPyaus] = useState<Pyau[] | null>(null);
  const [contractorWards, setContractorWards] = useState<PyauContractorWardMapping[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [wardFilter, setWardFilter] = useState("");

  // Create form
  const [wardId, setWardId] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [schemeName, setSchemeName] = useState("");
  const [overheadTankCount, setOverheadTankCount] = useState("0");
  const [housesServed, setHousesServed] = useState("");
  const [structureType, setStructureType] = useState<"" | "pcc_structure" | "iron_stand" | "nothing">("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  // CSV upload
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<PyauCsvImportResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Contractor-ward assignment
  const [assignWardId, setAssignWardId] = useState("");
  const [assignContractorId, setAssignContractorId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Edit modal
  const [editingPyauId, setEditingPyauId] = useState<number | null>(null);
  const [editLocationAddress, setEditLocationAddress] = useState("");
  const [editLatitude, setEditLatitude] = useState("");
  const [editLongitude, setEditLongitude] = useState("");
  const [editSchemeName, setEditSchemeName] = useState("");
  const [editOverheadTankCount, setEditOverheadTankCount] = useState("0");
  const [editHousesServed, setEditHousesServed] = useState("");
  const [editStructureType, setEditStructureType] = useState<"" | "pcc_structure" | "iron_stand" | "nothing">("");
  const [editPumpDetails, setEditPumpDetails] = useState("");
  const [editBoringDepthFeet, setEditBoringDepthFeet] = useState("");
  const [editCasingDetails, setEditCasingDetails] = useState("");
  const [editInstalledDate, setEditInstalledDate] = useState("");
  const [editBuilderName, setEditBuilderName] = useState("");
  const [editBuilderContact, setEditBuilderContact] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteWardBusy, setDeleteWardBusy] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState("");
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Logbook modal
  const [logbookPyauId, setLogbookPyauId] = useState<number | null>(null);
  const [logbookIssues, setLogbookIssues] = useState<PyauIssue[] | null>(null);
  const [logbookError, setLogbookError] = useState<string | null>(null);
  const [issueNotes, setIssueNotes] = useState("");
  const [reportingIssue, setReportingIssue] = useState(false);
  const [repairBrief, setRepairBrief] = useState("");
  const [repairAmount, setRepairAmount] = useState("");
  const [markingRepaired, setMarkingRepaired] = useState<number | null>(null);

  const wardName = (id: number) => wards.find((w) => w.id === id)?.wardName ?? "-";
  const contractorName = (id: number | null) => (id ? contractors.find((c) => c.id === id)?.displayName ?? `#${id}` : "-");

  async function loadPyaus() {
    try {
      setPyaus(await fetchPyaus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load pyau registry.");
    }
  }

  useEffect(() => {
    if (!user) return;
    fetchAttendanceWards().then(setWards).catch(() => setWards([]));
    fetchAttendanceUsers()
      .then((users) => setContractors(users.filter((u) => u.role === "pyau_contractor")))
      .catch(() => setContractors([]));
    fetchPyauContractorWards().then(setContractorWards).catch(() => setContractorWards([]));
    loadPyaus();
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
      await createPyau({
        wardId: Number(wardId),
        locationAddress: locationAddress || null,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
        schemeName: schemeName || null,
        overheadTankCount: Number(overheadTankCount) || 0,
        housesServed: housesServed ? Number(housesServed) : null,
        structureType: structureType || null,
        tankStandType: null,
        pumpDetails: null,
        boringDepthFeet: null,
        casingDetails: null,
        installedDate: null,
        builderName: null,
        builderContact: null,
        remarks: null,
      });
      setCreated(true);
      setLocationAddress("");
      setLatitude("");
      setLongitude("");
      setSchemeName("");
      setOverheadTankCount("0");
      setHousesServed("");
      setStructureType("");
      await loadPyaus();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not add pyau.");
    } finally {
      setCreating(false);
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
      const result = await uploadPyauCsv(text);
      setUploadResult(result);
      await loadPyaus();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleToggleActive(id: number, active: boolean) {
    setError(null);
    try {
      await setPyauActive(id, active);
      await loadPyaus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    }
  }

  async function handleAssignContractor(e: React.FormEvent) {
    e.preventDefault();
    setAssignError(null);
    if (!assignWardId || !assignContractorId) {
      setAssignError("Select both a ward and a contractor.");
      return;
    }
    setAssigning(true);
    try {
      await assignPyauContractorWard(Number(assignWardId), Number(assignContractorId));
      setContractorWards(await fetchPyauContractorWards());
      setAssignWardId("");
      setAssignContractorId("");
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Could not assign contractor.");
    } finally {
      setAssigning(false);
    }
  }

  function openEditModal(p: Pyau) {
    setEditingPyauId(p.id);
    setEditLocationAddress(p.locationAddress ?? "");
    setEditLatitude(p.latitude ?? "");
    setEditLongitude(p.longitude ?? "");
    setEditSchemeName(p.schemeName ?? "");
    setEditOverheadTankCount(String(p.overheadTankCount));
    setEditHousesServed(p.housesServed !== null ? String(p.housesServed) : "");
    setEditStructureType(p.structureType ?? "");
    setEditPumpDetails(p.pumpDetails ?? "");
    setEditBoringDepthFeet(p.boringDepthFeet ?? "");
    setEditCasingDetails(p.casingDetails ?? "");
    setEditInstalledDate(p.installedDate ? p.installedDate.slice(0, 10) : "");
    setEditBuilderName(p.builderName ?? "");
    setEditBuilderContact(p.builderContact ?? "");
    setEditRemarks(p.remarks ?? "");
    setEditError(null);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingPyauId === null) return;
    setEditError(null);
    setEditSubmitting(true);
    try {
      await updatePyau(editingPyauId, {
        locationAddress: editLocationAddress || null,
        latitude: editLatitude ? Number(editLatitude) : null,
        longitude: editLongitude ? Number(editLongitude) : null,
        schemeName: editSchemeName || null,
        overheadTankCount: Number(editOverheadTankCount) || 0,
        housesServed: editHousesServed ? Number(editHousesServed) : null,
        structureType: editStructureType || null,
        pumpDetails: editPumpDetails || null,
        boringDepthFeet: editBoringDepthFeet ? Number(editBoringDepthFeet) : null,
        casingDetails: editCasingDetails || null,
        installedDate: editInstalledDate || null,
        builderName: editBuilderName || null,
        builderContact: editBuilderContact || null,
        remarks: editRemarks || null,
      });
      setEditingPyauId(null);
      await loadPyaus();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDeleteOne(p: Pyau) {
    setDeleteError(null);
    if (!window.confirm(`Permanently delete ${p.serialNumber ?? "this pyau"} and its full maintenance history? This cannot be undone.`)) return;
    setDeletingId(p.id);
    try {
      await deletePyau(p.id);
      await loadPyaus();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete this entry.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteWard() {
    setDeleteError(null);
    if (!wardFilter) {
      setDeleteError("Select a specific ward from the filter above first.");
      return;
    }
    const count = (pyaus ?? []).filter((p) => p.wardId === Number(wardFilter)).length;
    if (!window.confirm(`Permanently delete all ${count} pyau(s) in ${wardName(Number(wardFilter))}, including their maintenance history? This cannot be undone.`))
      return;
    setDeleteWardBusy(true);
    try {
      await deletePyausByWard(Number(wardFilter));
      await loadPyaus();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete this ward's entries.");
    } finally {
      setDeleteWardBusy(false);
    }
  }

  async function handleDeleteAll() {
    setDeleteError(null);
    setDeleteAllBusy(true);
    try {
      await deleteAllPyaus();
      setDeleteAllOpen(false);
      setDeleteAllConfirmText("");
      await loadPyaus();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete the dataset.");
    } finally {
      setDeleteAllBusy(false);
    }
  }

  function handleDownloadCsv() {
    if (!pyaus || pyaus.length === 0) return;
    const headers = [
      "Serial Number",
      "Ward",
      "Location",
      "Scheme",
      "Overhead Tank Count",
      "Houses Served",
      "Structure Type",
      "Functional Status",
      "Under Builder Warranty",
    ];
    const rows = pyaus.map((p) => [
      p.serialNumber ?? "",
      wardName(p.wardId),
      p.locationAddress ?? "",
      p.schemeName ?? "",
      String(p.overheadTankCount),
      p.housesServed !== null ? String(p.housesServed) : "",
      p.structureType ? STRUCTURE_LABELS[p.structureType] : "",
      p.functionalStatus,
      p.underBuilderWarranty ? "Yes" : "No",
    ]);
    const escapeCsvCell = (cell: string) => (cell.includes(",") || cell.includes('"') || cell.includes("\n") ? `"${cell.replace(/"/g, '""')}"` : cell);
    const csvContent = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pyau-registry-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function openLogbook(pyauId: number) {
    setLogbookPyauId(pyauId);
    setLogbookIssues(null);
    setLogbookError(null);
    setIssueNotes("");
    setRepairBrief("");
    setRepairAmount("");
    try {
      const { issues } = await fetchPyauIssuesForPyau(pyauId);
      setLogbookIssues(issues);
    } catch (err) {
      setLogbookError(err instanceof Error ? err.message : "Could not load the maintenance log.");
    }
  }

  async function handleReportIssue(e: React.FormEvent) {
    e.preventDefault();
    if (logbookPyauId === null) return;
    setLogbookError(null);
    setReportingIssue(true);
    try {
      await reportPyauIssue(logbookPyauId, issueNotes || null);
      setIssueNotes("");
      const { issues } = await fetchPyauIssuesForPyau(logbookPyauId);
      setLogbookIssues(issues);
      await loadPyaus();
    } catch (err) {
      setLogbookError(err instanceof Error ? err.message : "Could not report the issue.");
    } finally {
      setReportingIssue(false);
    }
  }

  async function handleMarkRepaired(issueId: number) {
    if (logbookPyauId === null) return;
    setLogbookError(null);
    setMarkingRepaired(issueId);
    try {
      await markPyauIssueRepaired(issueId, repairBrief || null, repairAmount ? Number(repairAmount) : null);
      setRepairBrief("");
      setRepairAmount("");
      const { issues } = await fetchPyauIssuesForPyau(logbookPyauId);
      setLogbookIssues(issues);
      await loadPyaus();
    } catch (err) {
      setLogbookError(err instanceof Error ? err.message : "Could not mark the issue repaired.");
    } finally {
      setMarkingRepaired(null);
    }
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  }

  const visiblePyaus = wardFilter ? (pyaus ?? []).filter((p) => p.wardId === Number(wardFilter)) : pyaus;
  const logbookPyau = pyaus?.find((p) => p.id === logbookPyauId) ?? null;
  const openIssue = logbookIssues?.find((i) => i.status === "open") ?? null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Submersible Pyau Registry</h1>
        <p className="mb-6 text-sm text-slate-500">Ward-wise water kiosk inventory - status, maintenance history, and contractor assignment.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {canManage && (
          <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <PlusCircle className="h-4 w-4" />
              Add One Pyau
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
                Pyau added - serial number generated automatically.
              </div>
            )}
            <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              <div className="sm:col-span-2">
                <label className={labelClass}>Location / Address</label>
                <input value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Latitude</label>
                <input type="number" step="0.000001" value={latitude} onChange={(e) => setLatitude(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Longitude</label>
                <input type="number" step="0.000001" value={longitude} onChange={(e) => setLongitude(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Scheme Name (optional)</label>
                <input value={schemeName} onChange={(e) => setSchemeName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Overhead Tank Count</label>
                <input type="number" min="0" value={overheadTankCount} onChange={(e) => setOverheadTankCount(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Houses Served (via pipeline)</label>
                <input type="number" min="0" value={housesServed} onChange={(e) => setHousesServed(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Structure Type</label>
                <select value={structureType} onChange={(e) => setStructureType(e.target.value as typeof structureType)} className={inputClass}>
                  <option value="">Not specified</option>
                  <option value="pcc_structure">PCC Structure</option>
                  <option value="iron_stand">Iron Stand</option>
                  <option value="nothing">None</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full rounded-md bg-nnm-blue py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60 sm:w-auto sm:px-8"
                >
                  {creating ? "Adding..." : "Add Pyau"}
                </button>
              </div>
            </form>
          </section>
        )}

        {canManage && (
          <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Upload className="h-4 w-4" />
              Bulk Upload (CSV)
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Upload the ward-wise field inventory CSV. Wards not already on file are created automatically, and serial numbers are
              generated automatically per ward. This adds to the registry - it does not replace or deactivate existing entries.
            </p>
            <details className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <summary className="cursor-pointer font-semibold text-slate-700">Expected CSV columns (in this exact order)</summary>
              <ol className="mt-2 list-inside list-decimal space-y-0.5">
                <li>Ward No</li>
                <li>(Number of installed pyau - ward-level summary, ignored per-row)</li>
                <li>Address/Location of Water Kiosk</li>
                <li>Has water tank - a count (0, 1, 2, 3...)</li>
                <li>Pyau status (Working)</li>
                <li>Pyau status (Not working) - free-text reason if not working</li>
                <li>Type of stand - &quot;PCC Structure&quot;, &quot;Iron stand&quot;, or &quot;Nothing&quot;</li>
                <li>Tank Stand of Water Kiosk (Made of Concrete)</li>
                <li>Number of Water Kiosks Without Stand (not imported)</li>
                <li>How many houses get water via line or just stand</li>
                <li>Scheme Name (optional)</li>
                <li>Pump Details (optional)</li>
                <li>Boring Depth in feet (optional, numeric)</li>
                <li>Casing Details (optional)</li>
                <li>Installed Date (optional, format yyyy-mm-dd)</li>
                <li>Builder Name (optional)</li>
                <li>Builder Contact (optional)</li>
                <li>Remarks (optional - combined with any not-working reason from column 6, not replacing it)</li>
                <li>Latitude (optional, numeric)</li>
                <li>Longitude (optional, numeric)</li>
              </ol>
              <p className="mt-2 text-slate-500">
                Columns 1-10 are matched by position, not header name, since the source file&apos;s headers mix Hindi and English
                text. Columns 11-19 are optional additions covering every field the &quot;Add One Pyau&quot; form supports - a file
                without them still imports fine, those fields are just left blank to fill in later. If you add any of them, they
                must be appended in this exact order after column 10, since position is what&apos;s matched, not the column name.
              </p>
            </details>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelected}
              disabled={uploading}
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-nnm-blue file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-nnm-blue-dark disabled:opacity-60"
            />
            {uploading && (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing upload - this may take a moment for large files...
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
                <p className="mb-2 font-semibold text-slate-700">Created {uploadResult.created} pyau(s).</p>
                {uploadResult.errors.length > 0 && (
                  <div>
                    <p className="mb-1 font-semibold text-amber-700">{uploadResult.errors.length} row(s) skipped:</p>
                    <ul className="max-h-32 list-inside list-disc space-y-0.5 overflow-y-auto text-xs text-amber-700">
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

        {canManage && (
          <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Contractor-Ward Assignment</h2>
            <p className="mb-4 text-xs text-slate-500">Each ward is covered by exactly one of the 3 maintenance contractors.</p>
            {assignError && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {assignError}
              </div>
            )}
            <form onSubmit={handleAssignContractor} className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select value={assignWardId} onChange={(e) => setAssignWardId(e.target.value)} className={inputClass}>
                <option value="">Select ward...</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.wardName}
                  </option>
                ))}
              </select>
              <select value={assignContractorId} onChange={(e) => setAssignContractorId(e.target.value)} className={inputClass}>
                <option value="">Select contractor...</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={assigning}
                className="rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
              >
                {assigning ? "Saving..." : "Assign"}
              </button>
            </form>
            <div className="flex flex-wrap gap-2">
              {contractorWards.map((m) => (
                <span key={m.wardId} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600">
                  {wardName(m.wardId)} &rarr; {contractorName(m.contractorId)}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          {deleteError && (
            <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {deleteError}
            </div>
          )}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-700">All Pyaus ({visiblePyaus?.length ?? "..."})</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleDownloadCsv}
                disabled={!pyaus || pyaus.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                Download CSV
              </button>
              <select value={wardFilter} onChange={(e) => setWardFilter(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs">
                <option value="">All wards</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.wardName}
                  </option>
                ))}
              </select>
              {canManage && (
                <button
                  onClick={handleDeleteWard}
                  disabled={!wardFilter || deleteWardBusy}
                  title={!wardFilter ? "Select a ward from the dropdown first" : undefined}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleteWardBusy ? "Deleting..." : "Delete Ward's Entries"}
                </button>
              )}
              {user.role === "attendance_admin" && (
                <button
                  onClick={() => setDeleteAllOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Delete Entire Dataset
                </button>
              )}
            </div>
          </div>
          {!visiblePyaus ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : (
            <div className="max-h-[36rem] overflow-y-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">Serial</th>
                    <th className="px-3 py-2 font-medium">Ward</th>
                    <th className="px-3 py-2 font-medium">Location</th>
                    <th className="px-3 py-2 font-medium">Scheme</th>
                    <th className="px-3 py-2 font-medium">Structure</th>
                    <th className="px-3 py-2 font-medium">Tanks</th>
                    <th className="px-3 py-2 font-medium">Houses Served</th>
                    <th className="px-3 py-2 font-medium">GPS Location</th>
                    <th className="px-3 py-2 font-medium">Remarks</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePyaus.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">{p.serialNumber ?? "-"}</td>
                      <td className="px-3 py-2">{wardName(p.wardId)}</td>
                      <td className="px-3 py-2 max-w-[16rem] truncate text-xs text-slate-500" title={p.locationAddress ?? ""}>
                        {p.locationAddress ?? "-"}
                      </td>
                      <td className="px-3 py-2 max-w-[10rem] truncate text-xs text-slate-500" title={p.schemeName ?? ""}>
                        {p.schemeName ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-xs">{p.structureType ? STRUCTURE_LABELS[p.structureType] : "-"}</td>
                      <td className="px-3 py-2 text-xs">{p.overheadTankCount}</td>
                      <td className="px-3 py-2 text-xs">{p.housesServed ?? "-"}</td>
                      <td className="px-3 py-2 text-xs">
                        {p.latitude && p.longitude ? (
                          <a
                            href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-nnm-blue hover:underline"
                          >
                            {p.latitude}, {p.longitude}
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-[12rem] truncate text-xs text-slate-500" title={p.remarks ?? ""}>
                        {p.remarks ?? "-"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${p.functionalStatus === "functional" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                          >
                            {p.functionalStatus === "functional" ? "Functional" : "Non-Functional"}
                          </span>
                          {p.underBuilderWarranty && (
                            <span className="w-fit rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Builder Warranty</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => openLogbook(p.id)} className="inline-flex items-center gap-1 text-xs font-medium text-nnm-blue hover:underline">
                            <BookOpen className="h-3 w-3" />
                            Logbook
                          </button>
                          {canManage && (
                            <>
                              <button onClick={() => openEditModal(p)} className="inline-flex items-center gap-1 text-xs font-medium text-nnm-blue hover:underline">
                                <Pencil className="h-3 w-3" />
                                Edit
                              </button>
                              <button onClick={() => handleToggleActive(p.id, !p.active)} className="text-xs font-medium text-slate-500 hover:underline">
                                {p.active ? "Deactivate" : "Activate"}
                              </button>
                              <button
                                onClick={() => handleDeleteOne(p)}
                                disabled={deletingId === p.id}
                                className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                              >
                                <Trash2 className="h-3 w-3" />
                                {deletingId === p.id ? "Deleting..." : "Delete"}
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

      {logbookPyauId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Maintenance Log - {logbookPyau?.serialNumber}</h2>
              <button onClick={() => setLogbookPyauId(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            {logbookPyau?.underBuilderWarranty && (
              <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                Under builder warranty - the builder ({logbookPyau.builderName ?? "not recorded"}
                {logbookPyau.builderContact ? `, ${logbookPyau.builderContact}` : ""}) is responsible for maintenance, not a contractor.
              </div>
            )}

            {logbookError && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {logbookError}
              </div>
            )}

            <div className="mb-5 max-h-56 overflow-y-auto rounded-md border border-slate-200">
              {!logbookIssues ? (
                <div className="p-4 text-center text-sm text-slate-400">Loading...</div>
              ) : logbookIssues.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-400">No issues logged yet.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-left uppercase tracking-wide text-slate-500">
                      <th className="px-2.5 py-1.5 font-medium">Date of Issue</th>
                      <th className="px-2.5 py-1.5 font-medium">Date of Repair</th>
                      <th className="px-2.5 py-1.5 font-medium">Brief</th>
                      <th className="px-2.5 py-1.5 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logbookIssues.map((iss) => (
                      <tr key={iss.id} className="border-t border-slate-100">
                        <td className="px-2.5 py-1.5 whitespace-nowrap">{iss.dateOfIssue}</td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap">{iss.dateOfRepair ?? "-"}</td>
                        <td className="px-2.5 py-1.5">
                          {iss.reportedByType === "public" && <span className="mr-1 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-semibold text-nnm-blue">PUBLIC</span>}
                          {iss.issueNotes ?? (iss.repairBrief ? "" : "-")}
                          {iss.repairBrief && <div className="text-green-700">Repair: {iss.repairBrief}</div>}
                        </td>
                        <td className="px-2.5 py-1.5">{iss.amountSpent ? `Rs ${iss.amountSpent}` : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {openIssue && canMarkRepaired && (
              <div className="mb-4 space-y-3 rounded-md border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold text-amber-800">Open issue - mark repaired</p>
                <div>
                  <label className={labelClass}>Repair Brief</label>
                  <input value={repairBrief} onChange={(e) => setRepairBrief(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Amount Spent</label>
                  <input type="number" min="0" step="0.01" value={repairAmount} onChange={(e) => setRepairAmount(e.target.value)} className={inputClass} />
                </div>
                <button
                  onClick={() => handleMarkRepaired(openIssue.id)}
                  disabled={markingRepaired === openIssue.id}
                  className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                >
                  <Wrench className="h-4 w-4" />
                  {markingRepaired === openIssue.id ? "Saving..." : "Mark Repaired"}
                </button>
              </div>
            )}

            {!openIssue && canManage && (
              <form onSubmit={handleReportIssue} className="space-y-3 border-t border-slate-200 pt-4">
                <p className="text-xs font-medium text-slate-600">Report a new issue</p>
                <div>
                  <label className={labelClass}>Notes</label>
                  <textarea value={issueNotes} onChange={(e) => setIssueNotes(e.target.value)} rows={2} className={inputClass} />
                </div>
                <button
                  type="submit"
                  disabled={reportingIssue}
                  className="w-full rounded-md bg-nnm-blue py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                >
                  {reportingIssue ? "Saving..." : "Report Issue"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {editingPyauId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Edit {pyaus?.find((p) => p.id === editingPyauId)?.serialNumber}</h2>
              <button onClick={() => setEditingPyauId(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            {editError && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className={labelClass}>Location / Address</label>
                <input value={editLocationAddress} onChange={(e) => setEditLocationAddress(e.target.value)} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Latitude</label>
                  <input type="number" step="0.000001" value={editLatitude} onChange={(e) => setEditLatitude(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Longitude</label>
                  <input type="number" step="0.000001" value={editLongitude} onChange={(e) => setEditLongitude(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Scheme Name</label>
                  <input value={editSchemeName} onChange={(e) => setEditSchemeName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Structure Type</label>
                  <select value={editStructureType} onChange={(e) => setEditStructureType(e.target.value as typeof editStructureType)} className={inputClass}>
                    <option value="">Not specified</option>
                    <option value="pcc_structure">PCC Structure</option>
                    <option value="iron_stand">Iron Stand</option>
                    <option value="nothing">None</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Overhead Tank Count</label>
                  <input type="number" min="0" value={editOverheadTankCount} onChange={(e) => setEditOverheadTankCount(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Houses Served</label>
                  <input type="number" min="0" value={editHousesServed} onChange={(e) => setEditHousesServed(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Pump Details</label>
                  <input value={editPumpDetails} onChange={(e) => setEditPumpDetails(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Boring Depth (feet)</label>
                  <input type="number" min="0" step="0.1" value={editBoringDepthFeet} onChange={(e) => setEditBoringDepthFeet(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Casing Details</label>
                  <input value={editCasingDetails} onChange={(e) => setEditCasingDetails(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Installed Date</label>
                  <input type="date" value={editInstalledDate} onChange={(e) => setEditInstalledDate(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Builder Name</label>
                  <input value={editBuilderName} onChange={(e) => setEditBuilderName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Builder Contact</label>
                  <input value={editBuilderContact} onChange={(e) => setEditBuilderContact(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Remarks</label>
                <textarea value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} rows={2} className={inputClass} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPyauId(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                >
                  {editSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteAllOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border-2 border-red-300 bg-white p-6 shadow-lg">
            <div className="mb-3 flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              <h2 className="text-sm font-semibold">Delete the Entire Pyau Dataset</h2>
            </div>
            <p className="mb-4 text-sm text-slate-600">
              This permanently deletes <strong>every pyau across every ward</strong>, including all maintenance history. This cannot
              be undone. To confirm, type <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">DELETE ALL PYAU DATA</code> below.
            </p>
            <input
              value={deleteAllConfirmText}
              onChange={(e) => setDeleteAllConfirmText(e.target.value)}
              placeholder="Type the confirmation phrase"
              className={inputClass}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeleteAllOpen(false);
                  setDeleteAllConfirmText("");
                }}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAll}
                disabled={deleteAllConfirmText !== "DELETE ALL PYAU DATA" || deleteAllBusy}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {deleteAllBusy ? "Deleting..." : "Permanently Delete Everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
