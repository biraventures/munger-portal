import { Router } from "express";
import { postConfirmOnlinePayment } from "../controllers/onlinePayment.controller";

export const paymentsRouter = Router();

// POST /api/v1/payments/online/confirm — public (citizen return page calls this)
paymentsRouter.post("/online/confirm", postConfirmOnlinePayment);