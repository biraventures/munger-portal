import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAdmin } from "../middleware/requireAdmin";
import {
  getBooking,
  getBookings,
  getHalls,
  getPublicBooking,
  getPublicHalls,
  postApplication,
  postApprove,
  postCancel,
  postHall,
  postOnlinePayment,
  postPayment,
  postReject,
  postSettleDeposit,
  putHall,
} from "../controllers/communityHall.controller";

/** Community hall bookings - office (/community-halls) and public (/public/community-halls). Roles: communityHall.service.ts. */
export const communityHallRouter = Router();
communityHallRouter.use(requireAdmin);
communityHallRouter.get("/halls", getHalls);
communityHallRouter.post("/halls", postHall);
communityHallRouter.put("/halls/:id", putHall);
communityHallRouter.get("/bookings", getBookings);
communityHallRouter.get("/bookings/:id", getBooking);
communityHallRouter.post("/bookings/:id/approve", postApprove);
communityHallRouter.post("/bookings/:id/reject", postReject);
communityHallRouter.post("/bookings/:id/payment", postPayment);
communityHallRouter.post("/bookings/:id/cancel", postCancel);
communityHallRouter.post("/bookings/:id/deposit", postSettleDeposit);

const base = { standardHeaders: true, legacyHeaders: false } as const;
const readLimit = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: "Too many requests. Please wait a few minutes." },
});
const applyLimit = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Too many applications. Please try again later." },
});
// Only failed booking no. + mobile look-ups count, so they cannot be guessed.
const lookupLimit = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  message: { error: "Too many attempts. Please wait 15 minutes." },
});

export const publicCommunityHallRouter = Router();
publicCommunityHallRouter.get("/", readLimit, getPublicHalls);
publicCommunityHallRouter.post("/applications", applyLimit, postApplication);
publicCommunityHallRouter.get("/booking", lookupLimit, getPublicBooking);
publicCommunityHallRouter.post("/booking/pay", lookupLimit, postOnlinePayment);
