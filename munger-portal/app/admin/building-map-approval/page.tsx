"use client";

import { AlertCircle, ClipboardCheck } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";

export default function BuildingMapApprovalPage() {
  const admin = useAdminGuard();

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (admin.role !== "assistant_architect") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Assistant Architect.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <ClipboardCheck className="h-6 w-6" />
          Building Map Approval
        </h1>
        <p className="mb-6 text-sm text-slate-500">Review and approve submitted building maps.</p>

        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          This section isn&apos;t built yet - building map submission and approval will appear here.
        </div>
      </main>
    </div>
  );
}
