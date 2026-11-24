import type { Request, Response } from "express";
import { z } from "zod";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { collectionIssueRepository } from "../repositories/collectionIssue.repository";
import { propertyRepository } from "../repositories/property.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { collectorWardScope } from "../middleware/collectorWardGuard";
import {
  decideRemoval,
  receivingFile,
  receivingLog,
  removedFile,
  reopenIssue,
  requestRemoval,
  resolveIssue,
  uploadReceiving,
  workflowCounts,
  autoResolvePaid,
} from "../services/collectionIssueWorkflow.service";

const ISSUE_TYPES = ["refused_to_pay", "disputes_tax_amount", "disputes_solid_waste_amount", "absent_door_locked", "under_construction", "disputes_measurement"] as const;

const postIssueSchema = z.object({
  issueType: z.enum(ISSUE_TYPES),
  notes: z.string().max(2000).optional(),
});

/** POST /api/v1/properties/:holdingNo/collection-issue - a Tax Collector reports that the taxpayer is creating a problem during collection (refusing to pay, disputing an amount, not available, etc). Purely a log for oversight - doesn't trigger a workflow. */
export const postReportCollectionIssue = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = z.object({ holdingNo: holdingNoSchema }).safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const bodyParsed = postIssueSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  if (!req.admin || req.admin.role !== "tax_collector") throw new ApiError(403, "Only a Tax Collector can report a collection issue.");

  const property = await propertyRepository.findByHoldingNo(paramsParsed.data.holdingNo);
  if (!property) throw ApiError.notFound("Holding not found.");

  const issue = await collectionIssueRepository.create(
    paramsParsed.data.holdingNo,
    bodyParsed.data.issueType,
    bodyParsed.data.notes?.trim() || null,
    req.admin.username,
    req.admin.displayName,
  );
  res.status(200).json({ issue });
});

/** GET /api/v1/properties/:holdingNo/collection-issues - every issue reported for this holding, most recent first. */
export const listCollectionIssuesForHolding = asyncHandler(async (req: Request, res: Response) => {
  const parsed = z.object({ holdingNo: holdingNoSchema }).safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid holding number");
  const issues = await collectionIssueRepository.listForHoldingWithNotices(parsed.data.holdingNo);
  res.status(200).json({ issues });
});

const listQuerySchema = z.object({
  status: z.enum(["pending", "noticed", "open", "notice_issued", "resolved", "unresolved", "receiving_missing", "removal"]).optional(),
});

/**
 * GET /api/v1/admin/collection-issues?status=pending|noticed - the
 * City Manager / Tax Daroga / Commissioner worklist, each issue with
 * its notices attached. "pending" = no notice raised yet, so an issue
 * leaves it as soon as a notice is generated; "noticed" = already
 * has a notice (where reprints are found); omitted = everything.
 */
export const listAllCollectionIssues = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid status");
  await autoResolvePaid();
  const issues = await collectionIssueRepository.listWithNotices(parsed.data.status);
  res.status(200).json({ issues });
});

/** GET /api/v1/admin/collection-issues/mine - the signed-in Tax Collector's own reported issues with any notices raised on them. */
export const listMyCollectionIssues = asyncHandler(async (req: Request, res: Response) => {
  if (!req.admin) throw new ApiError(401, "Not signed in.");
  await autoResolvePaid();
  const issues = await collectionIssueRepository.listForReporterWithNotices(req.admin.username, (await collectorWardScope(req.admin)) ?? []);
  res.status(200).json({ issues });
});

// ---------- status and receiving copies (migration 191) ----------

const idOf = (v: unknown) => {
  const id = z.coerce.number().int().positive().safeParse(v);
  if (!id.success) throw ApiError.badRequest("Invalid id");
  return id.data;
};

/** POST /api/v1/admin/collection-issues/:id/resolve { note } - City Manager / Commissioner. */
export const postResolveCollectionIssue = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ note: z.string().trim().min(3, "Write how the issue was resolved").max(1000) }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Write the note.");
  await resolveIssue(idOf(req.params.id), b.data.note, req.admin!);
  res.status(200).json({ ok: true });
});

/** POST /api/v1/admin/collection-issues/:id/reopen - City Manager / Commissioner. */
export const postReopenCollectionIssue = asyncHandler(async (req: Request, res: Response) => {
  await reopenIssue(idOf(req.params.id), req.admin!);
  res.status(200).json({ ok: true });
});

/** GET /api/v1/admin/collection-issues/counts - open issues, notices issued, removals waiting for the DMC. */
export const getCollectionIssueCounts = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json(await workflowCounts());
});

/** POST /api/v1/admin/collection-issue-notices/:id/receiving { file } - photo or PDF. */
export const postCiReceiving = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ file: z.object({ base64: z.string().min(10).max(12_000_000), mime: z.string().max(40) }) }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Take a photo of the receiving copy or attach it (photo / PDF).");
  await uploadReceiving(String(idOf(req.params.id)), b.data.file, req.admin!);
  res.status(200).json({ ok: true });
});

/** GET /api/v1/admin/collection-issue-notices/:id/receiving */
export const getCiReceiving = asyncHandler(async (req: Request, res: Response) => {
  res.sendFile(await receivingFile(String(idOf(req.params.id)), req.admin!));
});

/** POST /api/v1/admin/collection-issue-notices/:id/receiving/remove-request { reason } */
export const postCiRemovalRequest = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ reason: z.string().trim().min(5, "Write why the receiving copy should be removed").max(500) }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Write the reason.");
  await requestRemoval(String(idOf(req.params.id)), b.data.reason, req.admin!);
  res.status(200).json({ ok: true });
});

/** POST /api/v1/admin/collection-issue-notices/:id/receiving/remove-decision { approve, remark } - DMC. */
export const postCiRemovalDecision = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ approve: z.boolean(), remark: z.string().trim().max(500).nullish() }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Approve or reject.");
  await decideRemoval(String(idOf(req.params.id)), b.data.approve, b.data.remark ?? null, req.admin!);
  res.status(200).json({ ok: true });
});

/** GET /api/v1/admin/collection-issue-notices/:id/receiving/log */
export const getCiReceivingLog = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ log: await receivingLog(String(idOf(req.params.id))) });
});

/** GET /api/v1/admin/collection-issue-notices/receiving-removed/:logId */
export const getCiRemovedCopy = asyncHandler(async (req: Request, res: Response) => {
  res.sendFile(await removedFile(String(idOf(req.params.logId))));
});
