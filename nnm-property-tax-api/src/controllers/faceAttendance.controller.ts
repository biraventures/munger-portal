import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import {
  createChallenge,
  enrolFace,
  enrolmentPhoto,
  faceConfig,
  facePunch,
  faceSummary,
  listForReview,
  punchPhoto,
  removeEnrolment,
  reviewPunch,
  wardEnrolmentStatus,
} from "../services/faceAttendance.service";

const idParam = z.object({ id: z.coerce.number().int().positive() });
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const getFaceConfig = asyncHandler(async (_req: Request, res: Response) => {
  res.json(faceConfig());
});

export const postFaceChallenge = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ staffId: z.coerce.number().int().positive(), purpose: z.enum(["in", "out", "enrol"]) }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Invalid request");
  res.json(await createChallenge(req.attendanceUser!, b.data.staffId, b.data.purpose));
});

const photosSchema = z.object({ challengeId: z.string().uuid(), frontImage: z.string().min(100), turnImage: z.string().min(100) });

export const postFacePunch = asyncHandler(async (req: Request, res: Response) => {
  const b = photosSchema.safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Both photos are required.");
  res.json(await facePunch(req.attendanceUser!, b.data.challengeId, b.data.frontImage, b.data.turnImage));
});

export const postFaceEnrol = asyncHandler(async (req: Request, res: Response) => {
  const b = photosSchema.extend({ consent: z.boolean() }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Both photos and the consent tick are required.");
  res.status(201).json(await enrolFace(req.attendanceUser!, b.data.challengeId, b.data.frontImage, b.data.turnImage, b.data.consent));
});

export const deleteFaceEnrolment = asyncHandler(async (req: Request, res: Response) => {
  const p = idParam.safeParse({ id: req.params.staffId });
  if (!p.success) throw ApiError.badRequest("Invalid staff id");
  res.json(await removeEnrolment(req.attendanceUser!, p.data.id));
});

export const getWardFaceEnrolments = asyncHandler(async (req: Request, res: Response) => {
  const p = idParam.safeParse({ id: req.params.wardId });
  if (!p.success) throw ApiError.badRequest("Invalid ward id");
  res.json({ staff: await wardEnrolmentStatus(p.data.id) });
});

export const getFaceEnrolmentPhoto = asyncHandler(async (req: Request, res: Response) => {
  const p = idParam.safeParse({ id: req.params.staffId });
  if (!p.success) throw ApiError.badRequest("Invalid staff id");
  res.json(await enrolmentPhoto(p.data.id));
});

export const getFaceReview = asyncHandler(async (req: Request, res: Response) => {
  const q = z
    .object({ kind: z.enum(["pending", "rejected", "all"]).default("pending"), date: dateStr.optional(), wardId: z.coerce.number().int().positive().optional() })
    .safeParse(req.query);
  if (!q.success) throw ApiError.badRequest("Invalid filter");
  res.json({ entries: await listForReview(q.data) });
});

export const getFacePunchPhoto = asyncHandler(async (req: Request, res: Response) => {
  const p = idParam.safeParse(req.params);
  if (!p.success) throw ApiError.badRequest("Invalid id");
  res.json(await punchPhoto(p.data.id));
});

export const postFaceReview = asyncHandler(async (req: Request, res: Response) => {
  const p = idParam.safeParse(req.params);
  const b = z.object({ decision: z.enum(["accepted", "rejected"]), remarks: z.string().max(500).nullish() }).safeParse(req.body);
  if (!p.success || !b.success) throw ApiError.badRequest("Invalid request");
  res.json(await reviewPunch(req.attendanceUser!, p.data.id, b.data.decision, b.data.remarks ?? null));
});

export const getFaceSummary = asyncHandler(async (req: Request, res: Response) => {
  const d = typeof req.query.date === "string" && dateStr.safeParse(req.query.date).success ? req.query.date : undefined;
  res.json(await faceSummary(d));
});
