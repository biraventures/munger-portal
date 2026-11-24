import type { Discipline, ProjectCategory, ProjectStage } from "../types/project.types";

/**
 * The department's "3 Years Report" format - how every scheme / project is entered, uploaded and reported. The
 * columns below are in the report's own order with its own headings (spellings included), so a sheet filled in that
 * format uploads as it is and the portal's download comes out in the same format. A few optional portal columns
 * follow the report's 34.
 */

export type FieldKind = "text" | "date" | "number" | "pct" | "special";
export interface ReportColumn {
  /** The ProjectInput key (or a special one). */
  field: string;
  heading: string;
  /** Other headings the same column is known by (older portal template, small spelling differences). */
  aliases: string[];
  kind: FieldKind;
}

const col = (field: string, heading: string, kind: FieldKind, aliases: string[] = []): ReportColumn => ({ field, heading, kind, aliases });

export const REPORT_COLUMNS: ReportColumn[] = [
  col("srNo", "Sr. No", "special", ["sr no", "s no", "sl no", "serial no", "क्र0 सं0"]),
  col("nameAndCost", "Name of Work\n&\nEstimate Cost", "special", ["name of work & estimate cost", "name of work and estimate cost"]),
  col("wardId", "Ward Number", "special", ["ward", "ward no", "ward number"]),
  col("financialYear", "Financial Year", "text", ["fy", "year"]),
  col("taSentDate", "Date of Sending Estimate for Technical approval by U.L.B (T.A)", "date"),
  col("taDate", "Date of Technical approval (T.A)", "date"),
  col("aaLetter", "Administrative Approval (A.A) Letter No. & Date", "special"),
  col("tsSentDate", "Date of Sending Estimate for Technical Sanction by U.L.B (T.S)", "date"),
  col("tsDate", "Date of Technical Sanction (T.S)", "date"),
  col("boqApprovalDate", "Date of BoQ Approval", "date"),
  col("tenderDate", "Date of Inviting Tender", "date", ["tender date", "nit date"]),
  col("techBidOpeningDate", "Date of Technical Bid opening", "date"),
  col("csToEeDate", "Date of sending Comparative Sheet(C.S) with Check list to EE by ULB", "date"),
  col("csToSeDate", "Date of sending Comparative Sheet (C.S) with Check list to SE by EE", "date"),
  col("csToCeDate", "Date of sending Comparative Sheet (C.S) with Check list to CE by SE", "date"),
  col("csToEicDate", "Date of sending Comparative Sheet (C.S) with check list Engineer-in-Chief (EIC) by CE", "date"),
  col("techBidDisposalDate", "Date of Technical Bid Disposal", "date"),
  col("bidderClaim", "Claim by bidder, if any (only through Eproc-2.0 within claim period)", "text"),
  col("claimDisposalDate", "Date of Disposal of Claim", "date"),
  col("finBidOpeningDate", "Date of Financila Bid opening", "date", ["date of financial bid opening"]),
  col("finBidToEeDate", "Date of sending Financial Bid to EE by ULB", "date"),
  col("finBidToSeDate", "Date of sending Financial Bid to SE by EE", "date"),
  col("finBidToCeDate", "Date of sending Financial Bid to CE by SE", "date"),
  col("finBidToEicDate", "Date of sending Financial Bid Engineer-in-Chief(EIC) by CE", "date"),
  col("workAwardedDate", "Date of work awarded", "date"),
  col("agreementDate", "Date of Agreement", "date"),
  col("targetCompletionDate", "Date of Completion of work as per Agreement", "date", ["target completion date", "target date"]),
  col("actualCompletionDate", "Date of Actual Completion of work", "date", ["actual completion date", "completion date"]),
  col("componentProgressPct", "Main Component wise Physical progress of work (in %)", "pct"),
  col("physicalProgressPct", "Overall Physical Progress of work (in %)", "pct"),
  col("financialProgressPct", "Financial Progress of work (in %)", "pct"),
  col("eotReason", "Reason for Extension of Time, If Any", "text"),
  col("eotDate", "Date of granting Extension of Time, If Any", "date"),
  col("remarks", "Remarks", "text", ["remark", "notes"]),
  // --- Optional portal columns after the report's own. ---
  col("projectCode", "Project Code (portal)", "text", ["project code", "code"]),
  col("category", "Type of Work (optional)", "special", ["type of work", "category"]),
  col("discipline", "Supervised by (Civil / Mechanical / Both)", "special", ["discipline", "supervised by"]),
  col("schemeName", "Scheme / Yojana (optional)", "text", ["scheme", "yojana", "scheme name"]),
  col("estimatedCost", "Estimated Cost (optional)", "number", ["estimated cost", "estimate", "estimated amount"]),
  col("agencyName", "Agency (optional)", "text", ["agency", "agency name", "contractor"]),
  col("workOrderNo", "Work Order No (optional)", "text", ["work order no"]),
  col("workOrderAmount", "Work Order Amount (optional)", "number", ["work order amount", "agreement amount"]),
  col("actualStartDate", "Actual Start Date (optional)", "date", ["actual start date", "start date"]),
  col("paymentAmount", "Payment Amount (optional)", "number", ["payment amount", "amount paid"]),
  col("paymentDate", "Payment Date (optional)", "date", ["payment date"]),
  col("locationText", "Location (optional)", "text", ["location", "site"]),
  col("stage", "Stage (optional - blank = from the dates)", "special", ["stage", "status"]),
  // The older portal template's separate name column.
  col("name", "Project Name", "special", ["name of work", "name", "project", "work name"]),
];

/** Lower-case, letters and digits only - headings are matched on this. */
export const normHeading = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();

// ---------------------------------------------------------------------------------------------------------------------
// The "Name of Work & Estimate Cost" cell
// ---------------------------------------------------------------------------------------------------------------------

/** "... की प्राक्कलित राशि मो0- 57,68,000/- रू0" -> 5768000. */
export function costFromName(text: string): number | null {
  const m =
    text.match(/(?:राशि|रू0|रु0|Rs\.?)\s*(?:मो0)?\s*[-–:]?\s*([\d,]+(?:\.\d+)?)\s*\/?\s*-?/i) ??
    text.match(/([\d,]{5,}(?:\.\d+)?)\s*\/\s*-/);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The name without the trailing estimate-cost phrase. */
export function nameWithoutCost(text: string): string {
  return text
    .replace(/\s*(?:का|की|के)?\s*प्राक्कलि[तक]\s*राशि.*$/s, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "वार्ड नं0- 21" / "वार्ड सं0- 15" in the name. */
export function wardFromName(text: string): string | null {
  const m = text.match(/वार्ड\s*(?:नं|सं|न|संख्या)?0?\.?\s*[-–:]?\s*(\d{1,3})/);
  return m ? String(Number(m[1])) : null;
}

/** "(छठा मद/पन्द्रहवी वित्त के विकास निधि मद से)" in the name -> the scheme. */
export function schemeFromName(text: string): string | null {
  const m = text.match(/\(([^()]*(?:मद|वित्त|योजना|निधि)[^()]*)\)/);
  return m ? m[1]!.replace(/\s+/g, " ").trim() : null;
}

/**
 * Type-of-work words, strongest first. Place names often contain work words ("तालाब के पास", "मेन रोड तक"), so a
 * plain "रोड" / "तालाब" only counts when nothing more specific is in the name.
 */
const KEYWORDS: { re: RegExp; category: ProjectCategory }[] = [
  // "प्याऊ" alone is often a landmark ("प्याऊ होते हुये"): it counts with a work word after it.
  { re: /सबमर्सिबल|(?:प्याऊ|पियाऊ|चापाकल)\s*(?:का\s*|की\s*)?(?:अधिष्ठापन|निर्माण|मरम्मति|स्थापना)|submersible|pyau|piyau/i, category: "submersible_pyau" },
  { re: /स्ट्रीट\s*लाइट|हाई\s*मास्ट|street\s*light|high\s*mast/i, category: "streetlight_highmast" },
  { re: /जलापूर्ति|पम्प|पंप|water\s*supply|pump/i, category: "water_supply_pump" },
  { re: /विद्युत|electrical/i, category: "electrical" },
  { re: /बिटुमिनस|कालीकरण|bitumin/i, category: "road_bituminous" },
  { re: /पी0\s*सी0\s*सी0|पीसीसी|\bpcc\b|पेवर|पेभर|paver/i, category: "road_pcc" },
  { re: /नाला|नाली|ड्रेन|पुलिया|कलवर्ट|drain|culvert/i, category: "drain" },
  { re: /चहारदीवारी|चारदीवारी|बाउंड्री|boundary\s*wall/i, category: "boundary_wall" },
  { re: /भवन|शौचालय|यूरिनल|building|toilet/i, category: "building" },
  { re: /पार्क|घाट|ground|park/i, category: "park_pond" },
  { re: /रोड|सड़क|सडक|road/i, category: "road_pcc" },
  { re: /तालाब|पोखर|pond/i, category: "park_pond" },
];
const MECHANICAL: ProjectCategory[] = ["submersible_pyau", "streetlight_highmast", "water_supply_pump", "electrical"];
/**
 * Civil construction that needs the civil team too when it comes with mechanical work - not when the word only names
 * a landmark ("बड़ा नाला के पास", "सामुदायिक भवन के पास", "नाला से ... तक").
 */
const CIVIL_WORK =
  /(?:पी0\s*सी0\s*सी0|पीसीसी|\bpcc\b|नाला|नाली|ड्रेन|पेवर|पेभर|भवन|चहारदीवारी)(?![^(]{0,3}(?:के\s*(?:पास|नजदीक|निकट|सामने|पीछे)|होते|से\s|तक))/i;

/** Type of work from the name: the strongest kind of work named; mechanical work with civil construction = both teams. */
export function guessCategory(text: string): { category: ProjectCategory; discipline: Discipline } {
  const hit = KEYWORDS.find((k) => k.re.test(text));
  if (!hit) return { category: "other_civil", discipline: "civil" };
  if (!MECHANICAL.includes(hit.category)) return { category: hit.category, discipline: "civil" };
  return { category: hit.category, discipline: CIVIL_WORK.test(text) ? "both" : "mechanical" };
}

/** "2870,\n28.11.2023" / "384\n03.02.2026" / "1329, 03.07.2025" -> letter no + date text. */
export function splitLetter(text: string): { no: string | null; date: string | null } {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || t === "-") return { no: null, date: null };
  const d = t.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{4,5})\s*$/);
  const no = (d ? t.slice(0, d.index) : t).replace(/[,\s]+$/, "").trim();
  return { no: no || null, date: d ? d[1]! : null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Stage from the dates
// ---------------------------------------------------------------------------------------------------------------------

export interface StageFacts {
  tenderDate?: string | null;
  techBidDisposalDate?: string | null;
  finBidOpeningDate?: string | null;
  workAwardedDate?: string | null;
  agreementDate?: string | null;
  workOrderDate?: string | null;
  actualStartDate?: string | null;
  actualCompletionDate?: string | null;
  physicalProgressPct?: number | null;
  financialProgressPct?: number | null;
  paymentDate?: string | null;
  remarks?: string | null;
}

/** Remarks that mean the tender / scheme was dropped ("... रद्द"). */
export const isCancelledRemark = (r: string | null | undefined) => !!r && /रद्द|cancel/i.test(r);

/** The stage a project's dates and progress show it has reached. */
export function stageFromFacts(f: StageFacts): ProjectStage {
  const phys = f.physicalProgressPct ?? null;
  if (f.financialProgressPct !== null && f.financialProgressPct !== undefined && f.financialProgressPct >= 100) return "payment_done";
  if (f.paymentDate) return "payment_done";
  if (f.actualCompletionDate || (phys !== null && phys >= 100)) return "completed";
  if ((phys !== null && phys > 0) || f.actualStartDate) return "in_progress";
  if (f.agreementDate || f.workAwardedDate || f.workOrderDate) return "work_order_issued";
  if (isCancelledRemark(f.remarks)) return "cancelled";
  if (f.finBidOpeningDate || f.techBidDisposalDate) return "tender_finalised";
  if (f.tenderDate) return "tendered";
  return "approved";
}

/** Order for "only move forward" on re-upload. */
export const STAGE_RANK: Record<ProjectStage, number> = {
  cancelled: -1,
  approved: 0,
  tendered: 1,
  tender_finalised: 2,
  work_order_issued: 3,
  in_progress: 4,
  completed: 5,
  past_completed: 5,
  payment_done: 6,
};
