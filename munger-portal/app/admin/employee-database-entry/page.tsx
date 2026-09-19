"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Users } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  createEmployee,
  RESERVATION_CATEGORY_LABELS,
  EDUCATIONAL_QUALIFICATION_LABELS,
  APPOINTING_AUTHORITY_LABELS,
  EMPLOYMENT_TYPE_LABELS,
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
};

export default function EmployeeDatabaseEntryPage() {
  const admin = useAdminGuard();
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function update<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.homeDistrict.trim() || !form.dateOfBirth || !form.aadhaarNumber.trim() || !form.dateOfAppointment) {
      setError("Name, home district, date of birth, Aadhaar number, and date of appointment are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const employee = await createEmployee({
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
      });
      setSuccess(`${employee.name} added - awaiting City Manager verification.`);
      setForm(emptyForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this record.");
    } finally {
      setSubmitting(false);
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
        <p className="mb-6 text-sm text-slate-500">Add a new municipal employee/officer record.</p>

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

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Name of staff/officer</label>
              <input value={form.name} onChange={(e) => update("name", e.target.value)} className={inputClass} autoFocus />
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
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="mt-6 w-full rounded-md bg-nnm-blue px-4 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save Record"}
          </button>
        </div>
      </main>
    </div>
  );
}
