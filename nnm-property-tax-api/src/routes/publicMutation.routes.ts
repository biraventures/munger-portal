import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  deleteDraftDocument,
  getApplicationStatus,
  getDraftDocuments,
  getHoldingForMutation,
  postApplicationDocument,
  postCreateApplication,
  postSubmitApplication,
  postOpenForEdit,
  putEditApplication,
  postEditDocument,
  deleteEditDocument,
} from "../controllers/mutationApplication.controller";

/** Public online mutation window - no login. Rate-limited so holdings and applications cannot be stepped through. */
export const publicMutationRouter = Router();

const base = { standardHeaders: true, legacyHeaders: false } as const;
const lookupLimit = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 30,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.locals.lookupMatched === true,
  message: { error: "Too many holding numbers tried. Please wait 15 minutes." },
});
const createLimit = rateLimit({ ...base, windowMs: 60 * 60 * 1000, max: 10, message: { error: "Too many applications from this connection. Please try again later." } });
const uploadLimit = rateLimit({ ...base, windowMs: 60 * 60 * 1000, max: 120, message: { error: "Too many uploads. Please try again later." } });
const statusLimit = rateLimit({ ...base, windowMs: 15 * 60 * 1000, max: 60, message: { error: "Too many requests. Please wait 15 minutes." } });

publicMutationRouter.get("/holding/:holdingNo", lookupLimit, getHoldingForMutation);
publicMutationRouter.post("/applications", createLimit, postCreateApplication);
publicMutationRouter.post("/applications/:id/documents", uploadLimit, postApplicationDocument);
publicMutationRouter.get("/applications/:id/documents", uploadLimit, getDraftDocuments);
publicMutationRouter.delete("/applications/:id/documents/:docId", uploadLimit, deleteDraftDocument);
publicMutationRouter.post("/applications/:id/submit", uploadLimit, postSubmitApplication);
publicMutationRouter.get("/status/:applicationNo", statusLimit, getApplicationStatus);

// Applicant edits after submission: opening needs application no + mobile + holding no; only misses count (5 per 15 min
// per application number, 20 per IP), so the three cannot be guessed.
const editMisses = {
  ...base,
  windowMs: 15 * 60 * 1000,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req: unknown, res: { locals: Record<string, unknown> }) => res.locals.editMatched === true,
} as const;
const editPerApplication = rateLimit({ ...editMisses, max: 5, keyGenerator: (req) => `${req.ip}:${String(req.body?.applicationNo ?? "").trim().toUpperCase()}`, message: { error: "Too many attempts for this application. Please wait 15 minutes." } });
const editPerIp = rateLimit({ ...editMisses, max: 20, keyGenerator: (req) => String(req.ip), message: { error: "Too many attempts. Please wait 15 minutes." } });
publicMutationRouter.post("/edit/open", editPerIp, editPerApplication, postOpenForEdit);
publicMutationRouter.put("/edit/:id", uploadLimit, putEditApplication);
publicMutationRouter.post("/edit/:id/documents", uploadLimit, postEditDocument);
publicMutationRouter.delete("/edit/:id/documents/:docId", uploadLimit, deleteEditDocument);
