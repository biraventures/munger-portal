import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAdmin } from "../middleware/requireAdmin";
import {
  getCounterLogins,
  getCounterToday,
  getGardenReport,
  getGardens,
  getPublicGarden,
  getPublicTicket,
  postAdmit,
  postCancelTicket,
  postCounterTicket,
  postGarden,
  postPublicPurchase,
  putCounterAssignment,
  putGarden,
} from "../controllers/garden.controller";

/** Garden entry tickets - staff (/garden) and public (/public/gardens). Role checks are in garden.service.ts. */
export const gardenRouter = Router();
gardenRouter.use(requireAdmin);
gardenRouter.get("/gardens", getGardens);
gardenRouter.post("/gardens", postGarden);
gardenRouter.put("/gardens/:id", putGarden);
gardenRouter.get("/counter-logins", getCounterLogins);
gardenRouter.put("/counter-logins/:username", putCounterAssignment);
gardenRouter.get("/report", getGardenReport);
gardenRouter.get("/counter/today", getCounterToday);
gardenRouter.post("/counter/tickets", postCounterTicket);
gardenRouter.post("/tickets/:id/cancel", postCancelTicket);
gardenRouter.post("/gate/admit", postAdmit);

const base = { standardHeaders: true, legacyHeaders: false } as const;
const readLimit = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: "Too many requests. Please wait a few minutes." },
});
const buyLimit = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many attempts. Please wait a few minutes." },
});

export const publicGardenRouter = Router();
publicGardenRouter.get("/ticket/:ticketNo", readLimit, getPublicTicket);
publicGardenRouter.get("/:code", readLimit, getPublicGarden);
publicGardenRouter.post("/:code/purchase", buyLimit, postPublicPurchase);
