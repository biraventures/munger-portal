"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileText, Loader2, Plus, Trash2, X } from "lucide-react";
import { AuthPhoto } from "@/components/admin/field-verification-photos";
import { LiveCameraCapture, type CapturedPhoto } from "@/components/admin/live-camera-capture";
import { fileToBase64 } from "@/components/admin/discrepancy-capture-section";
import { shrinkPhotoFile } from "@/lib/upload-limits";
import {
  AUDIT_ACTION_LABELS,
  STRUCTURE_LABELS,
  addAgency,
  addRepairItem,
  createPyau,
  fetchHistory,
  fetchRepair,
  markRepaired,
  openApplication,
  removeRepairItem,
  reportFault,
  rupees,
  updatePyau,
  uploadApplication,
  type AuditEvent,
  type FilePayload,
  type Option,
  type PyauDetails,
  type PyauRecord,
  type Repair,
  type StructureType,
  type WardSummary,
} from "@/lib/pyau-officer-api";

export const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";
const btn = "rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60";
const btnGhost = "rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50";

export function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
const fmtDate = (d: string | null | undefined) =>
  d
    ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "-";
const fmtWhen = (d: string) =>
  new Date(d).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className={`w-full ${wide ? "max-w-4xl" : "max-w-2xl"} rounded-xl bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
      {error}
    </p>
  ) : null;
}

const asPayload = (p: CapturedPhoto): FilePayload => ({ base64: p.base64, mimeType: p.mimeType });

function FourPhotos({
  label,
  photos,
  onChange,
}: {
  label: string;
  photos: (CapturedPhoto | null)[];
  onChange: (p: (CapturedPhoto | null)[]) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-800">
        {label} <span className="font-normal text-slate-500">({photos.filter(Boolean).length} of 4 taken)</span>
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {photos.map((p, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-2">
            <LiveCameraCapture
              label={`Photo ${i + 1}`}
              photo={p}
              onChange={(np) => {
                const next = [...photos];
                next[i] = np;
                onChange(next);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The ward parshad's application - a scan / photo / PDF from the device (it is a paper document), with its date. */
function ApplicationPicker({
  file,
  date,
  onFile,
  onDate,
}: {
  file: File | null;
  date: string;
  onFile: (f: File | null) => void;
  onDate: (d: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block">
        <span className={labelClass}>Ward parshad&apos;s application (photo or PDF)</span>
        <input
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          onChange={async (e) => {
            const f = e.target.files?.[0] ?? null;
            onFile(f && f.type.startsWith("image/") ? await shrinkPhotoFile(f) : f);
          }}
          className="block w-full text-xs text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-nnm-blue file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
        />
        {file && <span className="mt-1 block text-xs text-green-700">Attached: {file.name}</span>}
      </label>
      <label className="block">
        <span className={labelClass}>Date of the application</span>
        <input type="date" max={todayIst()} value={date} onChange={(e) => onDate(e.target.value)} className={inputClass} />
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Add / edit
// ---------------------------------------------------------------------------------------------------------------------

type FormState = Record<
  | "wardId"
  | "locationAddress"
  | "latitude"
  | "longitude"
  | "schemeName"
  | "overheadTankCount"
  | "housesServed"
  | "waterTapCount"
  | "standpostCount"
  | "structureType"
  | "tankStandType"
  | "pumpDetails"
  | "boringDepthFeet"
  | "casingDetails"
  | "installedDate"
  | "builderName"
  | "builderContact"
  | "remarks"
  | "agencyId"
  | "maintenanceContractorId",
  string
> & { underBuilderMaintenance: boolean };

function formFrom(p: PyauRecord | null, wardId: string): FormState {
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    wardId: p ? p.ward_id : wardId,
    locationAddress: s(p?.location_address),
    latitude: s(p?.latitude),
    longitude: s(p?.longitude),
    schemeName: s(p?.scheme_name),
    overheadTankCount: p ? String(p.overhead_tank_count) : "0",
    housesServed: s(p?.houses_served),
    waterTapCount: s(p?.water_tap_count),
    standpostCount: s(p?.standpost_count),
    structureType: s(p?.structure_type),
    tankStandType: s(p?.tank_stand_type),
    pumpDetails: s(p?.pump_details),
    boringDepthFeet: s(p?.boring_depth_feet),
    casingDetails: s(p?.casing_details),
    installedDate: p?.installed_date ? String(p.installed_date).slice(0, 10) : "",
    builderName: s(p?.builder_name),
    builderContact: s(p?.builder_contact),
    remarks: s(p?.remarks),
    agencyId: s(p?.agency_id),
    maintenanceContractorId: s(p?.maintenance_contractor_id),
    underBuilderMaintenance: !!p?.under_builder_maintenance,
  };
}

function detailsFrom(f: FormState): PyauDetails {
  const str = (v: string) => v.trim() || null;
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    locationAddress: str(f.locationAddress),
    latitude: num(f.latitude),
    longitude: num(f.longitude),
    schemeName: str(f.schemeName),
    overheadTankCount: Number(f.overheadTankCount || 0),
    housesServed: num(f.housesServed),
    waterTapCount: num(f.waterTapCount),
    standpostCount: num(f.standpostCount),
    structureType: (f.structureType || null) as StructureType | null,
    tankStandType: str(f.tankStandType),
    pumpDetails: str(f.pumpDetails),
    boringDepthFeet: num(f.boringDepthFeet),
    casingDetails: str(f.casingDetails),
    installedDate: str(f.installedDate),
    builderName: str(f.builderName),
    builderContact: str(f.builderContact),
    remarks: str(f.remarks),
    agencyId: num(f.agencyId),
    maintenanceContractorId: f.underBuilderMaintenance ? null : num(f.maintenanceContractorId),
    underBuilderMaintenance: f.underBuilderMaintenance,
  };
}

export function PyauFormModal({
  pyau,
  wards,
  defaultWardId,
  agencies,
  contractors,
  onClose,
  onSaved,
  onAgencyAdded,
}: {
  pyau: PyauRecord | null;
  wards: { id: string; ward_name: string }[];
  defaultWardId: string;
  agencies: Option[];
  contractors: Option[];
  onClose: () => void;
  onSaved: () => void;
  onAgencyAdded: (a: Option) => void;
}) {
  const [f, setF] = useState<FormState>(() => formFrom(pyau, defaultWardId));
  const [newAgency, setNewAgency] = useState("");
  const [addingAgency, setAddingAgency] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof FormState, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  async function handleAddAgency() {
    if (!newAgency.trim()) return;
    setAddingAgency(true);
    setError(null);
    try {
      const a = await addAgency(newAgency);
      onAgencyAdded(a);
      set("agencyId", a.id);
      setNewAgency("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the agency.");
    } finally {
      setAddingAgency(false);
    }
  }

  async function handleSave() {
    if (!pyau && !f.wardId) return setError("Select the ward.");
    if (!f.locationAddress.trim()) return setError("Enter the address / location.");
    if (f.underBuilderMaintenance && !f.builderName.trim()) return setError("Enter the builder's name.");
    setSaving(true);
    setError(null);
    try {
      if (pyau) await updatePyau(pyau.id, detailsFrom(f));
      else await createPyau(Number(f.wardId), detailsFrom(f));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const field = (k: keyof FormState, label: string, type = "text", extra: Record<string, string | number> = {}) => (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input type={type} value={String(f[k])} onChange={(e) => set(k, e.target.value)} className={inputClass} {...extra} />
    </label>
  );

  return (
    <Modal title={pyau ? `Edit ${pyau.serial_number ?? "submersible"}` : "Add a submersible"} onClose={onClose} wide>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!pyau && (
          <label className="block">
            <span className={labelClass}>Ward</span>
            <select value={f.wardId} onChange={(e) => set("wardId", e.target.value)} className={inputClass}>
              <option value="">Select ward…</option>
              {wards.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.ward_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="sm:col-span-2">{field("locationAddress", "Address / location of the water kiosk")}</div>
        {field("schemeName", "Scheme name")}
        <label className="block">
          <span className={labelClass}>Type of stand</span>
          <select value={f.structureType} onChange={(e) => set("structureType", e.target.value)} className={inputClass}>
            <option value="">-</option>
            {(Object.keys(STRUCTURE_LABELS) as StructureType[]).map((k) => (
              <option key={k} value={k}>
                {STRUCTURE_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        {field("overheadTankCount", "Water tanks (count)", "number", { min: 0 })}
        {field("tankStandType", "Tank stand")}
        {field("waterTapCount", "Number of water taps", "number", { min: 0 })}
        {field("standpostCount", "Number of water standposts", "number", { min: 0 })}
        {field("housesServed", "Houses getting water via line", "number", { min: 0 })}
        {field("pumpDetails", "Pump details")}
        {field("boringDepthFeet", "Boring depth (feet)", "number", { min: 0, step: "0.01" })}
        {field("casingDetails", "Casing details")}
        {field("installedDate", "Installed on", "date")}
        {field("latitude", "Latitude", "number", { step: "any" })}
        {field("longitude", "Longitude", "number", { step: "any" })}

        <div className="rounded-lg border border-slate-200 p-3 sm:col-span-2">
          <label className="block">
            <span className={labelClass}>Agency</span>
            <select value={f.agencyId} onChange={(e) => set("agencyId", e.target.value)} className={inputClass}>
              <option value="">-</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-2 flex gap-2">
            <input value={newAgency} onChange={(e) => setNewAgency(e.target.value)} placeholder="New agency name" className={inputClass} />
            <button
              type="button"
              onClick={handleAddAgency}
              disabled={addingAgency || !newAgency.trim()}
              className={`${btnGhost} whitespace-nowrap`}
            >
              {addingAgency ? "Adding…" : "Add agency"}
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              checked={f.underBuilderMaintenance}
              onChange={(e) => set("underBuilderMaintenance", e.target.checked)}
              className="h-4 w-4"
            />
            Under maintenance by the builder (newly built)
          </label>
          {f.underBuilderMaintenance ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {field("builderName", "Builder name")}
              {field("builderContact", "Builder contact")}
            </div>
          ) : (
            <label className="mt-3 block">
              <span className={labelClass}>Maintenance contractor</span>
              <select
                value={f.maintenanceContractorId}
                onChange={(e) => set("maintenanceContractorId", e.target.value)}
                className={inputClass}
              >
                <option value="">Ward&apos;s assigned contractor</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {contractors.length === 0 && (
                <span className="mt-1 block text-xs text-amber-700">
                  No maintenance contractor logins are set up yet (pyau contractor role).
                </span>
              )}
            </label>
          )}
        </div>
        <label className="block sm:col-span-2">
          <span className={labelClass}>Remarks</span>
          <textarea value={f.remarks} onChange={(e) => set("remarks", e.target.value)} rows={2} className={inputClass} />
        </label>
      </div>
      <ErrorLine error={error} />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={btnGhost}>
          Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={saving} className={btn}>
          {saving ? "Saving…" : pyau ? "Save changes" : "Add submersible"}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Fault
// ---------------------------------------------------------------------------------------------------------------------

export function FaultModal({ pyau, onClose, onSaved }: { pyau: PyauRecord; onClose: () => void; onSaved: (issueId: string) => void }) {
  const [date, setDate] = useState(todayIst());
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<(CapturedPhoto | null)[]>([null, null, null, null]);
  const [appFile, setAppFile] = useState<File | null>(null);
  const [appDate, setAppDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!notes.trim()) return setError("Describe the fault.");
    if (photos.some((p) => !p)) return setError("Take all 4 photos of the fault.");
    if (appFile && !appDate) return setError("Enter the date of the ward parshad's application.");
    setSaving(true);
    setError(null);
    try {
      const issue = await reportFault(pyau.id, {
        dateOfIssue: date,
        notes,
        photos: photos.map((p) => asPayload(p!)),
        application: appFile ? { base64: await fileToBase64(appFile), mimeType: appFile.type } : null,
        applicationDate: appFile ? appDate : null,
      });
      onSaved(issue.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark the fault.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Mark non-functional - ${pyau.serial_number ?? ""}`} onClose={onClose} wide>
      <p className="mb-3 text-sm text-slate-600">
        {pyau.location_address} · {pyau.ward_name} ·{" "}
        {pyau.under_builder_maintenance ? `Builder: ${pyau.builder_name ?? "-"}` : `Contractor: ${pyau.contractor_name ?? "not assigned"}`}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className={labelClass}>Date of the fault</span>
          <input type="date" max={todayIst()} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>
        <label className="block sm:col-span-2">
          <span className={labelClass}>What is wrong</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Motor not running, pipe leaking"
            className={inputClass}
          />
        </label>
      </div>
      <div className="mt-4">
        <FourPhotos label="Photos of the fault" photos={photos} onChange={setPhotos} />
      </div>
      <div className="mt-4 rounded-lg border border-slate-200 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-800">
          Ward parshad&apos;s application{" "}
          <span className="font-normal text-slate-500">(can also be attached later - needed before the repair is closed)</span>
        </p>
        <ApplicationPicker file={appFile} date={appDate} onFile={setAppFile} onDate={setAppDate} />
      </div>
      <ErrorLine error={error} />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={btnGhost}>
          Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={saving} className={btn}>
          {saving ? "Saving…" : "Mark non-functional"}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Repair (items, application, close)
// ---------------------------------------------------------------------------------------------------------------------

function PhotoStrip({ repair, stage }: { repair: Repair; stage: "fault" | "repair" }) {
  const list = repair.photos.filter((p) => p.stage === stage);
  if (!list.length) return <p className="text-xs text-slate-400">No photos.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((p) => (
        <AuthPhoto key={p.id} path={`/pyau/officer/photos/${p.id}`} label={`Photo ${p.slot}`} portal="attendance" />
      ))}
    </div>
  );
}

function ItemsTable({ repair, canEdit, onRemove }: { repair: Repair; canEdit: boolean; onRemove?: (id: string) => void }) {
  const total = repair.items.reduce((s, i) => s + Number(i.cost), 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="px-2 py-1.5 font-medium">#</th>
            <th className="px-2 py-1.5 font-medium">Item</th>
            <th className="px-2 py-1.5 font-medium">Qty</th>
            <th className="px-2 py-1.5 text-right font-medium">Cost</th>
            <th className="px-2 py-1.5 font-medium">Entered by</th>
            {canEdit && <th />}
          </tr>
        </thead>
        <tbody>
          {repair.items.map((it, i) => (
            <tr key={it.id} className="border-t border-slate-100">
              <td className="px-2 py-1.5">{i + 1}</td>
              <td className="px-2 py-1.5">{it.item_name}</td>
              <td className="px-2 py-1.5">{it.quantity !== null ? Number(it.quantity) : "-"}</td>
              <td className="px-2 py-1.5 text-right">{rupees(it.cost)}</td>
              <td className="px-2 py-1.5 text-xs text-slate-500">{it.added_by_name}</td>
              {canEdit && (
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove?.(it.id)}
                    title="Remove"
                    className="rounded p-1 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
          {repair.items.length === 0 && (
            <tr>
              <td colSpan={canEdit ? 6 : 5} className="px-2 py-2 text-xs text-slate-400">
                No items entered yet.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 font-semibold">
            <td colSpan={3} className="px-2 py-1.5">
              Total
            </td>
            <td className="px-2 py-1.5 text-right">{rupees(total)}</td>
            <td colSpan={canEdit ? 2 : 1} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function RepairSummary({ repair }: { repair: Repair }) {
  return (
    <div className="space-y-1 text-sm text-slate-700">
      <p>
        <b>Fault:</b> {fmtDate(repair.date_of_issue)} - {repair.issue_notes || "-"}{" "}
        <span className="text-slate-500">(marked by {repair.reported_by ?? "-"})</span>
      </p>
      <p>
        <b>Responsible:</b>{" "}
        {repair.under_builder_maintenance
          ? `Builder${repair.builder_name ? ` - ${repair.builder_name}` : ""}`
          : (repair.contractor_name ?? "No contractor assigned")}
      </p>
      <p className="flex flex-wrap items-center gap-2">
        <b>Ward parshad&apos;s application:</b>
        {repair.has_application ? (
          <>
            dated {fmtDate(repair.parshad_application_date)}
            <button
              type="button"
              onClick={() => openApplication(repair.id).catch(() => undefined)}
              className="inline-flex items-center gap-1 text-nnm-blue underline"
            >
              <FileText className="h-3.5 w-3.5" /> View
            </button>
          </>
        ) : (
          <span className="text-red-700">not attached yet</span>
        )}
      </p>
      {repair.status === "repaired" && (
        <p>
          <b>Repaired:</b> {fmtDate(repair.date_of_repair)} by {repair.repaired_by ?? "-"} · cost {rupees(repair.amount_spent)}
          {repair.repair_brief ? ` · ${repair.repair_brief}` : ""}
        </p>
      )}
    </div>
  );
}

export function RepairModal({
  issueId,
  canEdit,
  onClose,
  onChanged,
}: {
  issueId: string;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [repair, setRepair] = useState<Repair | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [item, setItem] = useState({ name: "", qty: "", cost: "" });
  const [appFile, setAppFile] = useState<File | null>(null);
  const [appDate, setAppDate] = useState("");
  const [repDate, setRepDate] = useState(todayIst());
  const [repNotes, setRepNotes] = useState("");
  const [photos, setPhotos] = useState<(CapturedPhoto | null)[]>([null, null, null, null]);

  useEffect(() => {
    fetchRepair(issueId)
      .then(setRepair)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the repair."));
  }, [issueId]);

  async function run(fn: () => Promise<Repair>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      setRepair(await fn());
      after?.();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const open = repair?.status === "open";
  const editable = canEdit && open;

  return (
    <Modal title={`Repair - ${open ? "in progress" : "completed"}`} onClose={onClose} wide>
      {!repair ? (
        error ? (
          <ErrorLine error={error} />
        ) : (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )
      ) : (
        <div className="space-y-5">
          <RepairSummary repair={repair} />
          <div>
            <p className="mb-1.5 text-sm font-semibold text-slate-800">Photos at the time of the fault</p>
            <PhotoStrip repair={repair} stage="fault" />
          </div>

          {editable && !repair.has_application && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-sm font-semibold text-amber-900">Attach the ward parshad&apos;s application</p>
              <ApplicationPicker file={appFile} date={appDate} onFile={setAppFile} onDate={setAppDate} />
              <button
                type="button"
                disabled={busy || !appFile || !appDate}
                onClick={() =>
                  run(
                    async () => uploadApplication(repair.id, { base64: await fileToBase64(appFile!), mimeType: appFile!.type }, appDate),
                    () => setAppFile(null),
                  )
                }
                className={`${btn} mt-2`}
              >
                Upload application
              </button>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-sm font-semibold text-slate-800">Items replaced / repaired, with cost</p>
            <ItemsTable repair={repair} canEdit={editable} onRemove={(id) => run(() => removeRepairItem(id))} />
            {editable && (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_90px_120px_auto]">
                <input
                  value={item.name}
                  onChange={(e) => setItem({ ...item, name: e.target.value })}
                  placeholder="Item (e.g. Motor 1 HP)"
                  className={inputClass}
                />
                <input
                  value={item.qty}
                  onChange={(e) => setItem({ ...item, qty: e.target.value })}
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Qty"
                  className={inputClass}
                />
                <input
                  value={item.cost}
                  onChange={(e) => setItem({ ...item, cost: e.target.value })}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Cost ₹"
                  className={inputClass}
                />
                <button
                  type="button"
                  disabled={busy || !item.name.trim() || item.cost === ""}
                  onClick={() =>
                    run(
                      () =>
                        addRepairItem(repair.id, {
                          itemName: item.name,
                          quantity: item.qty ? Number(item.qty) : null,
                          cost: Number(item.cost),
                        }),
                      () => setItem({ name: "", qty: "", cost: "" }),
                    )
                  }
                  className={`${btn} inline-flex items-center justify-center gap-1`}
                >
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
            )}
          </div>

          {repair.status === "repaired" && (
            <div>
              <p className="mb-1.5 text-sm font-semibold text-slate-800">Photos after the repair</p>
              <PhotoStrip repair={repair} stage="repair" />
            </div>
          )}

          {editable && (
            <div className="rounded-lg border-2 border-green-200 p-3">
              <p className="mb-2 text-sm font-semibold text-green-900">Mark repaired (functional)</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className={labelClass}>Date of repair</span>
                  <input
                    type="date"
                    min={repair.date_of_issue}
                    max={todayIst()}
                    value={repDate}
                    onChange={(e) => setRepDate(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className={labelClass}>Repair notes (optional)</span>
                  <input value={repNotes} onChange={(e) => setRepNotes(e.target.value)} className={inputClass} />
                </label>
              </div>
              <div className="mt-3">
                <FourPhotos label="Photos after the repair (cover every part replaced)" photos={photos} onChange={setPhotos} />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (photos.some((p) => !p)) return setError("Take all 4 photos after the repair.");
                  run(() =>
                    markRepaired(repair.id, { dateOfRepair: repDate, notes: repNotes || null, photos: photos.map((p) => asPayload(p!)) }),
                  );
                }}
                className="mt-3 inline-flex items-center gap-2 rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" /> Mark repaired
              </button>
            </div>
          )}
          <ErrorLine error={error} />
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// History + audit trail
// ---------------------------------------------------------------------------------------------------------------------

export function auditDetails(e: AuditEvent): string {
  const d = e.details ?? {};
  switch (e.action) {
    case "pyau_edited":
      return Object.entries(d as Record<string, { from: string | null; to: string | null }>)
        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v?.from ?? "-"} → ${v?.to ?? "-"}`)
        .join("; ");
    case "fault_marked":
      return `Fault dated ${d.dateOfIssue ?? "-"}: ${d.notes ?? ""} (${d.responsible ?? ""})`;
    case "item_added":
    case "item_removed":
      return `${d.item ?? ""}${d.quantity ? ` × ${d.quantity}` : ""} - ${rupees(d.cost as number)}`;
    case "parshad_application_uploaded":
      return `Application dated ${d.applicationDate ?? "-"}`;
    case "repaired":
      return `Repaired on ${d.dateOfRepair ?? "-"} - ${d.items ?? 0} item(s), total ${rupees(d.totalCost as number)}${d.notes ? ` - ${d.notes}` : ""}`;
    case "pyau_added":
      return `${d.serialNumber ?? ""} in ${d.ward ?? ""}`;
    case "agency_added":
      return String(d.name ?? "");
    default:
      return "";
  }
}

export function HistoryModal({ pyauId, onClose }: { pyauId: string; onClose: () => void }) {
  const [data, setData] = useState<{ pyau: PyauRecord; issues: Repair[]; audit: AuditEvent[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchHistory(pyauId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the history."));
  }, [pyauId]);
  return (
    <Modal title={data ? `History - ${data.pyau.serial_number ?? ""}` : "History"} onClose={onClose} wide>
      {!data ? (
        error ? (
          <ErrorLine error={error} />
        ) : (
          <p className="text-sm text-slate-500">Loading…</p>
        )
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-slate-600">
            {data.pyau.location_address} · {(data.pyau as PyauRecord & { ward_name: string }).ward_name}
          </p>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Repairs ({data.issues.length})</h3>
            {data.issues.length === 0 && <p className="text-sm text-slate-400">No repairs recorded.</p>}
            <div className="space-y-3">
              {data.issues.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-200 p-3">
                  <RepairSummary repair={r} />
                  <div className="mt-2">
                    <ItemsTable repair={r} canEdit={false} />
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-semibold text-slate-600">Fault photos</p>
                      <PhotoStrip repair={r} stage="fault" />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold text-slate-600">After repair</p>
                      <PhotoStrip repair={r} stage="repair" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Audit trail</h3>
            <ul className="space-y-1.5 text-sm">
              {data.audit.map((e) => (
                <li key={e.id} className="rounded border border-slate-100 px-2.5 py-1.5">
                  <span className="text-xs text-slate-500">{fmtWhen(e.at)}</span> · <b>{AUDIT_ACTION_LABELS[e.action] ?? e.action}</b> by{" "}
                  {e.by_name}
                  {auditDetails(e) && <span className="block text-xs text-slate-600">{auditDetails(e)}</span>}
                </li>
              ))}
              {data.audit.length === 0 && <li className="text-slate-400">Nothing recorded yet.</li>}
            </ul>
          </section>
        </div>
      )}
    </Modal>
  );
}

export type { WardSummary };
