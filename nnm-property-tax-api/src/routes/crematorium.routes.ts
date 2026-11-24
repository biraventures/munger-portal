import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAdmin } from "../middleware/requireAdmin";
import {
  getCounterToday,
  getFees,
  getReport,
  getTicket,
  getVerify,
  postCancel,
  postTicket,
  putFee,
} from "../controllers/crematorium.controller";

/** Electric crematorium tickets - staff (/crematorium) and the public check of a printed ticket. Roles: crematorium.service.ts. */
export const crematoriumRouter = Router();
crematoriumRouter.use(requireAdmin);
crematoriumRouter.get("/counter/today", getCounterToday);
crematoriumRouter.post("/tickets", postTicket);
crematoriumRouter.get("/tickets/:id", getTicket);
crematoriumRouter.post("/tickets/:id/cancel", postCancel);
crematoriumRouter.get("/report", getReport);
crematoriumRouter.get("/fees", getFees);
crematoriumRouter.put("/fee", putFee);

export const publicCrematoriumRouter = Router();
publicCrematoriumRouter.get(
  "/tickets/:ticketNo",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests." } }),
  getVerify,
);
