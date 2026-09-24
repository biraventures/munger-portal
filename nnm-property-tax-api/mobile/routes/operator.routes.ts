import { Router } from "express";
import { getReceiptsExport } from "../controllers/receiptExport.controller";
import { requireOperator } from "../middleware/requireOperator";

export const operatorRouter = Router();

operatorRouter.get("/receipts/export", requireOperator, getReceiptsExport);
