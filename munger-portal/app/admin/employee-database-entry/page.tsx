"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Search, Trash2, Users } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  createEmployee,
  searchEmployeeByAadhaar,
  updateEmployee,
  deleteEmployee,
  RESERVATION_CATEGORY_LABELS,
  EDUCATIONAL_QUALIFICATION_LABELS,
  APPOINTING_AUTHORITY_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  type Employee,
  type ReservationCategory,
  type EducationalQualification,
  type AppointingAuthority,
  type EmploymentType,
} from "@/lib/admin-api";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

const emptyForm = {
  name: "",
  fatherName: "",
  husbandName: "",
  homeDistrict: "",
  dateOfBirth: "",
  aadhaarNumber: "",
  panNumber: "",
  reservationCategory: "general" as ReservationCategory,
  educationalQualification: "matriculation" as EducationalQualification,
  dateOfAppointment: "",
  appointmentOrderNumber: "",
  appointingAuthority: "munger_municipal_corporation" as AppointingAuthority,
  employmentType: "permanent" as EmploymentType,
  epfUan: "",
  unauthorisedAbsenceDays: "0",
  municipalBoardRecommendation: false,
  proceedingNumber: "",
  proceedingDate: "",
};

function employeeToForm(e: Employee): typeof emptyForm {
  return {
    name: e.name,
    fatherName: e.father_name ?? "",
    husbandName: e.husband_name ?? "",
    homeDistrict: e.home_district,
    dateOfBirth: e.date_of_birth.slice(0, 10),
    aadhaarNumber: e.aadhaar_number,
    panNumber: e.pan_number ?? "",
    reservationCategory: e.reservation_category,
    educationalQualification: e.educational_qualification,
    dateOfAppointment: e.date_of_appointment.slice(0, 10),
    appointmentOrderNumber: e.appointment_order_number ?? "",
    appointingAuthority: e.appointing_authority,
    employmentType: e.employment_type,
    epfUan: e.epf_uan ?? "",
    unauthorisedAbsenceDays: String(e.unauthorised_absence_days),
    municipalBoardRecommendation: e.municipal_board_recommendation,
    proceedingNumber: e.proceeding_number ?? "",
    proceedingDate: e.proceeding_date ? e.proceeding_date.slice(0, 10) : "",
  };
}

export default function EmployeeDatabaseEntryPage() {
  const admin = useAdminGuard();

  const [searchAadhaar, setSearchAadhaar] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function update<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetToBlank(aadhaar?: string) {
    setForm({ ...emptyForm, aadhaarNumber: aadhaar ?? "" });
    setEditingId(null);
  }

  async function handleSearch() {
    if (!searchAadhaar.trim()) {
      setError("Enter an Aadhaar number to search.");
      return;
    }
    setSearching(true);
    setError(null);
    setSuccess(null);
    try {
      const employee = await searchEmployeeByAadhaar(searchAadhaar.trim());
      setSearched(true);
      if (employee) {
        setForm(employeeToForm(employee));
        setEditingId(employee.id);
      } else {
        resetToBlank(searchAadhaar.trim());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search for this Aadhaar number.");
    } finally {
      setSearching(false);
    }
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.homeDistrict.trim() || !form.dateOfBirth || !form.aadhaarNumber.trim() || !form.dateOfAppointment) {
      setError("Name, home district, date of birth, Aadhaar number, and date of appointment are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const input = {
        name: form.name.trim(),
        fatherName: form.fatherName.trim() || null,
        husbandName: form.husbandName.trim() || null,
        homeDistrict: form.homeDistrict.trim(),
        dateOfBirth: form.dateOfBirth,
        aadhaarNumber: form.aadhaarNumber.trim(),
        panNumber: form.panNumber.trim() || null,
        reservationCategory: form.reservationCategory,
        educationalQualification: form.educationalQualification,
        dateOfAppointment: form.dateOfAppointment,
        appointmentOrderNumber: form.appointmentOrderNumber.trim() || null,
        appointingAuthority: form.appointingAuthority,
        employmentType: form.employmentType,
        epfUan: form.epfUan.trim() || null,
        unauthorisedAbsenceDays: Number(form.unauthorisedAbsenceDays) || 0,
        municipalBoardRecommendation: form.municipalBoardRecommendation,
        proceedingNumber: form.municipalBoardRecommendation ? form.proceedingNumber.trim() || null : null,
        proceedingDate: form.municipalBoardRecommendation ? form.proceedingDate || null : null,
      };
      if (editingId) {
        const employee = await updateEmployee(editingId, input);
        setSuccess(`${employee.name} updated - sent back for City Manager re-verification.`);
      } else {
        const employee = await createEmployee(input);
        setSuccess(`${employee.name} added - awaiting City Manager verification.`);
      }
      resetToBlank();
      setSearchAadhaar("");
      setSearched(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this record.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!editingId) return;
    if (!confirm(`Delete the record for ${form.name}? This can't be undone from here.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteEmployee(editingId);
      setSuccess(`${form.name}'s record deleted.`);
      resetToBlank();
      setSearchAadhaar("");
      setSearched(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this record.");
    } finally {
      setDeleting(false);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (admin.role !== "establishment_clerk") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Establishment Clerk.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Users className="h-6 w-6" />
          Employee Database Entry
        </h1>
        <p className="mb-6 text-sm text-slate-500">Search by Aadhaar number to correct or delete an existing record, or add a new one.</p>

        <div className="mb-5 flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2.5">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={searchAadhaar}
            onChange={(e) => setSearchAadhaar(e.target.value)}
            placeholder="Search by Aadhaar number"
            maxLength={12}
            className="flex-1 text-sm outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button onClick={handleSearch} disabled={searching} className="rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60">
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="mb-5 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        {searched && (
          <p className="mb-3 text-sm text-slate-600">
            {editingId ? (
              <span className="font-semibold text-amber-700">Existing record found - editing below.</span>
            ) : (
              <span className="font-semibold text-slate-700">No existing record - fill in the details to add a new one.</span>
            )}
          </p>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Name of staff/officer</label>
              <input value={form.name} onChange={(e) => update("name", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Father&apos;s name</label>
              <input value={form.fatherName} onChange={(e) => update("fatherName", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Husband&apos;s name</label>
              <input value={form.husbandName} onChange={(e) => update("husbandName", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Home district</label>
              <input value={form.homeDistrict} onChange={(e) => update("homeDistrict", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Date of birth</label>
              <input type="date" value={form.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Aadhaar number</label>
              <input value={form.aadhaarNumber} onChange={(e) => update("aadhaarNumber", e.target.value)} maxLength={12} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">PAN number (optional)</label>
              <input value={form.panNumber} onChange={(e) => update("panNumber", e.target.value.toUpperCase())} maxLength={10} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Reservation category</label>
              <select value={form.reservationCategory} onChange={(e) => update("reservationCategory", e.target.value as ReservationCategory)} className={inputClass}>
                {Object.entries(RESERVATION_CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Educational qualification</label>
              <select value={form.educationalQualification} onChange={(e) => update("educationalQualification", e.target.value as EducationalQualification)} className={inputClass}>
                {Object.entries(EDUCATIONAL_QUALIFICATION_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Date of appointment</label>
              <input type="date" value={form.dateOfAppointment} onChange={(e) => update("dateOfAppointment", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Order/letter of appointment (order number)</label>
              <input value={form.appointmentOrderNumber} onChange={(e) => update("appointmentOrderNumber", e.target.value)} placeholder="e.g. NNM/Estab/2020/45-A" className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Appointing authority</label>
              <select value={form.appointingAuthority} onChange={(e) => update("appointingAuthority", e.target.value as AppointingAuthority)} className={inputClass}>
                {Object.entries(APPOINTING_AUTHORITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
              <select value={form.employmentType} onChange={(e) => update("employmentType", e.target.value as EmploymentType)} className={inputClass}>
                {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">EPF UAN (optional)</label>
              <input value={form.epfUan} onChange={(e) => update("epfUan", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Unauthorised absence (days)</label>
              <input type="number" min={0} value={form.unauthorisedAbsenceDays} onChange={(e) => update("unauthorisedAbsenceDays", e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Recommendation of Municipal Board</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => update("municipalBoardRecommendation", true)}
                  className={`rounded-md px-4 py-2 text-sm font-semibold ${form.municipalBoardRecommendation ? "bg-nnm-blue text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => update("municipalBoardRecommendation", false)}
                  className={`rounded-md px-4 py-2 text-sm font-semibold ${!form.municipalBoardRecommendation ? "bg-nnm-blue text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                >
                  No
                </button>
              </div>
            </div>
            {form.municipalBoardRecommendation && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Proceeding number</label>
                  <input value={form.proceedingNumber} onChange={(e) => update("proceedingNumber", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Proceeding date</label>
                  <input type="date" value={form.proceedingDate} onChange={(e) => update("proceedingDate", e.target.value)} className={inputClass} />
                </div>
              </>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting || deleting}
              className="flex-1 rounded-md bg-nnm-blue px-4 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
            >
              {submitting ? "Saving…" : editingId ? "Save Correction" : "Save Record"}
            </button>
            {editingId && (
              <button
                onClick={handleDelete}
                disabled={submitting || deleting}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
