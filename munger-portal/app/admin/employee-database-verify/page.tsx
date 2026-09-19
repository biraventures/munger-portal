"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, UserCheck } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchEmployees,
  verifyEmployee,
  RESERVATION_CATEGORY_LABELS,
  EDUCATIONAL_QUALIFICATION_LABELS,
  APPOINTING_AUTHORITY_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  type Employee,
} from "@/lib/admin-api";

export default function EmployeeDatabaseVerifyPage() {
  const admin = useAdminGuard();
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<number | null>(null);

  function load() {
    fetchEmployees("pending_verification")
      .then(setEmployees)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load employee records."));
  }

  useEffect(() => {
    if (!admin) return;
    load();
  }, [admin]);

  async function handleVerify(id: number) {
    setActing(id);
    setError(null);
    try {
      await verifyEmployee(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify this record.");
    } finally {
      setActing(null);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (admin.role !== "city_manager") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the City Manager.
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
          <UserCheck className="h-6 w-6" />
          Employee Records - Verification
        </h1>
        <p className="mb-6 text-sm text-slate-500">New employee database entries awaiting your verification.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!employees ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : employees.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Nothing awaiting verification.</div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {employees.map((e) => (
              <div key={e.id} className="p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{e.name}</p>
                    <p className="text-xs text-slate-500">
                      {e.father_name ? `S/O ${e.father_name}` : e.husband_name ? `W/O ${e.husband_name}` : ""} · {e.home_district}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => handleVerify(e.id)}
                      disabled={acting === e.id}
                      className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {acting === e.id ? "Verifying…" : "Verify"}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-3">
                  <p>DOB: {new Date(e.date_of_birth).toLocaleDateString("en-IN")}</p>
                  <p>Aadhaar: {e.aadhaar_number}</p>
                  <p>{RESERVATION_CATEGORY_LABELS[e.reservation_category]}</p>
                  <p>{EDUCATIONAL_QUALIFICATION_LABELS[e.educational_qualification]}</p>
                  <p>Appointed: {new Date(e.date_of_appointment).toLocaleDateString("en-IN")}</p>
                  {e.appointment_order_number && <p>Order No: {e.appointment_order_number}</p>}
                  <p>{APPOINTING_AUTHORITY_LABELS[e.appointing_authority]}</p>
                  <p>{EMPLOYMENT_TYPE_LABELS[e.employment_type]}</p>
                  <p>
                    Service: {e.yearsOfService.years}y {e.yearsOfService.months}m
                  </p>
                  {e.unauthorised_absence_days > 0 && <p>Unauthorised absence: {e.unauthorised_absence_days} days</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
