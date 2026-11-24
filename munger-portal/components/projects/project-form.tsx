"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { fetchAttendanceWards, type AttendanceWard } from "@/lib/attendance-api";
import { CATEGORIES, PROJECT_STAGES, STAGE_LABELS, createProject, emptyForm, updateProject, type ProjectForm } from "@/lib/project-api";
import { Card, ErrorLine, inputClass, labelClass, primaryBtn } from "./parts";

/**
 * Add / edit a project (Yojana Prabhari, Commissioner) - the fields of the department's 3 Years Report, in its order,
 * plus the portal's own (type of work, team, agency, work order, payment).
 */
export function ProjectFormView({ id, initial }: { id?: string; initial?: ProjectForm }) {
  const router = useRouter();
  const [f, setF] = useState<ProjectForm>(initial ?? emptyForm());
  const [wards, setWards] = useState<AttendanceWard[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAttendanceWards()
      .then(setWards)
      .catch(() => {});
  }, []);

  const set = <K extends keyof ProjectForm>(k: K, v: ProjectForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const field = (k: keyof ProjectForm, label: string, type: "text" | "date" | "number" | "pct" = "text", placeholder?: string) => (
    <div key={k}>
      <label className={labelClass}>{label}</label>
      <input
        className={inputClass}
        type={type === "pct" ? "number" : type}
        min={type === "number" || type === "pct" ? 0 : undefined}
        max={type === "pct" ? 100 : undefined}
        step={type === "number" ? "0.01" : type === "pct" ? "1" : undefined}
        placeholder={placeholder}
        value={f[k] as string}
        onChange={(e) => set(k, e.target.value as never)}
      />
    </div>
  );
  const category = CATEGORIES.find((c) => c.key === f.category);
  const grid = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const p = id ? await updateProject(id, f) : await createProject(f);
      router.push(`/attendance/projects/${p.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <Card title="Name of work">
        <div className={grid}>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className={labelClass}>Name of work *</label>
            <textarea className={inputClass} rows={3} value={f.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Ward number</label>
            <select className={inputClass} value={f.wardId} onChange={(e) => set("wardId", e.target.value)}>
              <option value="">City-wide (no ward)</option>
              {wards.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.wardName}
                </option>
              ))}
            </select>
          </div>
          {field("financialYear", "Financial year", "text", "2025-26")}
          {field("estimatedCost", "Estimate cost (₹)", "number")}
          {field("projectCode", "Project code", "text", id ? undefined : "Blank = given automatically")}
          <div>
            <label className={labelClass}>Type of work *</label>
            <select className={inputClass} value={f.category} onChange={(e) => set("category", e.target.value)} required>
              <option value="">Select</option>
              <optgroup label="Civil">
                {CATEGORIES.filter((c) => c.discipline === "civil").map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Mechanical">
                {CATEGORIES.filter((c) => c.discipline === "mechanical").map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div>
            <label className={labelClass}>Supervised by</label>
            <select
              className={inputClass}
              value={f.discipline}
              onChange={(e) => set("discipline", e.target.value as ProjectForm["discipline"])}
            >
              <option value="">
                {category
                  ? `${category.discipline === "civil" ? "Civil" : "Mechanical"} team (from the type of work)`
                  : "From the type of work"}
              </option>
              <option value="civil">Civil team</option>
              <option value="mechanical">Mechanical team</option>
              <option value="both">Both civil and mechanical teams</option>
            </select>
          </div>
          {field("schemeName", "Scheme / Yojana")}
          {field("locationText", "Location / site")}
        </div>
      </Card>

      <Card title="Technical approval, A.A. and technical sanction">
        <div className={grid}>
          {field("taSentDate", "Estimate sent for T.A. by ULB", "date")}
          {field("taDate", "Technical approval (T.A.)", "date")}
          {field("approvalNo", "A.A. letter no.")}
          {field("approvalDate", "A.A. letter date", "date")}
          {field("tsSentDate", "Estimate sent for T.S. by ULB", "date")}
          {field("tsDate", "Technical sanction (T.S.)", "date")}
          {field("boqApprovalDate", "BoQ approval", "date")}
        </div>
      </Card>

      <Card title="Tender">
        <div className={grid}>
          {field("tenderDate", "Tender invited", "date")}
          {field("tenderNo", "Tender / NIT no.")}
          {field("techBidOpeningDate", "Technical bid opened", "date")}
          {field("techBidDisposalDate", "Technical bid disposal", "date")}
          {field("csToEeDate", "C.S. with checklist to EE by ULB", "date")}
          {field("csToSeDate", "C.S. to SE by EE", "date")}
          {field("csToCeDate", "C.S. to CE by SE", "date")}
          {field("csToEicDate", "C.S. to EIC by CE", "date")}
          {field("bidderClaim", "Claim by bidder, if any")}
          {field("claimDisposalDate", "Claim disposed", "date")}
          {field("finBidOpeningDate", "Financial bid opened", "date")}
          {field("tenderFinalisedDate", "Tender finalised", "date")}
          {field("finBidToEeDate", "Financial bid to EE by ULB", "date")}
          {field("finBidToSeDate", "Financial bid to SE by EE", "date")}
          {field("finBidToCeDate", "Financial bid to CE by SE", "date")}
          {field("finBidToEicDate", "Financial bid to EIC by CE", "date")}
        </div>
      </Card>

      <Card title="Award, agreement and progress">
        <div className={grid}>
          {field("workAwardedDate", "Work awarded", "date")}
          {field("agreementDate", "Agreement", "date")}
          {field("agencyName", "Agency / contractor")}
          {field("workOrderNo", "Work order no.")}
          {field("workOrderDate", "Work order date", "date")}
          {field("workOrderAmount", "Work order / agreement amount (₹)", "number")}
          {field("targetCompletionDate", "Completion as per agreement", "date")}
          {field("actualStartDate", "Work started", "date")}
          {field("actualCompletionDate", "Actual completion", "date")}
          {field("componentProgressPct", "Main component physical progress (%)", "pct")}
          {field("physicalProgressPct", "Overall physical progress (%)", "pct")}
          {field("financialProgressPct", "Financial progress (%)", "pct")}
          {field("eotReason", "Reason for extension of time")}
          {field("eotDate", "Extension of time granted on", "date")}
        </div>
      </Card>

      <Card title="Payment">
        <div className={grid}>
          {field("paymentAmount", "Amount paid (₹)", "number")}
          {field("paymentDate", "Payment date", "date")}
        </div>
      </Card>

      <Card title="Stage and remarks">
        <div className={grid}>
          <div className="sm:col-span-2">
            <label className={labelClass}>Stage</label>
            <select className={inputClass} value={f.stage} onChange={(e) => set("stage", e.target.value as ProjectForm["stage"])}>
              <option value="">Work it out from the dates and progress (automatic)</option>
              {PROJECT_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className={labelClass}>Remarks</label>
            <textarea className={inputClass} rows={2} value={f.remarks} onChange={(e) => set("remarks", e.target.value)} />
          </div>
        </div>
      </Card>

      <ErrorLine error={error} />
      <button type="submit" disabled={busy} className={primaryBtn}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {id ? "Save changes" : "Add project"}
      </button>
    </form>
  );
}
