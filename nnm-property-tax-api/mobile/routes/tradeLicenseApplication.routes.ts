import { Router } from "express";
import {
  postSubmitTradeLicenseApplication,
  postSubmitPublicTradeLicenseApplication,
  getRenewalAutofillHandler,
  getTradeLicenseApplicationByNumberHandler,
  putDocumentChecklistItem,
} from "../controllers/tradeLicenseApplication.controller";
import { requireOperator } from "../middleware/requireOperator";

export const tradeLicenseApplicationRouter = Router();

// GET /api/v1/trade-license-applications/renewal-autofill — public
tradeLicenseApplicationRouter.get("/renewal-autofill", getRenewalAutofillHandler);

// GET /api/v1/trade-license-applications/by-number/:applicationNumber — operator only, MUST
// come before any catch-all param routes (none currently exist here, kept for clarity)
tradeLicenseApplicationRouter.get("/by-number/:applicationNumber", requireOperator, getTradeLicenseApplicationByNumberHandler);

// POST /api/v1/trade-license-applications/public — public, a citizen applying directly
tradeLicenseApplicationRouter.post("/public", postSubmitPublicTradeLicenseApplication);

// POST /api/v1/trade-license-applications — operator only, for an application received offline
tradeLicenseApplicationRouter.post("/", requireOperator, postSubmitTradeLicenseApplication);

// PUT /api/v1/trade-license-applications/checklist/:checklistItemId — operator only
tradeLicenseApplicationRouter.put("/checklist/:checklistItemId", requireOperator, putDocumentChecklistItem);