import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  getVerifyDemandNotice,
  getVerifyReceipt,
  getVerifyShopDemand,
  getVerifyShopReceipt,
  getVerifyViolationNotice,
  getVerifyAgreement,
} from "../controllers/verify.controller";

export const verifyRouter = Router();

// Public, but rate-limited — even with a signature required, an
// unrestricted public endpoint that returns full citizen details is
// worth throttling against generic abuse/scraping, separate from the
// signature check itself.
const verifyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification requests. Please wait a few minutes and try again." },
});

verifyRouter.use(verifyRateLimiter);

verifyRouter.get("/demand-notice/:demandNo", getVerifyDemandNotice);
verifyRouter.get("/receipt/:receiptNo", getVerifyReceipt);
verifyRouter.get("/shop-demand/:demandNo", getVerifyShopDemand);
verifyRouter.get("/shop-receipt/:receiptNo", getVerifyShopReceipt);
verifyRouter.get("/violation-notice/:id", getVerifyViolationNotice);
verifyRouter.get("/agreement/:id", getVerifyAgreement);