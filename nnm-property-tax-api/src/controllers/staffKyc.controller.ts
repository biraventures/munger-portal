import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import {
  getStaffKyc,
  KYC_DOCS,
  kycFile,
  listStaff,
  pendingForMe,
  review,
  setNumbers,
  submitForReview,
  uploadDoc,
} from "../services/staffKyc.service";

const username = (v: unknown) => {
  const r = z.string().trim().min(1).max(64).safeParse(v);
  if (!r.success) throw ApiError.badRequest("Invalid username");
  return r.data;
};
const docParam = (v: unknown) => {
  const r = z.enum(KYC_DOCS).safeParse(v);
  if (!r.success) throw ApiError.badRequest("Unknown document");
  return r.data;
};

function sendFile(res: Response, full: string) {
  const ext = path.extname(full).toLowerCase();
  res.setHeader("Content-Type", ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : "image/jpeg");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(full).pipe(res);
}

/** GET /admin/staff-kyc?status=&q= */
export const getStaffKycList = asyncHandler(async (req: Request, res: Response) => {
  const q = z.object({ status: z.string().max(20).optional(), q: z.string().max(100).optional() }).parse(req.query);
  res.json({ staff: await listStaff(req.admin!, q) });
});

/** GET /admin/staff-kyc/pending-count */
export const getStaffKycPending = asyncHandler(async (req: Request, res: Response) => {
  res.json({ pending: await pendingForMe(req.admin!) });
});

/** GET /admin/staff-kyc/me | /admin/staff-kyc/:username */
export const getStaffKycOne = asyncHandler(async (req: Request, res: Response) => {
  const u = req.params.username ? username(req.params.username) : req.admin!.username;
  res.json(await getStaffKyc(req.admin!, u));
});

/** GET /admin/staff-kyc/me/file/:doc | /admin/staff-kyc/:username/file/:doc */
export const getStaffKycFile = asyncHandler(async (req: Request, res: Response) => {
  const u = req.params.username ? username(req.params.username) : req.admin!.username;
  sendFile(res, await kycFile(req.admin!, u, docParam(req.params.doc)));
});

/** PUT /admin/staff-kyc/:username/numbers { aadhaarNo, panNo } */
export const putStaffKycNumbers = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ aadhaarNo: z.string().trim().max(20), panNo: z.string().trim().max(12) }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Enter the Aadhaar number and PAN.");
  await setNumbers(req.admin!, username(req.params.username), b.data);
  res.json({ ok: true });
});

/** PUT /admin/staff-kyc/:username/doc/:doc { file: { base64, mime } } */
export const putStaffKycDoc = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ file: z.object({ base64: z.string().min(1), mime: z.string().max(60) }) }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Choose the file to upload.");
  await uploadDoc(req.admin!, username(req.params.username), docParam(req.params.doc), b.data.file);
  res.json({ ok: true });
});

/** POST /admin/staff-kyc/:username/submit */
export const postStaffKycSubmit = asyncHandler(async (req: Request, res: Response) => {
  await submitForReview(req.admin!, username(req.params.username));
  res.json({ ok: true });
});

/** POST /admin/staff-kyc/:username/review { decision: approve | return, remarks } */
export const postStaffKycReview = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ decision: z.enum(["approve", "return"]), remarks: z.string().trim().max(500).nullish() }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Choose approve or send back.");
  res.json(await review(req.admin!, username(req.params.username), b.data.decision, b.data.remarks || null));
});
