import { Router } from "express";
import {
  getPropertyByHoldingNo,
  postPropertyLookup,
  getPropertySurveyList,
} from "../../controllers/property.controller";
import { postReportPropertyDiscrepancy } from "../../controllers/propertyDiscrepancy.controller";
import {
  postPayment,
  getPaymentHistory,
  getReceiptReprint,
} from "../../controllers/payment.controller";
import { postInitiateOnlinePayment } from "../../controllers/onlinePayment.controller";
import {
  postGenerateDemandNotice,
  getUnsettledDemandNotices,
} from "../../controllers/demandNotice.controller";
import { requireTaxCollector } from "../../middleware/requireTaxCollector";

export const propertyRouter = Router();

// GET /api/v1/properties/survey-list?status=to_be_surveyed|surveyed -
// same ordering reason as next-holding-no above.
propertyRouter.get("/survey-list", requireTaxCollector, getPropertySurveyList);

// POST /api/v1/properties/lookup — public, two-factor citizen search
// (holding number + mobile number). MUST come before POST /:holdingNo
// below, or Express would treat "lookup" as a holding number.
propertyRouter.post("/lookup", postPropertyLookup);

// GET /api/v1/properties/:holdingNo — operator/admin only. Holding
// number alone is public no longer — see POST /lookup for the public,
// two-factor citizen search.
propertyRouter.get("/:holdingNo", requireTaxCollector, getPropertyByHoldingNo);

// POST /api/v1/properties/:holdingNo/payments - record a counter payment (operator, or a tax_collector admin - see the role check inside postPayment)
propertyRouter.post("/:holdingNo/payments", requireTaxCollector, postPayment);

// POST /api/v1/properties/:holdingNo/pay/online/initiate — start an online payment (public)
propertyRouter.post(
  "/:holdingNo/pay/online/initiate",
  postInitiateOnlinePayment,
);

// POST /api/v1/properties/:holdingNo/demand-notice - generate a demand notice (operator, or a tax_collector admin - see the role check inside postGenerateDemandNotice)
propertyRouter.post(
  "/:holdingNo/demand-notice",
  requireTaxCollector,
  postGenerateDemandNotice,
);

// GET /api/v1/properties/:holdingNo/demand-notices/unsettled - for the payment picker (operator or admin)
propertyRouter.get(
  "/:holdingNo/demand-notices/unsettled",
  requireTaxCollector,
  getUnsettledDemandNotices,
);

// POST /api/v1/properties/:holdingNo/discrepancy - a Tax Collector submits the complete corrected property details found during field collection
propertyRouter.post(
  "/:holdingNo/discrepancy",
  requireTaxCollector,
  postReportPropertyDiscrepancy,
);

propertyRouter.get(
  "/:holdingNo/payments/history",
  requireTaxCollector,
  getPaymentHistory,
);
propertyRouter.get(
  "/payments/:receiptNo/print",
  requireTaxCollector,
  getReceiptReprint,
);
