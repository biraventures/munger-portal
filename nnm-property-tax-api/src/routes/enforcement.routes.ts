import { Router } from "express";
import { requireAttendanceRole } from "../middleware/requireAttendanceRole";
import * as c from "../controllers/enforcement.controller";
import {
  ALL_MODULE_ROLES, ENCROACHMENT_OFFICER, ENCROACHMENT_STAFF, MOBILE_COURT_OFFICER, MOBILE_COURT_STAFF,
} from "../services/enforcementCommon.service";

const anyEnforcementUser = requireAttendanceRole([...ALL_MODULE_ROLES.encroachment, ...ALL_MODULE_ROLES.mobile_court]);
const encView = requireAttendanceRole(ALL_MODULE_ROLES.encroachment);
const encWrite = requireAttendanceRole([...ENCROACHMENT_OFFICER, ...ENCROACHMENT_STAFF]);
const encOfficer = requireAttendanceRole(ENCROACHMENT_OFFICER);
const mcView = requireAttendanceRole(ALL_MODULE_ROLES.mobile_court);
const mcWrite = requireAttendanceRole([...MOBILE_COURT_OFFICER, ...MOBILE_COURT_STAFF]);
const mcOfficer = requireAttendanceRole(MOBILE_COURT_OFFICER);

/** Shared by both modules: evidence uploads (the file is the raw request body), signed file links, fine payment. */
export const enforcementRouter = Router();
enforcementRouter.post("/media", anyEnforcementUser, c.postMedia);
enforcementRouter.get("/media/:id/file", c.getMediaFile); // signed, short-lived link - no login header on <img>/<video>
enforcementRouter.get("/fines/:id", anyEnforcementUser, c.getFineHandler);
enforcementRouter.post("/fines/:id/pos-payment", anyEnforcementUser, c.postPosPayment);

/** City Manager: encroachment removal. */
export const encroachmentRouter = Router();
encroachmentRouter.get("/cases", encView, c.encList);
encroachmentRouter.post("/cases", encWrite, c.encCreate);
encroachmentRouter.get("/cases/:id", encView, c.encGet);
encroachmentRouter.post("/cases/:id/notice/temporary", encWrite, c.encServeTemporary);
encroachmentRouter.post("/cases/:id/removed", encWrite, c.encRemoved);
encroachmentRouter.post("/cases/:id/fine", encOfficer, c.encFine);
encroachmentRouter.post("/cases/:id/notice/permanent", encOfficer, c.encIssuePermanentNotice);
encroachmentRouter.post("/cases/:id/notice/permanent/served", encWrite, c.encPermanentNoticeServed);
encroachmentRouter.post("/cases/:id/measurement-order", encOfficer, c.encMeasurementOrder);
encroachmentRouter.post("/cases/:id/measurement-report", encWrite, c.encMeasurementReport);
encroachmentRouter.post("/cases/:id/final-order", encOfficer, c.encFinalOrder);

/** APSWMO: mobile court. */
export const mobileCourtRouter = Router();
mobileCourtRouter.get("/options", mcView, c.mcOptions);
mobileCourtRouter.get("/cases", mcView, c.mcList);
mobileCourtRouter.post("/cases", mcWrite, c.mcCreate);
mobileCourtRouter.get("/cases/:id", mcView, c.mcGet);
mobileCourtRouter.post("/cases/:id/notice", mcOfficer, c.mcNotice);
mobileCourtRouter.post("/cases/:id/followup", mcWrite, c.mcFollowup);
mobileCourtRouter.post("/cases/:id/fine", mcOfficer, c.mcFine);
mobileCourtRouter.post("/cases/:id/close", mcOfficer, c.mcClose);
mobileCourtRouter.get("/miking-videos", mcView, c.mcListVideos);
mobileCourtRouter.post("/miking-videos", mcWrite, c.mcAddVideo);
