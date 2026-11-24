"use client";

import { OperatorHeader } from "@/components/operator-header";
import { MigApprovals } from "@/components/mig-approvals";
import { useOperatorGuard } from "@/lib/use-operator-guard";
import { setMigOperatorLogin } from "@/lib/mig-records-api";

/** Old Records (MIG) - the Operator verifies each uploaded record against the old register and sends it to the Tax Daroga. */
export default function MigRecordsOperatorPage() {
  const operator = useOperatorGuard();
  if (!operator) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  // Set before the screen's first request (its effect runs after this render).
  setMigOperatorLogin(true);
  return <MigApprovals role="operator" header={<OperatorHeader operator={operator} />} />;
}
