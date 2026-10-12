import { Router } from "express";
import {
  postSubmitTradeLicenseApplication,
  postSubmitPublicTradeLicenseApplication,
  getRenewalAutofillHandler,
  getTradeLicenseApplicationByNumberHandler,
  putDocumentChecklistItem,
} from "../controllers/tradeLicenseApplication.controller";
import rateLimit from "express-rate-limit";
import { requireOperator } from "../middleware/requireOperator";

export const tradeLicenseApplicationRouter = Router();

// Misses only (a correct holding+mobile is not counted): 5 per holding and 30 overall per IP, per 15 minutes,
// so holding numbers or mobile numbers cannot be stepped through.
const missesOnly = { windowMs: 15 * 60 * 1000, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true, requestWasSuccessful: (_req: unknown, res: { locals: Record<string, unknown> }) => res.locals.autofillMatched === true } as const;
const autofillPerHolding = rateLimit({ ...missesOnly, max: 5, keyGenerator: (req) => `${req.ip}:${String(req.query.holdingNo ?? "").trim().toLowerCase()}`, message: { error: "Too many attempts for this holding. Please wait 15 minutes." } });
const autofillPerIp = rateLimit({ ...missesOnly, max: 30, keyGenerator: (req) => String(req.ip), message: { error: "Too many attempts. Please wait 15 minutes." } });

// GET /api/v1/trade-license-applications/renewal-autofill — public, needs the registered mobile
tradeLicenseApplicationRouter.get("/renewal-autofill", autofillPerIp, autofillPerHolding, getRenewalAutofillHandler);

// GET /api/v1/trade-license-applications/by-number/:applicationNumber — operator only, MUST
// come before any catch-all param routes (none currently exist here, kept for clarity)
tradeLicenseApplicationRouter.get("/by-number/:applicationNumber", requireOperator, getTradeLicenseApplicationByNumberHandler);

// POST /api/v1/trade-license-applications/public — public, a citizen applying directly
tradeLicenseApplicationRouter.post("/public", postSubmitPublicTradeLicenseApplication);

// POST /api/v1/trade-license-applications — operator only, for an application received offline
tradeLicenseApplicationRouter.post("/", requireOperator, postSubmitTradeLicenseApplication);

// PUT /api/v1/trade-license-applications/checklist/:checklistItemId — operator only
tradeLicenseApplicationRouter.put("/checklist/:checklistItemId", requireOperator, putDocumentChecklistItem);