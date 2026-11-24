"use client";

import { AdminHeader } from "@/components/admin-header";
import { MigApprovals } from "@/components/mig-approvals";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { setMigOperatorLogin } from "@/lib/mig-records-api";

const ROLES = ["tax_daroga", "city_manager", "commissioner", "deputy_commissioner"];

/** Old Records (MIG) - Approvals: Tax Daroga (review & forward), City Manager (approve), Commissioner (any step), DMC (view). */
export default function MigRecordsAdminPage() {
  const admin = useAdminGuard();
  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!ROLES.includes(admin.role))
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="mx-auto mt-10 max-w-xl rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Not available for your login.
        </p>
      </div>
    );
  // Set before the screen's first request (its effect runs after this render).
  setMigOperatorLogin(false);
  return <MigApprovals role={admin.role} header={<AdminHeader admin={admin} />} />;
}
