import { Router } from "express";
import { getPropertyByHoldingNo, postPropertyLookup, postRecordPropertySurvey, getPropertySurveyList } from "../controllers/property.controller";
import { listPendingOperatorEntryHandler, submitOperatorEntryHandler } from "../controllers/migratedHoldingSurvey.controller";
import { saveProperty } from "../controllers/propertySave.controller";
import { postPayment, getPaymentHistory, getReceiptReprint } from "../controllers/payment.controller";
import { postInitiateOnlinePayment } from "../controllers/onlinePayment.controller";
import { createNewEntryProperty, previewNextHoldingNo } from "../controllers/newEntry.controller";
import {
  postGenerateDemandNotice,
  getUnsettledDemandNotices,
  getDemandNoticeHistory,
  getDemandNoticeReprint,
} from "../controllers/demandNotice.controller";
import { postPreviewTax } from "../controllers/taxPreview.controller";
import { postRequestCancellation } from "../controllers/cancellationRequest.controller";
import { requireOperator } from "../middleware/requireOperator";
import { requireOperatorOrAdmin } from "../middleware/requireOperatorOrAdmin";

export const propertyRouter = Router();

// GET /api/v1/properties/next-holding-no?mode=new|partiallyKnown — MUST
// come before GET /:holdingNo below, or Express would treat
// "next-holding-no" as a literal holding number to search for.
propertyRouter.get("/next-holding-no", requireOperator, previewNextHoldingNo);

// GET /api/v1/properties/survey-list?status=to_be_surveyed|surveyed -
// same ordering reason as next-holding-no above.
propertyRouter.get("/survey-list", requireOperatorOrAdmin, getPropertySurveyList);

// GET /api/v1/properties/migrated-holdings/pending-entry - the
// operator worklist for MUNG-MIG- holdings forwarded by a Tax Daroga.
// Same ordering reason as next-holding-no above.
propertyRouter.get("/migrated-holdings/pending-entry", requireOperatorOrAdmin, listPendingOperatorEntryHandler);

// POST /api/v1/properties/preview-tax — MUST come before POST /:holdingNo
// below, for the same reason. Live calc only, never touches the DB.
propertyRouter.post("/preview-tax", requireOperator, postPreviewTax);

// POST /api/v1/properties/cancellation-requests - any operator may
// request cancellation of any demand notice or receipt; nothing
// actually changes until tax_daroga approves (see admin.routes.ts).
propertyRouter.post("/cancellation-requests", requireOperator, postRequestCancellation);

// POST /api/v1/properties/lookup — public, two-factor citizen search
// (holding number + mobile number). MUST come before POST /:holdingNo
// below, or Express would treat "lookup" as a holding number.
propertyRouter.post("/lookup", postPropertyLookup);

// POST /api/v1/properties — create a new-entry or partially-known
// property (holding number auto-assigned; operator only)
propertyRouter.post("/", requireOperator, createNewEntryProperty);

// GET /api/v1/properties/:holdingNo — operator/admin only. Holding
// number alone is public no longer — see POST /lookup for the public,
// two-factor citizen search.
propertyRouter.get("/:holdingNo", requireOperator, getPropertyByHoldingNo);

// POST /api/v1/properties/:holdingNo — create/update a KNOWN-number property (operator only)
propertyRouter.post("/:holdingNo", requireOperator, saveProperty);

// PATCH /api/v1/properties/:holdingNo/survey - record surveyor name/ID/date (operator or admin)
propertyRouter.patch("/:holdingNo/survey", requireOperatorOrAdmin, postRecordPropertySurvey);

// POST /api/v1/properties/migrated-holdings/:holdingNo/operator-entry -
// any operator enters the real, surveyed floor-wise details for a
// MUNG-MIG- holding forwarded to them. MUST come before POST
// /:holdingNo above's catch-all would otherwise intercept it.
propertyRouter.post("/migrated-holdings/:holdingNo/operator-entry", requireOperatorOrAdmin, submitOperatorEntryHandler);

// POST /api/v1/properties/:holdingNo/payments — record a counter payment (operator only)
propertyRouter.post("/:holdingNo/payments", requireOperator, postPayment);

// POST /api/v1/properties/:holdingNo/pay/online/initiate — start an online payment (public)
propertyRouter.post("/:holdingNo/pay/online/initiate", postInitiateOnlinePayment);

// POST /api/v1/properties/:holdingNo/demand-notice — generate a demand notice (operator only)
propertyRouter.post("/:holdingNo/demand-notice", requireOperator, postGenerateDemandNotice);

// GET /api/v1/properties/:holdingNo/demand-notices/unsettled — for the payment picker (operator only)
propertyRouter.get("/:holdingNo/demand-notices/unsettled", requireOperator, getUnsettledDemandNotices);

// Read-only document history + reprints — reachable by operator OR admin.
// The /demand-notices/:demandNo/print and /payments/:receiptNo/print
// routes use a shared non-holding-scoped prefix, so they're mounted
// BEFORE the /:holdingNo catch-all further up would otherwise intercept
// "demand-notices"/"payments" as a literal holding number.
propertyRouter.get("/:holdingNo/demand-notices/history", requireOperatorOrAdmin, getDemandNoticeHistory);
propertyRouter.get("/demand-notices/:demandNo/print", requireOperatorOrAdmin, getDemandNoticeReprint);
propertyRouter.get("/:holdingNo/payments/history", requireOperatorOrAdmin, getPaymentHistory);
propertyRouter.get("/payments/:receiptNo/print", requireOperatorOrAdmin, getReceiptReprint);