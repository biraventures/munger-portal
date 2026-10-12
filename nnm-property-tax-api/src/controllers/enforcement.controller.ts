import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import * as enc from "../services/encroachment.service";
import * as mc from "../services/mobileCourt.service";
import {
  ALL_MODULE_ROLES, ENCROACHMENT_OFFICER, ENCROACHMENT_STAFF, MOBILE_COURT_OFFICER, MOBILE_COURT_STAFF,
  actorOf, findMedia, getFine, receiveMedia, recordPosPayment, resolveMediaFile, signMediaLink, verifyMediaLink,
  type EnforcementModule,
} from "../services/enforcementCommon.service";

const idParam = z.coerce.number().int().positive();
const id = (req: Request, name = "id") => {
  const p = idParam.safeParse(req.params[name]);
  if (!p.success) throw ApiError.badRequest("Invalid id");
  return p.data;
};
const mediaId = z.coerce.number().int().positive();

const WRITERS: Record<EnforcementModule, string[]> = {
  encroachment: [...ENCROACHMENT_OFFICER, ...ENCROACHMENT_STAFF],
  mobile_court: [...MOBILE_COURT_OFFICER, ...MOBILE_COURT_STAFF],
};

// ------------------------------------------------------------------ shared: media and fines

/** POST /enforcement/media?module=...&purpose=...&lat=&lng= - the file itself is the request body. */
export const postMedia = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorOf(req);
  const module = req.query.module === "encroachment" || req.query.module === "mobile_court" ? req.query.module : null;
  if (!module) throw ApiError.badRequest("Unknown module.");
  if (!WRITERS[module].includes(actor.role)) throw new ApiError(403, "Not authorized for this action.");
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const media = await receiveMedia(req, module, String(req.query.purpose ?? ""), { lat: Number.isFinite(lat) ? lat : undefined, lng: Number.isFinite(lng) ? lng : undefined }, actor);
  res.status(201).json({ media, link: signMediaLink(media.id).path });
});

/** GET /enforcement/media/:id/file?exp=&sig= - signed, short-lived link (so <img>/<video> tags can load it). Supports video seeking. */
export const getMediaFile = asyncHandler(async (req: Request, res: Response) => {
  const mid = String(req.params.id);
  if (!verifyMediaLink(mid, req.query.exp, req.query.sig)) throw new ApiError(403, "This link has expired - reload the page.");
  const m = await findMedia(Number(mid));
  if (!m) throw ApiError.notFound("File not found.");
  res.setHeader("Content-Type", m.mime_type);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=300");
  // The portal and the API may be on different origins; helmet defaults to same-origin, which would block <img>/<video>.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.sendFile(resolveMediaFile(m.file_path));
});

const posSchema = z.object({ posTxnRef: z.string().trim().min(4).max(100) });

/** POST /enforcement/fines/:id/pos-payment - officer records the POS transaction (until the gateway integration does it). */
export const postPosPayment = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorOf(req);
  const fineId = id(req);
  const fine = await getFine(fineId);
  if (!fine) throw ApiError.notFound("Fine not found.");
  const officers: string[] = fine.module === "encroachment" ? ENCROACHMENT_OFFICER : MOBILE_COURT_OFFICER;
  if (!officers.includes(actor.role)) throw new ApiError(403, "Only the officer who imposed the fine can record its payment.");
  const b = posSchema.safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Enter the POS transaction reference shown on the machine's slip.");
  res.status(200).json({ fine: await recordPosPayment(fineId, b.data.posTxnRef, actor) });
});

/** GET /enforcement/fines/:id - for the printable fine memo. */
export const getFineHandler = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorOf(req);
  const fine = await getFine(id(req));
  if (!fine) throw ApiError.notFound("Fine not found.");
  if (!ALL_MODULE_ROLES[fine.module as EnforcementModule].includes(actor.role)) throw new ApiError(403, "Not authorized for this action.");
  res.status(200).json({ fine });
});

// ------------------------------------------------------------------ encroachment

const newEncSchema = z.object({
  kind: z.string(), ward: z.string().nullish(), locationText: z.string(), description: z.string(),
  latitude: z.coerce.number(), longitude: z.coerce.number(), encroacherName: z.string(), encroacherPhone: z.string(),
  encroacherAddress: z.string().nullish(), photoMediaId: mediaId.nullish(),
});
const fineSchema = z.object({ amount: z.coerce.number(), legalBasis: z.string(), reason: z.string(), email: z.string().nullish() });
const bad = (e: z.ZodError) => ApiError.badRequest("Please fill in all the required fields.", e.flatten().fieldErrors);

export const encList = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query;
  res.status(200).json({ cases: await enc.listCases(actorOf(req), { kind: String(q.kind ?? ""), status: String(q.status ?? ""), q: String(q.q ?? "") }) });
});
export const encCreate = asyncHandler(async (req: Request, res: Response) => {
  const b = newEncSchema.safeParse(req.body);
  if (!b.success) throw bad(b.error);
  res.status(201).json(await enc.createCase(b.data, actorOf(req)));
});
export const encGet = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await enc.getCase(id(req), actorOf(req)));
});
export const encServeTemporary = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ proofMode: z.string(), proofMediaId: mediaId, noticeText: z.string().nullish() }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Upload the photo of the notice or the video of miking, then submit.");
  res.status(200).json(await enc.serveTemporaryNotice(id(req), { ...b.data, noticeText: b.data.noticeText ?? undefined }, actorOf(req)));
});
export const encRemoved = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ remarks: z.string().nullish(), photoMediaId: mediaId.nullish() }).safeParse(req.body);
  if (!b.success) throw bad(b.error);
  res.status(200).json(await enc.markRemoved(id(req), { remarks: b.data.remarks ?? undefined, photoMediaId: b.data.photoMediaId }, actorOf(req)));
});
export const encFine = asyncHandler(async (req: Request, res: Response) => {
  const b = fineSchema.safeParse(req.body);
  if (!b.success) throw bad(b.error);
  res.status(201).json(await enc.imposeFine(id(req), b.data, actorOf(req)));
});
export const encIssuePermanentNotice = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ noticeText: z.string() }).safeParse(req.body);
  if (!b.success) throw bad(b.error);
  res.status(200).json(await enc.issuePermanentNotice(id(req), b.data, actorOf(req)));
});
export const encPermanentNoticeServed = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ signedCopyMediaId: mediaId }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Upload a photo of the signed notice, then submit.");
  res.status(200).json(await enc.markPermanentNoticeServed(id(req), b.data, actorOf(req)));
});
export const encMeasurementOrder = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ aminName: z.string(), orderText: z.string(), dueDate: z.string().nullish() }).safeParse(req.body);
  if (!b.success) throw bad(b.error);
  res.status(200).json(await enc.issueMeasurementOrder(id(req), b.data, actorOf(req)));
});
export const encMeasurementReport = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ reportText: z.string(), reportMediaId: mediaId.nullish() }).safeParse(req.body);
  if (!b.success) throw bad(b.error);
  res.status(200).json(await enc.recordMeasurementReport(id(req), b.data, actorOf(req)));
});
export const encFinalOrder = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ decision: z.string(), orderText: z.string(), orderDate: z.string() }).safeParse(req.body);
  if (!b.success) throw bad(b.error);
  res.status(200).json(await enc.passFinalOrder(id(req), b.data, actorOf(req)));
});

// ------------------------------------------------------------------ mobile court

export const mcOptions = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ violationTypes: mc.VIOLATION_TYPES });
});
export const mcList = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ cases: await mc.listCases(actorOf(req), { status: String(req.query.status ?? ""), q: String(req.query.q ?? "") }) });
});
export const mcCreate = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({
    violatorName: z.string(), violatorPhone: z.string(), violatorEmail: z.string(), violationType: z.string(), description: z.string().nullish(),
    ward: z.string().nullish(), locationText: z.string(), latitude: z.coerce.number(), longitude: z.coerce.number(), evidenceMediaId: mediaId.nullish(),
  }).safeParse(req.body);
  if (!b.success) throw bad(b.error);
  res.status(201).json(await mc.recordViolation(b.data, actorOf(req)));
});
export const mcGet = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await mc.getCase(id(req), actorOf(req)));
});
export const mcNotice = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ noticeText: z.string(), rectifyWithinDays: z.coerce.number(), mikingVideoId: mediaId.nullish() }).safeParse(req.body);
  if (!b.success) throw bad(b.error);
  res.status(200).json(await mc.issueNotice(id(req), b.data, actorOf(req)));
});
export const mcFollowup = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ outcome: z.string(), remarks: z.string().nullish(), evidenceMediaId: mediaId.nullish(), latitude: z.coerce.number().optional(), longitude: z.coerce.number().optional() }).safeParse(req.body);
  if (!b.success) throw bad(b.error);
  res.status(200).json(await mc.recordFollowup(id(req), { ...b.data, remarks: b.data.remarks ?? undefined }, actorOf(req)));
});
export const mcFine = asyncHandler(async (req: Request, res: Response) => {
  const b = fineSchema.safeParse(req.body);
  if (!b.success) throw bad(b.error);
  res.status(201).json(await mc.imposeFine(id(req), b.data, actorOf(req)));
});
export const mcClose = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await mc.closeCase(id(req), actorOf(req)));
});
export const mcListVideos = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ videos: await mc.listMikingVideos() });
});
export const mcAddVideo = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ title: z.string(), areaText: z.string(), ward: z.string().nullish(), recordedOn: z.string(), messageText: z.string().nullish(), mediaId }).safeParse(req.body);
  if (!b.success) throw bad(b.error);
  res.status(201).json(await mc.addMikingVideo(b.data, actorOf(req)));
});
