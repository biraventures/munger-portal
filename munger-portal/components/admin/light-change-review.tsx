"use client";

import { ChangeLegend, ReviewSections, type ReviewRow, type Val } from "./change-review";
import type { LightChangeRequest } from "@/lib/streetlight-api";

const STATUS: Record<string, string> = { working: "Working", not_working: "Not working", automatic: "Automatic", joint: "Joint" };
const status = (v: Val) => (v ? STATUS[String(v)] ?? String(v) : "—");
const type = (v: Val) => (v === "high_mast" ? "High Mast" : v === "streetlight" ? "Streetlight" : v ? String(v) : "—");
const yesNo = (v: Val) => (v === true || v === "true" ? "Active" : v === false || v === "false" ? "Deactivated" : "—");

/** Full light details for every desk, with what the request changes highlighted. */
export function LightChangeReview({ r }: { r: LightChangeRequest }) {
  const open = r.status === "pending";
  const snap = r.baseline_data?.light ?? null;
  const live = r.light ?? null;
  // Snapshot has ids; live view has names - names come from the live join.
  const before: Record<string, unknown> | null = !open && snap ? { ...live, switch_status: snap.switch_status, active: snap.active } : live;
  const p = r.proposedView ?? {};
  let rows: ReviewRow[];
  if (r.action_type === "add") {
    rows = [
      { label: "Type", before: null, after: (p.lightType as Val) ?? "streetlight", format: type },
      { label: "Serial number", before: null, after: p.serialNumber as Val },
      { label: "Ward", before: null, after: p.wardName as Val },
      { label: "Locality", before: null, after: p.localityName as Val },
      { label: "Installation agency", before: null, after: p.agencyName as Val },
    ];
  } else {
    const b = before ?? {};
    const after = { ...b };
    if (r.action_type === "status_change") after.switch_status = p.switchStatus;
    if (r.action_type === "deactivate") after.active = false;
    if (r.action_type === "reactivate") after.active = true;
    rows = [
      { label: "Serial number", before: b.serial_number as Val, after: after.serial_number as Val },
      { label: "Type", before: b.light_type as Val, after: after.light_type as Val, format: type },
      { label: "Ward", before: b.ward_name as Val, after: after.ward_name as Val },
      { label: "Locality", before: b.locality_name as Val, after: after.locality_name as Val },
      { label: "Installation agency", before: b.agency_name as Val, after: after.agency_name as Val },
      { label: "Functionality status", before: b.switch_status as Val, after: after.switch_status as Val, format: status },
      { label: "In registry", before: b.active as Val, after: (r.action_type === "delete" ? "deleted" : after.active) as Val, format: (v) => (v === "deleted" ? "Deleted" : yesNo(v)) },
      { label: "Location", before: b.latitude ? `${b.latitude}, ${b.longitude}` : null, after: after.latitude ? `${after.latitude}, ${after.longitude}` : null },
    ];
  }
  return (
    <div className="mt-2 space-y-2">
      <ChangeLegend />
      <ReviewSections sections={[{ title: r.action_type === "add" ? "New light" : "Light", rows }]} onlyChanged={false} />
    </div>
  );
}
