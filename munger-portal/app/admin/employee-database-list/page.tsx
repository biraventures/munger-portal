"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, List } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchEmployees,
  RESERVATION_CATEGORY_LABELS,
  EDUCATIONAL_QUALIFICATION_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  type Employee,
} from "@/lib/admin-api";

export default function EmployeeDatabaseListPage() {
  const admin = useAdminGuard();
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) return;
    fetchEmployees()
      .then(setEmployees)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load employee records."));
  }, [admin]);

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

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <List className="h-6 w-6" />
          All Employee Records
        </h1>
        <p className="mb-6 text-sm text-slate-500">Every record entered so far - use this to keep checking the data is correct.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!employees ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : employees.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No records entered yet.</div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {employees.map((e) => (
              <div key={e.id} className="p-4">
                <div className="mb-1 flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800">{e.name}</p>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      e.status === "verified" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {e.status === "verified" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {e.status === "verified" ? "Verified" : "Pending Verification"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
                  <p>Aadhaar: {e.aadhaar_number}</p>
                  <p>{e.home_district}</p>
                  <p>{RESERVATION_CATEGORY_LABELS[e.reservation_category]}</p>
                  <p>{EDUCATIONAL_QUALIFICATION_LABELS[e.educational_qualification]}</p>
                  <p>{EMPLOYMENT_TYPE_LABELS[e.employment_type]}</p>
                  <p>
                    Service: {e.yearsOfService.years}y {e.yearsOfService.months}m
                  </p>
                  {e.unauthorised_absence_days > 0 && <p>Absence: {e.unauthorised_absence_days} days</p>}
                  {e.appointment_order_number && <p>Order: {e.appointment_order_number}</p>}
                  <p>MB Recommendation: {e.municipal_board_recommendation ? "Yes" : "No"}</p>
                  {e.municipal_board_recommendation && e.proceeding_number && (
                    <p>
                      Proceeding: {e.proceeding_number}
                      {e.proceeding_date ? ` (${new Date(e.proceeding_date).toLocaleDateString("en-IN")})` : ""}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
