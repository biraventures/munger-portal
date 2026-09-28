import { collectionIssueRepository } from "../repositories/collectionIssue.repository";
import { collectionIssueNoticeRepository } from "../repositories/collectionIssueNotice.repository";
import { demandNoticeRepository, type DemandNoticeRow } from "../repositories/demandNotice.repository";
import { propertyRepository } from "../repositories/property.repository";
import { COLLECTION_ISSUE_NOTICE_TEMPLATES } from "../types/collectionIssueNotice.types";
import { ApiError } from "../utils/ApiError";
import type { AdminTokenPayload } from "../types/admin.types";
import type { CollectionIssueNoticeRow } from "../repositories/collectionIssueNotice.repository";
import type { PropertyRow } from "../types/property.types";
import type { CollectionIssueRow, CollectionIssueType } from "../types/collectionIssue.types";
import type { NoticeLanguage } from "../types/collectionIssueNotice.types";

const NOTICE_TYPE_CODE: Record<CollectionIssueType, string> = {
  refused_to_pay: "RTP",
  disputes_tax_amount: "DTA",
  disputes_solid_waste_amount: "DSW",
  absent_door_locked: "ADL",
  under_construction: "UDC",
  disputes_measurement: "DME",
};

function formatNoticeNo(seq: number, issueType: CollectionIssueType, date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${seq}/CIN/${NOTICE_TYPE_CODE[issueType]}/${dd}/${mm}/${yyyy}`;
}

function money(v: string | number): string {
  return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: Date, language: NoticeLanguage): string {
  return d.toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

/** Fallback phrases substituted into the body when a value is missing - these get filled INTO the template text, so they need their own translation rather than following the template's language automatically. */
const FALLBACK_PHRASES: Record<NoticeLanguage, { demandNotGenerated: string; noRemarks: string }> = {
  en: { demandNotGenerated: "Not yet generated", noRemarks: "No further remarks recorded." },
  hi: { demandNotGenerated: "अभी जारी नहीं की गई", noRemarks: "कोई अतिरिक्त टिप्पणी दर्ज नहीं है।" },
};

/** Substitutes {placeholder} tokens in a template body with the actual case details. */
function fillTemplate(
  template: string,
  values: { ownerName: string; holdingNo: string; address: string; ward: string; demandNo: string; totalAmountDemanded: string; issueNotes: string; reportedDate: string; complianceDays: number },
): string {
  return template
    .replace(/\{ownerName\}/g, values.ownerName)
    .replace(/\{holdingNo\}/g, values.holdingNo)
    .replace(/\{address\}/g, values.address)
    .replace(/\{ward\}/g, values.ward)
    .replace(/\{demandNo\}/g, values.demandNo)
    .replace(/\{totalAmountDemanded\}/g, values.totalAmountDemanded)
    .replace(/\{issueNotes\}/g, values.issueNotes)
    .replace(/\{reportedDate\}/g, values.reportedDate)
    .replace(/\{complianceDays\}/g, String(values.complianceDays));
}

export interface GeneratedCollectionIssueNotice {
  record: CollectionIssueNoticeRow;
  property: PropertyRow;
  issue: CollectionIssueRow;
  demandNotice: DemandNoticeRow | null;
  title: string;
  legalBasis: string;
  bodyText: string;
  noticeDate: string;
  complianceDays: number;
  language: NoticeLanguage;
}

/**
 * Generates one of the six standard legal notice formats for a
 * Tax Collector's reported collection issue, in the requested
 * language (English or Hindi) - City Manager only. Picks the most
 * relevant demand notice for the holding (the first still-unsettled
 * one if any, otherwise the most recent one overall) so the
 * generated notice's demand figures and the attached demand notice
 * are always for the same outstanding demand.
 */
export async function generateCollectionIssueNotice(
  collectionIssueId: number,
  admin: AdminTokenPayload,
  language: NoticeLanguage = "en",
): Promise<GeneratedCollectionIssueNotice> {
  const issue = await collectionIssueRepository.findById(collectionIssueId);
  if (!issue) throw ApiError.notFound("Collection issue not found.");

  const property = await propertyRepository.findByHoldingNo(issue.holding_no);
  if (!property) throw ApiError.notFound("Holding not found.");

  const unsettled = await demandNoticeRepository.findUnsettledForHolding(issue.holding_no);
  let demandNotice: DemandNoticeRow | null = unsettled[0] ?? null;
  if (!demandNotice) {
    const all = await demandNoticeRepository.findAllForHolding(issue.holding_no);
    demandNotice = all[0] ?? null;
  }

  const template = COLLECTION_ISSUE_NOTICE_TEMPLATES[issue.issue_type];
  const text = template.text[language];
  const now = new Date();
  const seq = await collectionIssueNoticeRepository.getNextNoticeSeq();
  const noticeNo = formatNoticeNo(seq, issue.issue_type, now);

  const fallback = FALLBACK_PHRASES[language];
  const bodyText = fillTemplate(text.body, {
    ownerName: property.owner_name,
    holdingNo: property.holding_no,
    address: property.address,
    ward: property.ward ?? "-",
    demandNo: demandNotice?.demand_no ?? fallback.demandNotGenerated,
    totalAmountDemanded: demandNotice ? money(demandNotice.total_amount_demanded) : "0.00",
    issueNotes: issue.notes ?? fallback.noRemarks,
    reportedDate: formatDate(issue.reported_at, language),
    complianceDays: template.complianceDays,
  });

  const record = await collectionIssueNoticeRepository.create({
    collectionIssueId,
    noticeNo,
    holdingNo: issue.holding_no,
    demandNo: demandNotice?.demand_no ?? null,
    issueType: issue.issue_type,
    language,
    generatedByUsername: admin.username,
    generatedByDisplayName: admin.displayName,
  });

  return {
    record,
    property,
    issue,
    demandNotice,
    title: text.title,
    legalBasis: text.legalBasis,
    bodyText,
    noticeDate: formatDate(now, language),
    complianceDays: template.complianceDays,
    language,
  };
}

export async function listNoticesForIssue(collectionIssueId: number) {
  return collectionIssueNoticeRepository.listForIssue(collectionIssueId);
}
