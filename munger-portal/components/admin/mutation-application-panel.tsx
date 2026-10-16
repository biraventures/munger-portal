"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { fetchStaffApplication, openApplicationDocument, type StaffApplicationDetail } from "@/lib/mutation-api";

function fmtDate(v: string | null | undefined): string {
  return v ? new Date(v).toLocaleDateString("en-IN") : "-";
}

/** The online mutation application behind a change request: applicant, new owner, transfer, GPS and the uploaded documents. */
export function MutationApplicationPanel({ applicationId }: { applicationId: string }) {
  const [detail, setDetail] = useState<StaffApplicationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStaffApplication(applicationId)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the application."));
  }, [applicationId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!detail) return <Loader2 className="h-4 w-4 animate-spin text-slate-400" />;
  const a = detail.application;
  const row = (label: string, value: React.ReactNode) => (
    <div>
      <span className="text-slate-500">{label}:</span> <span className="text-slate-900">{value || "-"}</span>
    </div>
  );
  const gps = a.latitude && a.longitude ? `${Number(a.latitude).toFixed(6)}, ${Number(a.longitude).toFixed(6)}` : null;

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {row("Application no", <b className="font-mono">{a.application_no}</b>)}
        {row("Submitted", fmtDate(a.submitted_at))}
        {row("New owner", `${a.new_owner_name}${a.new_owner_relation_type ? ` ${a.new_owner_relation_type} ${a.new_owner_relation_name ?? ""}` : ""}`)}
        {row("New owner mobile", a.new_owner_mobile)}
        {row("New owner Aadhaar", a.new_owner_aadhaar)}
        {row("New owner email", a.new_owner_email)}
        {row("Applicant", `${a.applicant_name} (${a.applicant_mobile})`)}
        {row("Basis of mutation", `${a.basis_label}, dated ${fmtDate(a.transfer_date)}`)}
        {a.entered_old_holding_no && row("Entered by applicant", `Old holding ${a.entered_old_holding_no}, ward ${a.entered_ward}, ${a.entered_address}; tax paid till ${a.entered_tax_paid_till ?? "?"}, user charge till ${a.entered_sw_paid_till ?? "?"}`)}
        {row(
          "GPS at holding",
          gps ? (
            <a href={`https://www.google.com/maps?q=${a.latitude},${a.longitude}`} target="_blank" rel="noreferrer" className="text-nnm-blue hover:underline">
              {gps}
              {a.gps_accuracy_m ? ` (±${Math.round(Number(a.gps_accuracy_m))} m)` : ""}
            </a>
          ) : null,
        )}
      </div>
      <div>
        <div className="mb-1 font-medium text-slate-700">Documents</div>
        <div className="flex flex-wrap gap-2">
          {detail.documents.map((d) => (
            <button
              key={d.id}
              onClick={() => openApplicationDocument(a.id, d.id).catch((err) => setError(err instanceof Error ? err.message : "Could not open the document."))}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              title={d.file_name}
            >
              <FileText className="h-3.5 w-3.5" />
              {d.label.split(" (")[0]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
