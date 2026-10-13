import { Router } from "express";
import { requireWhosWhoUser } from "../middleware/requireWhosWhoUser";
import {
  archiveWhosWhoEntry,
  createWhosWhoEntry,
  getPublicWhosWhoPhoto,
  getWhosWhoMe,
  getWhosWhoPhotoForStaff,
  getWhosWhoSignedForm,
  listPublicWhosWho,
  listWhosWhoEntries,
  publishWhosWhoEntry,
  resubmitWhosWhoEntry,
  returnWhosWhoEntry,
  verifyWhosWhoEntry,
  withdrawWhosWhoEntry,
} from "../controllers/whosWho.controller";

// Public, no login - published entries only. The scanned signed form is never exposed here.
export const whosWhoPublicRouter = Router();
whosWhoPublicRouter.get("/", listPublicWhosWho);
whosWhoPublicRouter.get("/:id/photo", getPublicWhosWhoPhoto);

// Operator -> City Manager -> DMC workflow, shared by the operator, admin and attendance logins.
export const whosWhoManagerRouter = Router();
whosWhoManagerRouter.use(requireWhosWhoUser);
whosWhoManagerRouter.get("/me", getWhosWhoMe);
whosWhoManagerRouter.get("/entries", listWhosWhoEntries);
whosWhoManagerRouter.post("/entries", createWhosWhoEntry);
whosWhoManagerRouter.put("/entries/:id", resubmitWhosWhoEntry);
whosWhoManagerRouter.delete("/entries/:id", withdrawWhosWhoEntry);
whosWhoManagerRouter.post("/entries/:id/verify", verifyWhosWhoEntry);
whosWhoManagerRouter.post("/entries/:id/return", returnWhosWhoEntry);
whosWhoManagerRouter.post("/entries/:id/publish", publishWhosWhoEntry);
whosWhoManagerRouter.post("/entries/:id/archive", archiveWhosWhoEntry);
whosWhoManagerRouter.get("/entries/:id/photo", getWhosWhoPhotoForStaff);
whosWhoManagerRouter.get("/entries/:id/signed-form", getWhosWhoSignedForm);
