import { Router } from "express";
import { getPropertyByHoldingNo, postPropertyLookup, postRecordPropertySurvey, getPropertySurveyList } from "../controllers/property.controller";
import { listPendingOperatorEntryHandler, submitOperatorEntryHandler } from "../controllers/migratedHoldingSurvey.controller";
import { postFlagForResurvey, listResurveyFlagsForHoldingHandler } from "../controllers/propertyResurveyFlag.controller";
import { postReportPropertyDiscrepancy } from "../controllers/propertyDiscrepancy.controller";
import { saveProperty, postResubmitChangeRequest } from "../controllers/propertySave.controller";
import { getRevertedChangeRequests } from "../controllers/changeRequest.controller";
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

// POST /api/v1/properties/cancellation-requests - any operator or a
// tax_collector admin may request cancellation of any demand notice
// or receipt; nothing actually changes until it clears review (see
// admin.routes.ts) - tax_daroga alone for an operator's request, or
// tax_daroga then the assigned City Manager for a Tax Collector's.
propertyRouter.post("/cancellation-requests", requireOperatorOrAdmin, postRequestCancellation);

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
propertyRouter.get("/:holdingNo", requireOperatorOrAdmin, getPropertyByHoldingNo);

// POST /api/v1/properties/:holdingNo - create/update a KNOWN-number property (operator, or a Tax Surveyor initiating a survey/resurvey they searched for)
propertyRouter.post("/:holdingNo", requireOperatorOrAdmin, saveProperty);

// GET /api/v1/properties/change-requests/reverted - operator's
// worklist of mutations sent back for correction. Segment count (3
// after /properties) differs from the /:holdingNo catch-all (1), so
// no route-ordering conflict either way.
propertyRouter.get("/change-requests/reverted", requireOperator, getRevertedChangeRequests);
// POST /api/v1/properties/change-requests/:id/resubmit - operator
// corrects and resubmits a reverted mutation.
propertyRouter.post("/change-requests/:id/resubmit", requireOperator, postResubmitChangeRequest);

// PATCH /api/v1/properties/:holdingNo/survey - record surveyor name/ID/date (operator or admin)
propertyRouter.patch("/:holdingNo/survey", requireOperatorOrAdmin, postRecordPropertySurvey);

// POST /api/v1/properties/migrated-holdings/:holdingNo/operator-entry -
// any operator enters the real, surveyed floor-wise details for a
// MUNG-MIG- holding forwarded to them. MUST come before POST
// /:holdingNo above's catch-all would otherwise intercept it.
propertyRouter.post("/migrated-holdings/:holdingNo/operator-entry", requireOperatorOrAdmin, submitOperatorEntryHandler);

// POST /api/v1/properties/:holdingNo/payments - record a counter payment (operator, or a tax_collector admin - see the role check inside postPayment)
propertyRouter.post("/:holdingNo/payments", requireOperatorOrAdmin, postPayment);

// POST /api/v1/properties/:holdingNo/pay/online/initiate — start an online payment (public)
propertyRouter.post("/:holdingNo/pay/online/initiate", postInitiateOnlinePayment);

// POST /api/v1/properties/:holdingNo/demand-notice - generate a demand notice (operator, or a tax_collector admin - see the role check inside postGenerateDemandNotice)
propertyRouter.post("/:holdingNo/demand-notice", requireOperatorOrAdmin, postGenerateDemandNotice);

// GET /api/v1/properties/:holdingNo/demand-notices/unsettled - for the payment picker (operator or admin)
propertyRouter.get("/:holdingNo/demand-notices/unsettled", requireOperatorOrAdmin, getUnsettledDemandNotices);

// Read-only document history + reprints — reachable by operator OR admin.
// The /demand-notices/:demandNo/print and /payments/:receiptNo/print
// routes use a shared non-holding-scoped prefix, so they're mounted
// BEFORE the /:holdingNo catch-all further up would otherwise intercept
// "demand-notices"/"payments" as a literal holding number.
propertyRouter.get("/:holdingNo/demand-notices/history", requireOperatorOrAdmin, getDemandNoticeHistory);

// POST /api/v1/properties/:holdingNo/resurvey-flag - a Tax Collector flags a holding for re-survey with remarks
propertyRouter.post("/:holdingNo/resurvey-flag", requireOperatorOrAdmin, postFlagForResurvey);
propertyRouter.get("/:holdingNo/resurvey-flags", requireOperatorOrAdmin, listResurveyFlagsForHoldingHandler);

// POST /api/v1/properties/:holdingNo/discrepancy - a Tax Collector submits the complete corrected property details found during field collection
propertyRouter.post("/:holdingNo/discrepancy", requireOperatorOrAdmin, postReportPropertyDiscrepancy);
propertyRouter.get("/demand-notices/:demandNo/print", requireOperatorOrAdmin, getDemandNoticeReprint);
propertyRouter.get("/:holdingNo/payments/history", requireOperatorOrAdmin, getPaymentHistory);
propertyRouter.get("/payments/:receiptNo/print", requireOperatorOrAdmin, getReceiptReprint);