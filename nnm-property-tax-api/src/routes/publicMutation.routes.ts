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
