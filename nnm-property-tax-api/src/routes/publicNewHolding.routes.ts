import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  deleteDocument,
  getDraftDocuments,
  getStatus,
  postCreateRequest,
  postDocument,
  postSubmit,
  postView,
  putEdit,
  putUpdateDraft,
} from "../controllers/newHoldingRequest.controller";

/** Public window: request a holding for a property that was never surveyed. No login; rate-limited. */
export const publicNewHoldingRouter = Router();

const base = { standardHeaders: true, legacyHeaders: false } as const;
const createLimit = rateLimit({ ...base, windowMs: 60 * 60 * 1000, max: 10, message: { error: "Too many requests from this connection. Please try again later." } });
const uploadLimit = rateLimit({ ...base, windowMs: 60 * 60 * 1000, max: 150, message: { error: "Too many uploads. Please try again later." } });
const statusLimit = rateLimit({ ...base, windowMs: 15 * 60 * 1000, max: 60, message: { error: "Too many requests. Please wait 15 minutes." } });
// Opening a request needs the application number + mobile; only misses count, so the pair cannot be guessed.
const viewMisses = {
  ...base,
  windowMs: 15 * 60 * 1000,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req: unknown, res: { locals: Record<string, unknown> }) => res.locals.viewMatched === true,
} as const;
const viewPerApplication = rateLimit({ ...viewMisses, max: 5, keyGenerator: (req) => `${req.ip}:${String(req.body?.applicationNo ?? "").trim().toUpperCase()}`, message: { error: "Too many attempts for this application. Please wait 15 minutes." } });
const viewPerIp = rateLimit({ ...viewMisses, max: 20, keyGenerator: (req) => String(req.ip), message: { error: "Too many attempts. Please wait 15 minutes." } });

publicNewHoldingRouter.post("/requests", createLimit, postCreateRequest);
publicNewHoldingRouter.put("/requests/:id", uploadLimit, putUpdateDraft);
publicNewHoldingRouter.post("/requests/:id/documents", uploadLimit, postDocument);
publicNewHoldingRouter.get("/requests/:id/documents", uploadLimit, getDraftDocuments);
publicNewHoldingRouter.delete("/requests/:id/documents/:docId", uploadLimit, deleteDocument);
publicNewHoldingRouter.post("/requests/:id/submit", uploadLimit, postSubmit);
publicNewHoldingRouter.get("/status/:applicationNo", statusLimit, getStatus);
publicNewHoldingRouter.post("/view", viewPerIp, viewPerApplication, postView);
publicNewHoldingRouter.put("/edit/:id", uploadLimit, putEdit);
