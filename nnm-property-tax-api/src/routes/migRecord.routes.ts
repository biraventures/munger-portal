import { Router } from "express";
import { requireOperatorOrAdmin } from "../middleware/requireOperatorOrAdmin";
import {
  getAllRecords,
  getMyCount,
  postAdvance,
  postRestore,
  postSendBack,
  postSetAside,
  putRecord,
} from "../controllers/migRecord.controller";

/**
 * Old records (MIG) approvals: reachable by a Nagar Nigam operator login as well as admin logins - the service checks
 * the step and role (Operator verifies, Tax Daroga forwards, City Manager approves; Commissioner any step; DMC views).
 */
export const migRecordRouter = Router();
migRecordRouter.use(requireOperatorOrAdmin);
migRecordRouter.get("/", getAllRecords);
migRecordRouter.get("/my-count", getMyCount);
migRecordRouter.put("/:id", putRecord);
migRecordRouter.post("/advance", postAdvance);
migRecordRouter.post("/:id/send-back", postSendBack);
migRecordRouter.post("/:id/set-aside", postSetAside);
migRecordRouter.post("/:id/restore", postRestore);
