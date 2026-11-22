import Link from "next/link";
import { BarChart3 } from "lucide-react";

/** Roles that get the progress report (their own work in a period). */
export const PROGRESS_REPORT_ROLES = [
  "agency_project_manager",
  "agency_team_leader",
  "agency_operator",
  "tax_collector",
  "tax_surveyor",
  "tax_daroga",
  "trade_license_nodal",
  "city_manager",
  "deputy_commissioner",
  "commissioner",
];

/** Dashboard card: My Progress Report. */
export function ProgressReportCard({ role }: { role: string }) {
  if (!PROGRESS_REPORT_ROLES.includes(role)) return null;
  const supervisor = ["commissioner", "deputy_commissioner", "city_manager"].includes(role);
  return (
    <Link
      href="/admin/progress-report"
      className="mb-6 flex items-center gap-4 rounded-xl border border-nnm-blue/30 bg-blue-50/60 p-4 transition-shadow hover:shadow-md"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-nnm-blue text-white">
        <BarChart3 className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-base font-semibold text-slate-900">My Progress Report</span>
        <span className="block text-sm text-slate-600">
          Collection made, changes to holdings, notices, approvals and other work - for today, a week, last month or any period
          {supervisor ? "; also any officer's report" : ""}.
        </span>
      </span>
    </Link>
  );
}
