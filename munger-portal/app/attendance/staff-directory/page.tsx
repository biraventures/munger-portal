"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Filter, Loader2, Pencil, X, Check, ArrowUpDown } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { useAttendanceLang } from "@/lib/attendance-i18n";
import { transliterateName } from "@/lib/hindi-name-transliterate";
import {
  fetchAttendanceWards,
  fetchAttendanceShifts,
  fetchAllFieldStaff,
  fetchAllFieldDrivers,
  fetchAllFieldAssistants,
  fetchStaffJobRoles,
  updateFieldStaffDetails,
  updateFieldDriverDetails,
  updateFieldAssistantDetails,
  transferFieldStaff,
  transferFieldDriver,
  transferFieldAssistant,
  setStaffJobRoles,
  type AttendanceWard,
  type AttendanceShift,
  type FieldStaffSummary,
  type FieldDriverSummary,
  type FieldAssistantSummary,
  type StaffJobRoleSummary,
} from "@/lib/attendance-api";

type Category = "staff" | "driver" | "assistant";
type CategoryFilter = "all" | Category;
type SortKey = "idNumber" | "ward" | "role";

interface UnifiedRow {
  id: number;
  category: Category;
  name: string;
  nameHi: string | null;
  externalId: string | null;
  fatherName: string | null;
  wardId: number;
  shiftId: number | null;
  active: boolean;
  dlNumber: string | null;
  roleIds: number[];
  roleLabel: string;
}

const STRINGS = {
  en: {
    title: "Field Staff / Driver / Assistant Directory",
    subtitle:
      "Every field staff member, driver, and assistant in one place. Filter by category, sort by Unique ID, Ward, or Role, and edit the full record - including name and Unique ID - from here.",
    filterAll: "All",
    filterStaff: "Field Staff",
    filterDrivers: "Drivers",
    filterAssistants: "Assistants",
    sortBy: "Sort by",
    sortIdNumber: "Unique ID",
    sortWard: "Ward",
    sortRole: "Role",
    loading: "Loading...",
    uniqueId: "Unique ID",
    name: "Name",
    fatherName: "Father's Name",
    ward: "Ward",
    role: "Role / Category",
    shift: "Shift",
    status: "Status",
    active: "Active",
    inactive: "Inactive",
    edit: "Edit",
    noRecords: "No records found.",
    editTitle: "Edit",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving...",
    couldNotLoad: "Could not load the directory.",
    couldNotSave: "Could not save these changes.",
    none: "None",
    jobRoles: "Job Role(s)",
    categoryLabels: { staff: "Field Staff", driver: "Driver", assistant: "Assistant" } as Record<Category, string>,
    count: (n: number) => `${n} record${n === 1 ? "" : "s"}`,
  },
  hi: {
    title: "फील्ड स्टाफ / ड्राइवर / सहायक निर्देशिका",
    subtitle:
      "सभी फील्ड स्टाफ, ड्राइवर और सहायक एक ही जगह पर। श्रेणी के अनुसार फ़िल्टर करें, यूनिक आईडी, वार्ड या भूमिका के अनुसार क्रमबद्ध करें, और यहीं से पूरा रिकॉर्ड - नाम और यूनिक आईडी सहित - संपादित करें।",
    filterAll: "सभी",
    filterStaff: "फील्ड स्टाफ",
    filterDrivers: "ड्राइवर",
    filterAssistants: "सहायक",
    sortBy: "क्रमबद्ध करें",
    sortIdNumber: "यूनिक आईडी",
    sortWard: "वार्ड",
    sortRole: "भूमिका",
    loading: "लोड हो रहा है...",
    uniqueId: "यूनिक आईडी",
    name: "नाम",
    fatherName: "पिता का नाम",
    ward: "वार्ड",
    role: "भूमिका / श्रेणी",
    shift: "शिफ्ट",
    status: "स्थिति",
    active: "सक्रिय",
    inactive: "निष्क्रिय",
    edit: "संपादित करें",
    noRecords: "कोई रिकॉर्ड नहीं मिला।",
    editTitle: "संपादित करें",
    cancel: "रद्द करें",
    save: "सहेजें",
    saving: "सहेजा जा रहा है...",
    couldNotLoad: "निर्देशिका लोड नहीं हो सकी।",
    couldNotSave: "ये बदलाव सहेजे नहीं जा सके।",
    none: "कोई नहीं",
    jobRoles: "कार्य भूमिका(एँ)",
    categoryLabels: { staff: "फील्ड स्टाफ", driver: "ड्राइवर", assistant: "सहायक" } as Record<Category, string>,
    count: (n: number) => `${n} रिकॉर्ड`,
  },
};

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

/** Natural-ish comparison for Unique IDs - numeric when both sides parse as numbers, plain string otherwise. Blank/missing IDs sort last regardless of direction. */
function compareIds(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b);
}

export default function StaffDirectoryPage() {
  // Same two roles already allowed to view/edit the per-category
  // manage-staff / manage-drivers / manage-assistants rosters - this
  // page is a combined read+edit view over the same data, not a new
  // permission.
  const user = useAttendanceGuard(["attendance_admin", "sanitation_officer"]);
  const isAdmin = user?.role === "attendance_admin";
  const { lang } = useAttendanceLang();
  const s = STRINGS[lang];

  const [wards, setWards] = useState<AttendanceWard[]>([]);
  const [shifts, setShifts] = useState<AttendanceShift[]>([]);
  const [jobRoles, setJobRoles] = useState<StaffJobRoleSummary[]>([]);
  const [staff, setStaff] = useState<FieldStaffSummary[] | null>(null);
  const [drivers, setDrivers] = useState<FieldDriverSummary[] | null>(null);
  const [assistants, setAssistants] = useState<FieldAssistantSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("idNumber");

  const [editing, setEditing] = useState<UnifiedRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editFatherName, setEditFatherName] = useState("");
  const [editExternalId, setEditExternalId] = useState("");
  const [editDlNumber, setEditDlNumber] = useState("");
  const [editWardId, setEditWardId] = useState("");
  const [editShiftId, setEditShiftId] = useState("");
  const [editRoleIds, setEditRoleIds] = useState<number[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const wardNameById = useMemo(() => new Map(wards.map((w) => [w.id, w.wardName])), [wards]);
  const shiftNameById = useMemo(() => new Map(shifts.map((sh) => [sh.id, sh.shiftName])), [shifts]);
  const jobRoleNameById = useMemo(() => new Map(jobRoles.map((r) => [r.id, r.roleName])), [jobRoles]);

  async function loadAll() {
    setError(null);
    try {
      const [staffList, driverList, assistantList] = await Promise.all([
        fetchAllFieldStaff(),
        fetchAllFieldDrivers(),
        fetchAllFieldAssistants(),
      ]);
      setStaff(staffList);
      setDrivers(driverList);
      setAssistants(assistantList);
    } catch (err) {
      setError(err instanceof Error ? err.message : s.couldNotLoad);
    }
  }

  useEffect(() => {
    if (!user) return;
    fetchAttendanceWards().then(setWards).catch(() => setWards([]));
    fetchAttendanceShifts().then(setShifts).catch(() => setShifts([]));
    fetchStaffJobRoles().then(setJobRoles).catch(() => setJobRoles([]));
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const rows: UnifiedRow[] = useMemo(() => {
    const out: UnifiedRow[] = [];
    for (const row of staff ?? []) {
      const roleNames = row.roleIds.map((id) => jobRoleNameById.get(id)).filter(Boolean) as string[];
      out.push({
        id: row.id,
        category: "staff",
        name: row.name,
        nameHi: row.nameHi,
        externalId: row.externalId,
        fatherName: row.fatherName,
        wardId: row.wardId,
        shiftId: row.shiftId,
        active: row.active,
        dlNumber: null,
        roleIds: row.roleIds,
        roleLabel: roleNames.length > 0 ? roleNames.join(", ") : s.categoryLabels.staff,
      });
    }
    for (const row of drivers ?? []) {
      out.push({
        id: row.id,
        category: "driver",
        name: row.name,
        nameHi: row.nameHi,
        externalId: row.externalId,
        fatherName: row.fatherName,
        wardId: row.wardId,
        shiftId: row.shiftId,
        active: row.active,
        dlNumber: row.dlNumber,
        roleIds: [],
        roleLabel: s.categoryLabels.driver,
      });
    }
    for (const row of assistants ?? []) {
      out.push({
        id: row.id,
        category: "assistant",
        name: row.name,
        nameHi: row.nameHi,
        externalId: row.externalId,
        fatherName: row.fatherName,
        wardId: row.wardId,
        shiftId: row.shiftId,
        active: row.active,
        dlNumber: null,
        roleIds: [],
        roleLabel: s.categoryLabels.assistant,
      });
    }
    return out;
  }, [staff, drivers, assistants, jobRoleNameById, s]);

  const filteredSorted = useMemo(() => {
    const filtered = categoryFilter === "all" ? rows : rows.filter((r) => r.category === categoryFilter);
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "idNumber") return compareIds(a.externalId, b.externalId);
      if (sortKey === "ward") return (wardNameById.get(a.wardId) ?? "").localeCompare(wardNameById.get(b.wardId) ?? "");
      return a.roleLabel.localeCompare(b.roleLabel);
    });
    return sorted;
  }, [rows, categoryFilter, sortKey, wardNameById]);

  const loading = staff === null || drivers === null || assistants === null;

  function displayName(row: UnifiedRow): string {
    if (lang !== "hi") return row.name;
    return row.nameHi || transliterateName(row.name);
  }

  function openEdit(row: UnifiedRow) {
    setEditing(row);
    setEditName(row.name);
    setEditFatherName(row.fatherName ?? "");
    setEditExternalId(row.externalId ?? "");
    setEditDlNumber(row.dlNumber ?? "");
    setEditWardId(String(row.wardId));
    setEditShiftId(row.shiftId ? String(row.shiftId) : "");
    setEditRoleIds(row.roleIds);
    setEditError(null);
  }

  function toggleEditRole(id: number) {
    setEditRoleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  async function handleEditSave() {
    if (!editing) return;
    if (!editName.trim()) {
      setEditError(s.name + " is required.");
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      const name = editName.trim();
      const externalId = editExternalId.trim() || null;
      const fatherName = editFatherName.trim() || null;
      const wardId = Number(editWardId);
      const shiftId = editShiftId ? Number(editShiftId) : null;

      if (editing.category === "staff") {
        await updateFieldStaffDetails(editing.id, name, externalId, fatherName);
        if (wardId !== editing.wardId || shiftId !== editing.shiftId) {
          await transferFieldStaff(editing.id, wardId, shiftId);
        }
        if (isAdmin) {
          await setStaffJobRoles(editing.id, editRoleIds);
        }
      } else if (editing.category === "driver") {
        await updateFieldDriverDetails(editing.id, name, externalId, editDlNumber.trim() || null, fatherName);
        if (wardId !== editing.wardId || shiftId !== editing.shiftId) {
          await transferFieldDriver(editing.id, wardId, shiftId);
        }
      } else {
        await updateFieldAssistantDetails(editing.id, name, externalId, fatherName);
        if (wardId !== editing.wardId || shiftId !== editing.shiftId) {
          await transferFieldAssistant(editing.id, wardId, shiftId);
        }
      }

      setEditing(null);
      await loadAll();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : s.couldNotSave);
    } finally {
      setEditSubmitting(false);
    }
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">{s.loading}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">{s.title}</h1>
        <p className="mb-6 text-sm text-slate-500">{s.subtitle}</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="mr-1 h-4 w-4 text-slate-400" />
            {([
              ["all", s.filterAll],
              ["staff", s.filterStaff],
              ["driver", s.filterDrivers],
              ["assistant", s.filterAssistants],
            ] as [CategoryFilter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setCategoryFilter(key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  categoryFilter === key ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-sm">
            <ArrowUpDown className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-500">{s.sortBy}</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs">
              <option value="idNumber">{s.sortIdNumber}</option>
              <option value="ward">{s.sortWard}</option>
              <option value="role">{s.sortRole}</option>
            </select>
          </div>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">{loading ? s.loading : s.count(filteredSorted.length)}</h2>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              {s.loading}
            </div>
          ) : filteredSorted.length === 0 ? (
            <p className="text-sm text-slate-400">{s.noRecords}</p>
          ) : (
            <div className="max-h-[32rem] overflow-y-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">{s.uniqueId}</th>
                    <th className="px-3 py-2 font-medium">{s.name}</th>
                    <th className="px-3 py-2 font-medium">{s.fatherName}</th>
                    <th className="px-3 py-2 font-medium">{s.ward}</th>
                    <th className="px-3 py-2 font-medium">{s.role}</th>
                    <th className="px-3 py-2 font-medium">{s.shift}</th>
                    <th className="px-3 py-2 font-medium">{s.status}</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.map((row) => (
                    <tr key={`${row.category}-${row.id}`} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.externalId ?? "-"}</td>
                      <td className="px-3 py-2">{displayName(row)}</td>
                      <td className="px-3 py-2 text-slate-600">{row.fatherName ?? "-"}</td>
                      <td className="px-3 py-2">{wardNameById.get(row.wardId) ?? "-"}</td>
                      <td className="max-w-[200px] px-3 py-2 text-xs text-slate-500">{row.roleLabel}</td>
                      <td className="px-3 py-2">{row.shiftId ? shiftNameById.get(row.shiftId) ?? "-" : "-"}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${row.active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}
                        >
                          {row.active ? s.active : s.inactive}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => openEdit(row)} className="inline-flex items-center gap-1 text-xs font-medium text-nnm-blue hover:underline">
                          <Pencil className="h-3 w-3" />
                          {s.edit}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {editing !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h2 className="mb-4 text-sm font-semibold text-slate-800">
              {s.editTitle}: {editing.name} ({s.categoryLabels[editing.category]})
            </h2>

            {editError && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {editError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className={labelClass}>{s.name}</label>
                <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{s.fatherName}</label>
                <input value={editFatherName} onChange={(e) => setEditFatherName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{s.uniqueId}</label>
                <input value={editExternalId} onChange={(e) => setEditExternalId(e.target.value)} className={inputClass} />
              </div>
              {editing.category === "driver" && (
                <div>
                  <label className={labelClass}>DL Number</label>
                  <input value={editDlNumber} onChange={(e) => setEditDlNumber(e.target.value)} className={inputClass} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>{s.ward}</label>
                  <select value={editWardId} onChange={(e) => setEditWardId(e.target.value)} className={inputClass}>
                    {wards.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.wardName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>{s.shift}</label>
                  <select value={editShiftId} onChange={(e) => setEditShiftId(e.target.value)} className={inputClass}>
                    <option value="">-</option>
                    {shifts.map((sh) => (
                      <option key={sh.id} value={sh.id}>
                        {sh.shiftName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {editing.category === "staff" && isAdmin && (
                <div>
                  <label className={labelClass}>{s.jobRoles}</label>
                  <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 p-3">
                    {jobRoles.map((r) => (
                      <label key={r.id} className="flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs">
                        <input type="checkbox" checked={editRoleIds.includes(r.id)} onChange={() => toggleEditRole(r.id)} />
                        {r.roleName}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={editSubmitting}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" />
                {s.cancel}
              </button>
              <button
                type="button"
                onClick={handleEditSave}
                disabled={editSubmitting}
                className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
              >
                {editSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {editSubmitting ? s.saving : s.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
