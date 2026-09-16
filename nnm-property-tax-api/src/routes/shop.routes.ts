import { Router } from "express";
import { getShopByShopNo, postShopLookup, postCreateShop, getMarketList, getNextShopNumber, listVacantShops, listShopsWithSummary } from "../controllers/shop.controller";
import { postSubmitAgreementChange, getPrintableAgreement } from "../controllers/shopAgreement.controller";
import { postSubmitShopEditRequest } from "../controllers/shopEditRequest.controller";
import { postRequestDemandAction } from "../controllers/shopDemandAction.controller";
import {
  postUploadShopAgreementDocument,
  getShopAgreementDocumentMetaHandler,
  getShopAgreementDocumentFile,
  getShopAgreementDocumentPendingRequest,
} from "../controllers/shopAgreementDocument.controller";
import {
  getEscalationPeriods,
  postAddEscalationPeriod,
  deleteEscalationPeriodHandler,
} from "../controllers/shopRentEscalationPeriod.controller";
import {
  postGenerateRentDemand,
  getUnsettledRentDemands,
  postShopRentPaymentHandler,
  getPrintableDemandNotice,
  getShopDemandHistory,
  getShopReceiptReprint,
  getShopPaymentHistory,
} from "../controllers/shopRent.controller";
import { postIssueViolationNotice, getViolationNoticesForShopHandler, getViolationNoticePrint } from "../controllers/shopViolationNotice.controller";
import { requireOperator } from "../middleware/requireOperator";
import { requireOperatorOrAdmin } from "../middleware/requireOperatorOrAdmin";

export const shopRouter = Router();

// POST /api/v1/shops/lookup — public, two-factor citizen search. MUST
// come before POST /:shopNo/... routes below, or Express would treat
// "lookup" as a literal shop number.
shopRouter.post("/lookup", postShopLookup);

// GET /api/v1/shops/markets and /api/v1/shops/next-number and
// /api/v1/shops/vacant — MUST come before GET /:shopNo below, or
// Express would treat these as shop numbers.
shopRouter.get("/markets", requireOperator, getMarketList);
shopRouter.get("/next-number", requireOperator, getNextShopNumber);
shopRouter.get("/vacant", listVacantShops);

// Full-screen shop list (shop no, market, rent paid till, rent,
// agreement date) - replaces a search-only page that showed nothing
// by default.
shopRouter.get("/", requireOperatorOrAdmin, listShopsWithSummary);

// POST /api/v1/shops — create a new shop record (operator only, direct — no approval chain)
shopRouter.post("/", requireOperator, postCreateShop);

// GET /api/v1/shops/:shopNo — operator/admin only
shopRouter.get("/:shopNo", requireOperator, getShopByShopNo);

// POST /api/v1/shops/:shopNo/agreement — queue a new/edited agreement for the 5-stage approval chain
shopRouter.post("/:shopNo/agreement", requireOperator, postSubmitAgreementChange);

// Propose an edit to an existing shop's own details (location,
// market, ward, area) - operator only, matching the property/holding
// edit pattern (nothing is applied until Stall Prabhari, City
// Manager, and Deputy Commissioner have all approved it).
shopRouter.post("/:shopNo/edit-requests", requireOperator, postSubmitShopEditRequest);

// Cancel/supersede a rent demand or cancel a receipt - operator or
// admin can request, but nothing is applied until Stall Prabhari then
// City Manager both approve.
shopRouter.post("/demand-actions", requireOperatorOrAdmin, postRequestDemandAction);

// Signed shop agreement PDF - kept safe per shop. Operator or admin
// (whoever's processing the paperwork) can upload/view it - see
// requireOperatorOrAdmin's comment for why this is one of the few
// endpoints deliberately open to either session type.
shopRouter.post("/:shopNo/agreement-document", requireOperatorOrAdmin, postUploadShopAgreementDocument);
shopRouter.get("/:shopNo/agreement-document", requireOperatorOrAdmin, getShopAgreementDocumentMetaHandler);
shopRouter.get("/:shopNo/agreement-document/file", requireOperatorOrAdmin, getShopAgreementDocumentFile);
shopRouter.get("/:shopNo/agreement-document/pending-request", requireOperatorOrAdmin, getShopAgreementDocumentPendingRequest);

// Rent escalation history - manually entered, always by whoever
// reviews the shop's paper agreement (operator or admin). See
// migration 042's header comment for why this exists alongside the
// old legacy rent_pre_2019/2019_20/2020_21_onwards fields rather than
// replacing them.
shopRouter.get("/:shopNo/rent-escalation-periods", requireOperatorOrAdmin, getEscalationPeriods);
shopRouter.post("/:shopNo/rent-escalation-periods", requireOperatorOrAdmin, postAddEscalationPeriod);
shopRouter.delete("/:shopNo/rent-escalation-periods/:id", requireOperatorOrAdmin, deleteEscalationPeriodHandler);

// GET /api/v1/shops/agreements/:agreementId/print — the formal permit/agreement document
shopRouter.get("/agreements/:agreementId/print", requireOperatorOrAdmin, getPrintableAgreement);

// Rent demand + payment
shopRouter.post("/:shopNo/rent-demand", requireOperator, postGenerateRentDemand);
shopRouter.get("/:shopNo/rent-demands/unsettled", requireOperator, getUnsettledRentDemands);
shopRouter.get("/:shopNo/rent-demands/history", requireOperatorOrAdmin, getShopDemandHistory);
shopRouter.get("/rent-demands/:demandNo/print", requireOperatorOrAdmin, getPrintableDemandNotice);
shopRouter.post("/:shopNo/rent-payments", requireOperator, postShopRentPaymentHandler);
shopRouter.get("/:shopNo/rent-payments/history", requireOperatorOrAdmin, getShopPaymentHistory);
shopRouter.get("/rent-payments/:receiptNo/print", requireOperatorOrAdmin, getShopReceiptReprint);

// Violation notices
shopRouter.post("/:shopNo/violation-notices", requireOperator, postIssueViolationNotice);
shopRouter.get("/:shopNo/violation-notices", requireOperatorOrAdmin, getViolationNoticesForShopHandler);
shopRouter.get("/violation-notices/:id/print", requireOperatorOrAdmin, getViolationNoticePrint);