"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, PlusCircle, Upload, Lightbulb } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { fetchAttendanceWards, type AttendanceWard } from "@/lib/attendance-api";
import {
  fetchLights,
  createLight,
  setLightActive,
  uploadHighMastBulkCsv,
  fetchInstallationAgencies,
  createInstallationAgency,
  setInstallationAgencyActive,
  type StreetLight,
  type InstallationAgency,
  type HighMastBulkImportResult,
  FUNCTIONAL_STATUS_LABELS,
} from "@/lib/streetlight-api";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

const SWITCH_LABELS: Record<string, string> = { working: "Working", not_working: "Not Working", automatic: "Automatic", joint: "Joint" };

const MANAGE_ROLES = [
  "streetlight_nodal_clerk",
  "streetlight_ae",
  "streetlight_je",
  "city_manager",
  "municipal_commissioner",
  "deputy_municipal_commissioner",
  "attendance_admin",
];

export default function ManageLightsPage() {
  const user = useAttendanceGuard();
  const canManage = user ? MANAGE_ROLES.includes(user.role) : false;
  const isMC = user?.role === "municipal_commissioner" || user?.role === "attendance_admin";

  const [wards, setWards] = useState<AttendanceWard[]>([]);
  const [agencies, setAgencies] = useState<InstallationAgency[]>([]);
  const [lights, setLights] = useState<StreetLight[] | null>(null);
  const [wardFilter, setWardFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Create form - this entry system is High Mast only; street lights are added exclusively through the street-wise system.
  const lightType = "high_mast" as const;
  const [wardId, setWardId] = useState("");
  const [localityName, setLocalityName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [installationAgencyId, setInstallationAgencyId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  // CSV upload

  // High Mast summary CSV upload (no serial number column - see uploadHighMastBulkCsv)
  const [hmUploading, setHmUploading] = useState(false);
  const [hmUploadResult, setHmUploadResult] = useState<HighMastBulkImportResult | null>(null);
  const [hmUploadError, setHmUploadError] = useState<string | null>(null);

  // Agency management (MC only)
  const [newAgencyName, setNewAgencyName] = useState("");
  const [addingAgency, setAddingAgency] = useState(false);
  const [agencyError, setAgencyError] = useState<string | null>(null);

  const wardName = (id: number) => wards.find((w) => w.id === id)?.wardName ?? "-";
  const agencyName = (id: number | null) => (id ? agencies.find((a) => a.id === id)?.agencyName ?? `#${id}` : "-");

  async function loadLights() {
    try {
      setLights(await fetchLights());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the light registry.");
    }
  }

  useEffect(() => {
    if (!user) return;
    fetchAttendanceWards().then(setWards).catch(() => setWards([]));
    fetchInstallationAgencies().then(setAgencies).catch(() => setAgencies([]));
    loadLights();
  }, [user]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreated(false);
    if (!wardId || !serialNumber || !latitude || !longitude) {
      setCreateError("Ward, serial number, and GPS coordinates are required.");
      return;
    }
    setCreating(true);
    try {
      await createLight({
        lightType,
        wardId: Number(wardId),
        localityName,
        serialNumber,
        latitude: Number(latitude),
        longitude: Number(longitude),
        installationAgencyId: installationAgencyId ? Number(installationAgencyId) : null,
      });
      setCreated(true);
      setLocalityName("");
      setSerialNumber("");
      setLatitude("");
      setLongitude("");
      setInstallationAgencyId("");
      await loadLights();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not add light.");
    } finally {
      setCreating(false);
    }
  }

  async function handleHmFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setHmUploading(true);
    setHmUploadError(null);
    setHmUploadResult(null);
    try {
      const text = await file.text();
      const result = await uploadHighMastBulkCsv(text);
      setHmUploadResult(result);
      // New agencies / wards may have been added by the upload.
      const [a, w] = await Promise.all([fetchInstallationAgencies().catch(() => null), fetchAttendanceWards().catch(() => null)]);
      if (a) setAgencies(a);
      if (w) setWards(w);
      await loadLights();
    } catch (err) {
      setHmUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setHmUploading(false);
      e.target.value = "";
    }
  }

  async function handleToggleActive(id: number, active: boolean) {
    setError(null);
    try {
      await setLightActive(id, active);
      await loadLights();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    }
  }

  async function handleAddAgency(e: React.FormEvent) {
    e.preventDefault();
    setAgencyError(null);
    if (!newAgencyName.trim()) return;
    setAddingAgency(true);
    try {
      await createInstallationAgency(newAgencyName.trim());
      setNewAgencyName("");
      setAgencies(await fetchInstallationAgencies());
    } catch (err) {
      setAgencyError(err instanceof Error ? err.message : "Could not add agency.");
    } finally {
      setAddingAgency(false);
    }
  }

  async function handleToggleAgencyActive(id: number, active: boolean) {
    setAgencyError(null);
    try {
      await setInstallationAgencyActive(id, active);
      setAgencies(await fetchInstallationAgencies());
    } catch (err) {
      setAgencyError(err instanceof Error ? err.message : "Could not update agency status.");
    }
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  }

  const visibleLights = (lights ?? [])
    .filter((l) => l.lightType === "high_mast")
    .filter((l) => !wardFilter || l.wardId === Number(wardFilter));

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">High Mast Light Entry</h1>
        <p className="mb-6 text-sm text-slate-500">
          Ward-wise High Mast light inventory - serial number, location, and installation agency. Street lights are added through the street-wise
          system instead.
        </p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {isMC && (
          <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Installation Agencies</h2>
            {agencyError && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {agencyError}
              </div>
            )}
            <form onSubmit={handleAddAgency} className="mb-4 flex gap-3">
              <input value={newAgencyName} onChange={(e) => setNewAgencyName(e.target.value)} placeholder="Agency name" className={inputClass} />
              <button
                type="submit"
                disabled={addingAgency}
                className="whitespace-nowrap rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
              >
                {addingAgency ? "Adding..." : "Add Agency"}
              </button>
            </form>
            <div className="flex flex-wrap gap-2">
              {agencies.map((a) => (
                <span
                  key={a.id}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${a.active ? "border-slate-200 text-slate-700" : "border-slate-100 text-slate-400"}`}
                >
                  {a.agencyName}
                  <button onClick={() => handleToggleAgencyActive(a.id, !a.active)} className="font-medium text-nnm-blue hover:underline">
                    {a.active ? "Deactivate" : "Activate"}
                  </button>
                </span>
              ))}
            </div>
          </section>
        )}

        {canManage && (
          <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <PlusCircle className="h-4 w-4" />
              Add One High Mast Light
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
                Light added.
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
              <div>
                <label className={labelClass}>Serial Number</label>
                <input required value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Lane / Locality</label>
                <input value={localityName} onChange={(e) => setLocalityName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Installation Agency</label>
                <select value={installationAgencyId} onChange={(e) => setInstallationAgencyId(e.target.value)} className={inputClass}>
                  <option value="">Not specified</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.agencyName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Latitude</label>
                <input required type="number" step="0.000001" value={latitude} onChange={(e) => setLatitude(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Longitude</label>
                <input required type="number" step="0.000001" value={longitude} onChange={(e) => setLongitude(e.target.value)} className={inputClass} />
              </div>
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full rounded-md bg-nnm-blue py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60 sm:w-auto sm:px-8"
                >
                  {creating ? "Adding..." : "Add Light"}
                </button>
              </div>
            </form>
          </section>
        )}

        {canManage && (
          <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Upload className="h-4 w-4" />
              Bulk Upload - High Mast (CSV)
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Upload the High Mast survey sheet (CSV). Only the ward is needed - GPS and every other column may be blank. Wards are
              matched by number (&quot;Ward 38&quot; = ward 38); installation and maintenance agencies not on file are added. A tower
              marked &quot;Not Functional&quot; gets an open fault. Uploading the sheet again updates the towers already imported (same
              ward and location) instead of adding them twice; a blank cell keeps what is on file.
            </p>
            <details className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <summary className="cursor-pointer font-semibold text-slate-700">Expected CSV columns (matched by header name)</summary>
              <ul className="mt-2 list-inside list-disc space-y-0.5">
                <li>Sl No (ignored - a serial number is generated instead)</li>
                <li>Ward (required) - &quot;Ward 38&quot;, &quot;38&quot; etc.</li>
                <li>Location name</li>
                <li>Installed by Agency name</li>
                <li>No of lights - how many lamps are mounted on this tower</li>
                <li>Functional status - Functional / Partially Functional / Not Functional</li>
                <li>Number of functional lamps (blank: all lamps for a functional tower, none for a not functional one)</li>
                <li>Panel - OK / Not OK</li>
                <li>Switch - OK / Not OK / Automatic / Joint</li>
                <li>Maintenance agency</li>
                <li>Latitude, Longitude (optional - can be added later from the High Mast dashboard)</li>
                <li>Remarks</li>
              </ul>
              <p className="mt-2 text-slate-500">Header names are matched flexibly (spelling / spacing variants such as &quot;Lattitude&quot; are recognized), not by position.</p>
            </details>
            <input
              type="file"
              accept=".csv"
              onChange={handleHmFileSelected}
              disabled={hmUploading}
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-nnm-blue file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-nnm-blue-dark disabled:opacity-60"
            />
            {hmUploading && (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing upload - this may take a moment for large files...
              </div>
            )}
            {hmUploadError && (
              <div role="alert" className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {hmUploadError}
              </div>
            )}
            {hmUploadResult && (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="mb-2 font-semibold text-slate-700">
                  Added {hmUploadResult.created} new High Mast(s){hmUploadResult.updated ? `; updated ${hmUploadResult.updated} already on file` : ""}.
                </p>
                {hmUploadResult.newAgencies?.length > 0 && <p className="mb-2 text-xs text-slate-600">New agencies added: {hmUploadResult.newAgencies.join(", ")}</p>}
                {hmUploadResult.notes?.length > 0 && (
                  <details className="mb-2 text-xs text-slate-600">
                    <summary className="cursor-pointer">{hmUploadResult.notes.length} note(s) - imported with something left blank</summary>
                    <ul className="mt-1 max-h-32 list-inside list-disc space-y-0.5 overflow-y-auto">
                      {hmUploadResult.notes.map((n, i) => (
                        <li key={i}>
                          Row {n.row}: {n.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {hmUploadResult.errors.length > 0 && (
                  <div>
                    <p className="mb-1 font-semibold text-amber-700">{hmUploadResult.errors.length} row(s) skipped:</p>
                    <ul className="max-h-32 list-inside list-disc space-y-0.5 overflow-y-auto text-xs text-amber-700">
                      {hmUploadResult.errors.map((e, i) => (
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
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-700">
              <Lightbulb className="mr-1 inline h-4 w-4" />
              High Mast Lights ({visibleLights.length})
            </h2>
            <div className="flex gap-2">
              <select value={wardFilter} onChange={(e) => setWardFilter(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs">
                <option value="">All wards</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.wardName}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!lights ? (
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
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Ward</th>
                    <th className="px-3 py-2 font-medium">Locality</th>
                    <th className="px-3 py-2 font-medium">Agency</th>
                    <th className="px-3 py-2 font-medium">Maint. Agency</th>
                    <th className="px-3 py-2 font-medium"># Lights</th>
                    <th className="px-3 py-2 font-medium"># Functional</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Panel</th>
                    <th className="px-3 py-2 font-medium">Switch</th>
                    <th className="px-3 py-2 font-medium">GPS</th>
                    <th className="px-3 py-2 font-medium">Remarks</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLights.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">{l.serialNumber}</td>
                      <td className="px-3 py-2 text-xs">{l.lightType === "high_mast" ? "High Mast" : "Street Light"}</td>
                      <td className="px-3 py-2">{wardName(l.wardId)}</td>
                      <td className="px-3 py-2 max-w-[12rem] truncate text-xs text-slate-500" title={l.localityName}>
                        {l.localityName || "-"}
                      </td>
                      <td className="px-3 py-2 text-xs">{agencyName(l.installationAgencyId)}</td>
                      <td className="px-3 py-2 text-xs">{agencyName(l.maintenanceAgencyId)}</td>
                      <td className="px-3 py-2 text-xs">{l.noOfLights ?? "-"}</td>
                      <td className="px-3 py-2 text-xs">{l.noOfFunctionalLights ?? "-"}</td>
                      <td className="px-3 py-2 text-xs">{l.functionalStatus ? FUNCTIONAL_STATUS_LABELS[l.functionalStatus] : "-"}</td>
                      <td className="px-3 py-2 text-xs">{l.panelStatus ? SWITCH_LABELS[l.panelStatus] : "-"}</td>
                      <td className="px-3 py-2 text-xs">{l.switchStatus ? SWITCH_LABELS[l.switchStatus] : "-"}</td>
                      <td className="px-3 py-2 text-xs">{l.latitude && l.longitude ? "✓" : <span className="text-amber-600">missing</span>}</td>
                      <td className="px-3 py-2 max-w-[10rem] truncate text-xs text-slate-500" title={l.remarks ?? undefined}>
                        {l.remarks || "-"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canManage && (
                          <button onClick={() => handleToggleActive(l.id, !l.active)} className="text-xs font-medium text-slate-500 hover:underline">
                            {l.active ? "Deactivate" : "Activate"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
