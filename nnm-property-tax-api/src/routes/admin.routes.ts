import { Router } from "express";
import { listOperators, setOperatorActive } from "../controllers/adminOperators.controller";
import {
  listTaxCollectors,
  createTaxCollector,
  setTaxCollectorActive,
  getAvailableWards,
  getTaxCollectorWards,
  setTaxCollectorWards,
} from "../controllers/taxCollector.controller";
import {
  getChangeRequests,
  getChangeRequestById,
  postApproveChangeRequest,
  postRejectChangeRequest,
  postRevertChangeRequest,
} from "../controllers/changeRequest.controller";
import {
  getCancellationRequests,
  postApproveCancellation,
  postRejectCancellation,
} from "../controllers/cancellationRequest.controller";
import { postBulkGenerateDemandNotices } from "../controllers/demandNotice.controller";
import { postBulkRegenerateTaxHistory } from "../controllers/adminTaxHistory.controller";
import { getDataExport } from "../controllers/export.controller";
import {
  getShopAgreementRequests,
  getShopAgreementRequestById,
  postApproveShopAgreementRequest,
  postRejectShopAgreementRequest,
  postRevertShopAgreementRequest,
} from "../controllers/shopAgreement.controller";
import { listAllShops, getPerSqftReport, uploadShopsCsvHandler } from "../controllers/shop.controller";
import { deleteShopHandler } from "../controllers/shopDelete.controller";
import { postRenumberHolding, postRenameHolding, postFixHoldingNoSpaces } from "../controllers/propertyRenumber.controller";
import { deletePropertyHandler } from "../controllers/propertyDelete.controller";
import { getSpacedHoldings, postDeleteSpacedHoldings, postRemoveDuplicateFloors } from "../controllers/propertyBulkCleanup.controller";
import {
  searchPropertiesForGeo,
  listAllPropertyGeoHandler,
  getPropertyGeo,
  putPropertyGeo,
  getGeoProgress,
  listInfrastructureLinesHandler,
  createInfrastructureLineHandler,
  updateInfrastructureLineHandler,
  deleteInfrastructureLineHandler,
  importInfrastructureLinesKmlHandler,
  listWardBoundariesHandler,
  importWardBoundariesKmlHandler,
  deleteWardBoundaryHandler,
  exportGeoData,
} from "../controllers/geo.controller";
import { uploadPropertiesXlsxHandler } from "../controllers/propertyBulkImport.controller";
import { getShopsPendingPublication, postApproveShopPublication } from "../controllers/shopPublicationApproval.controller";
import {
  getShopEditRequests,
  getShopEditRequestById,
  postApproveShopEditRequest,
  postRejectShopEditRequest,
} from "../controllers/shopEditRequest.controller";
import {
  listShopAgreementDocumentRequestsHandler,
  getShopAgreementDocumentRequestFile,
  approveShopAgreementDocumentRequestHandler,
  rejectShopAgreementDocumentRequestHandler,
} from "../controllers/shopAgreementDocument.controller";
import { postCreateShopInspection, listShopInspectionsForShop, listAllShopInspections } from "../controllers/shopInspection.controller";
import {
  uploadMigratedHoldingsHandler,
  listPendingAssignmentHandler,
  listTaxDarogasHandler,
  listTaxSurveyorsHandler,
  assignToSurveyorHandler,
  listMyAssignmentsHandler,
  assignToTaxSurveyorHandler,
  listMySurveysHandler,
  submitSurveyorEntryHandler,
  verifyByTaxDarogaHandler,
  revertToSurveyorHandler,
  listPendingFinalVerificationHandler,
  finalizeVerificationHandler,
  listEventsForHoldingHandler,
  exportMigratedHoldingsHandler,
} from "../controllers/migratedHoldingSurvey.controller";
import { listResurveyFlagsHandler, reviewResurveyFlagHandler, exportResurveyFlagsHandler } from "../controllers/propertyResurveyFlag.controller";
import { listTaxCollectorsWithAssignmentHandler, listCityManagersHandler, assignCityManagerHandler } from "../controllers/taxCollectorAssignment.controller";
import { listEntryRevertEventsHandler, exportEntryRevertEventsHandler } from "../controllers/entryRevertEvent.controller";
import {
  postCreateEmployeeHandler,
  searchEmployeeByAadhaarHandler,
  listEmployeesHandler,
  patchUpdateEmployeeHandler,
  deleteEmployeeHandler,
  postVerifyEmployeeHandler,
  getEmployeeDatabaseProgressHandler,
} from "../controllers/employee.controller";
import {
  listStreetSegmentsHandler,
  listLightsForSegmentHandler,
  reportStreetlightFaultHandler,
  listStreetlightFaultsHandler,
} from "../controllers/streetlightAdmin.controller";
import {
  getDemandActionRequests,
  getDemandActionRequestById,
  postApproveDemandAction,
  postRejectDemandAction,
} from "../controllers/shopDemandAction.controller";
import { postResolveViolationNotice } from "../controllers/shopViolationNotice.controller";
import {
  getRentalApplications,
  getRentalApplicationById,
  postApproveRentalApplication,
  postRejectRentalApplication,
} from "../controllers/shopRentalApplication.controller";
import {
  getRentalPreferences,
  getRentalPreferenceById,
  getPreferencesMatchingShop,
  postAllotPreference,
  postRejectRentalPreference,
} from "../controllers/shopRentalPreference.controller";
import {
  getTradeLicenseApplications,
  getTradeLicenseApplicationById,
  postApproveTradeLicenseApplication,
  postRejectTradeLicenseApplication,
  getTradeLicenseStats,
} from "../controllers/tradeLicenseApplication.controller";
import { requireAdmin, requireAdminRole } from "../middleware/requireAdmin";

export const adminRouter = Router();

adminRouter.use(requireAdmin);

// Senior-role gate reused across the routes below — operator account
// management, full data export, and system-wide bulk mutations are
// powerful enough that every admin role shouldn't equally reach them,
// even though every admin role legitimately needs the day-to-day
// approval-queue endpoints. Commissioner and Deputy Commissioner sit at
// or near the top of all three approval chains (property, shop, trade
// license), so they're the natural senior-oversight roles here.
const requireSeniorAdmin = requireAdminRole("commissioner", "deputy_commissioner");

// Stall Prabhari's role is specific to the shop agreement/rental
// chain (see SHOP_APPROVAL_STAGE_ORDER) - they're not part of the
// property-tax side of this system at all, so they're excluded from
// mutation approvals, cancellation requests, tax collector management,
// and trade license services below, per what was explicitly asked for.
const requireMutationChainRole = requireAdminRole("tax_daroga", "mutation_nodal_clerk", "deputy_commissioner", "commissioner");
const requireNonStallPrabhari = requireAdminRole(
  "tax_daroga",
  "mutation_nodal_clerk",
  "deputy_commissioner",
  "commissioner",
  "city_manager",
  "trade_license_nodal",
);

// Operator management
adminRouter.get("/operators", requireSeniorAdmin, listOperators);
adminRouter.patch("/operators/:id/active", requireSeniorAdmin, setOperatorActive);

// Property mutation approval queue - restricted to the actual chain's
// roles (tax_daroga -> mutation_nodal_clerk -> deputy_commissioner ->
// commissioner, per migration 005) - Stall Prabhari was never part of
// this chain to begin with, so this also fixes a pre-existing gap
// where it was reachable by every admin role with no restriction at all.
adminRouter.get("/change-requests", requireMutationChainRole, getChangeRequests);
adminRouter.get("/change-requests/:id", requireMutationChainRole, getChangeRequestById);
adminRouter.post("/change-requests/:id/approve", requireMutationChainRole, postApproveChangeRequest);
adminRouter.post("/change-requests/:id/reject", requireMutationChainRole, postRejectChangeRequest);
adminRouter.post("/change-requests/:id/revert", requireMutationChainRole, postRevertChangeRequest);

// Demand notice / receipt cancellation approval queue - viewable by
// any admin role except Stall Prabhari. Approve/reject is tax_daroga
// or city_manager - which one applies to a given request is enforced
// inside the controller/service by that request's own stage (an
// operator's request is tax_daroga-only, as before; a Tax Collector's
// request needs tax_daroga then their assigned City Manager).
const requireCancellationReviewRole = requireAdminRole("tax_daroga", "city_manager");
adminRouter.get("/cancellation-requests", requireNonStallPrabhari, getCancellationRequests);
adminRouter.post("/cancellation-requests/:id/approve", requireCancellationReviewRole, postApproveCancellation);
adminRouter.post("/cancellation-requests/:id/reject", requireCancellationReviewRole, postRejectCancellation);

// Shop agreement approval queue (5-stage: Stall Prabhari -> Tax Daroga NOC -> City Manager -> Deputy Commissioner -> Commissioner)
adminRouter.get("/shop-agreement-requests", getShopAgreementRequests);
adminRouter.get("/shop-agreement-requests/:id", getShopAgreementRequestById);
adminRouter.post("/shop-agreement-requests/:id/approve", postApproveShopAgreementRequest);
adminRouter.post("/shop-agreement-requests/:id/reject", postRejectShopAgreementRequest);
adminRouter.post("/shop-agreement-requests/:id/revert", postRevertShopAgreementRequest);

// Commissioner-only unified audit trail of every revert-to-operator
// event across property mutations and shop agreements. See
// entryRevertEvent.controller.ts.
adminRouter.get("/entry-revert-events", requireAdminRole("commissioner"), listEntryRevertEventsHandler);
adminRouter.get("/entry-revert-events/export", requireAdminRole("commissioner"), exportEntryRevertEventsHandler);

// Streetlights - fault reporting is open to the six field roles who
// notice damage during their regular work; fault viewing is open to
// any admin for coordination. Street-wise bulk import, GPS entry,
// City Manager assignment, and the delay report have shifted to the
// asset management (attendance) login - see streetlightCommissioner.controller.ts
// and streetlight.routes.ts - and are no longer duplicated here.
// See streetlightAdmin.controller.ts.
const requireStreetlightReporterRole = requireAdminRole("tax_daroga", "tax_surveyor", "tax_collector", "stall_prabhari", "je_mechanical", "ae_mechanical");
adminRouter.get("/street-segments", listStreetSegmentsHandler);
adminRouter.get("/street-segments/:id/lights", requireStreetlightReporterRole, listLightsForSegmentHandler);
adminRouter.post("/streetlight-faults", requireStreetlightReporterRole, reportStreetlightFaultHandler);
adminRouter.get("/streetlight-faults", listStreetlightFaultsHandler);

// Municipal employee database - Establishment Clerk enters records,
// City Manager verifies, Commissioner sees overall progress. See
// employee.controller.ts.
const requireEmployeeViewRole = requireAdminRole("establishment_clerk", "city_manager", "commissioner");
adminRouter.post("/employees", requireAdminRole("establishment_clerk"), postCreateEmployeeHandler);
adminRouter.get("/employees/search", requireAdminRole("establishment_clerk"), searchEmployeeByAadhaarHandler);
adminRouter.get("/employees", requireEmployeeViewRole, listEmployeesHandler);
adminRouter.patch("/employees/:id", requireAdminRole("establishment_clerk"), patchUpdateEmployeeHandler);
adminRouter.delete("/employees/:id", requireAdminRole("establishment_clerk"), deleteEmployeeHandler);
adminRouter.post("/employees/:id/verify", requireAdminRole("city_manager"), postVerifyEmployeeHandler);
adminRouter.get("/employees/progress", requireAdminRole("commissioner"), getEmployeeDatabaseProgressHandler);

adminRouter.get("/shops", listAllShops);
adminRouter.post("/shops/bulk-upload", requireAdminRole("commissioner"), uploadShopsCsvHandler);
adminRouter.delete("/shops/:shopNo", requireAdminRole("commissioner"), deleteShopHandler);
adminRouter.post("/properties/:holdingNo/renumber", requireAdminRole("commissioner"), postRenumberHolding);
adminRouter.post("/properties/:holdingNo/rename", requireAdminRole("commissioner"), postRenameHolding);
adminRouter.delete("/properties/:holdingNo", requireAdminRole("commissioner"), deletePropertyHandler);
adminRouter.post("/properties/fix-holding-no-spaces", requireAdminRole("commissioner"), postFixHoldingNoSpaces);
adminRouter.get("/properties/spaced-holdings", requireAdminRole("commissioner"), getSpacedHoldings);
adminRouter.post("/properties/spaced-holdings/delete-all", requireAdminRole("commissioner"), postDeleteSpacedHoldings);
adminRouter.post("/properties/remove-duplicate-floors", requireAdminRole("commissioner"), postRemoveDuplicateFloors);
adminRouter.post("/properties/bulk-upload", requireAdminRole("commissioner"), uploadPropertiesXlsxHandler);

// Shop publication approval - gates a newly-entered shop from public
// visibility until Stall Prabhari, City Manager, and Deputy
// Commissioner have each reviewed it (see SHOP_PUBLICATION_STAGE_ORDER).
const requirePublicationStageRole = requireAdminRole("stall_prabhari", "city_manager", "deputy_commissioner");
adminRouter.get("/shops/pending-publication", requirePublicationStageRole, getShopsPendingPublication);
adminRouter.post("/shops/:shopNo/approve-publication", requirePublicationStageRole, postApproveShopPublication);

// Shop edit approval - an operator's proposed edit to an existing
// shop's own details only takes effect once Stall Prabhari, City
// Manager, and Deputy Commissioner have all approved it, mirroring
// the property/holding edit pattern.
adminRouter.get("/shop-edit-requests", requirePublicationStageRole, getShopEditRequests);
adminRouter.get("/shop-edit-requests/:id", requirePublicationStageRole, getShopEditRequestById);
adminRouter.post("/shop-edit-requests/:id/approve", requirePublicationStageRole, postApproveShopEditRequest);
adminRouter.post("/shop-edit-requests/:id/reject", requirePublicationStageRole, postRejectShopEditRequest);

// Shop agreement document approval - an uploaded (or changed)
// signed-agreement PDF doesn't become the shop's live document until
// it clears the same 3-stage review as shop publication above.
adminRouter.get("/shop-agreement-document-requests", requirePublicationStageRole, listShopAgreementDocumentRequestsHandler);
adminRouter.get("/shop-agreement-document-requests/:id/file", requirePublicationStageRole, getShopAgreementDocumentRequestFile);
adminRouter.post("/shop-agreement-document-requests/:id/approve", requirePublicationStageRole, approveShopAgreementDocumentRequestHandler);
adminRouter.post("/shop-agreement-document-requests/:id/reject", requirePublicationStageRole, rejectShopAgreementDocumentRequestHandler);

// Shop inspection - City Manager or Deputy Commissioner walks a shop
// and records which irregularities (if any) they found, from a fixed
// checklist, plus their own comments.
const requireInspectionRole = requireAdminRole("city_manager", "deputy_commissioner");
adminRouter.get("/shop-inspections", requireInspectionRole, listAllShopInspections);
adminRouter.get("/shops/:shopNo/inspections", requireInspectionRole, listShopInspectionsForShop);
adminRouter.post("/shops/:shopNo/inspections", requireInspectionRole, postCreateShopInspection);

// Migrated holding survey workflow - old paper-record holdings
// bulk-imported under the MUNG-MIG- series. Assignment is split by
// ward parity: Deputy Commissioner handles odd wards, City Manager
// handles even wards, and each verifies only what they themselves
// assigned. See migratedHoldingSurvey.controller.ts.
adminRouter.post("/migrated-holdings/bulk-upload", requireAdminRole("commissioner"), uploadMigratedHoldingsHandler);
adminRouter.get("/migrated-holdings/export", requireAdminRole("commissioner"), exportMigratedHoldingsHandler);
adminRouter.get("/migrated-holdings/pending-assignment", listPendingAssignmentHandler);
adminRouter.get("/tax-darogas", listTaxDarogasHandler);
adminRouter.get("/tax-surveyors", listTaxSurveyorsHandler);

// Tax Collector -> City Manager assignment for cancellation-request
// routing - Commissioner only. See taxCollectorAssignment.controller.ts.
adminRouter.get("/tax-collectors-with-assignment", requireAdminRole("commissioner"), listTaxCollectorsWithAssignmentHandler);
adminRouter.get("/city-managers", requireAdminRole("commissioner"), listCityManagersHandler);
adminRouter.post("/tax-collectors/:username/assign-city-manager", requireAdminRole("commissioner"), assignCityManagerHandler);
adminRouter.post("/migrated-holdings/:holdingNo/assign", assignToSurveyorHandler);
adminRouter.get("/migrated-holdings/my-assignments", listMyAssignmentsHandler);
adminRouter.post("/migrated-holdings/:holdingNo/assign-surveyor", assignToTaxSurveyorHandler);
adminRouter.get("/migrated-holdings/my-surveys", listMySurveysHandler);
adminRouter.post("/migrated-holdings/:holdingNo/submit-survey", submitSurveyorEntryHandler);
adminRouter.post("/migrated-holdings/:holdingNo/verify-tax-daroga", verifyByTaxDarogaHandler);
adminRouter.post("/migrated-holdings/:holdingNo/revert", revertToSurveyorHandler);
adminRouter.get("/migrated-holdings/pending-final-verification", listPendingFinalVerificationHandler);
adminRouter.post("/migrated-holdings/:holdingNo/finalize", finalizeVerificationHandler);
adminRouter.get("/migrated-holdings/:holdingNo/events", listEventsForHoldingHandler);

// Property resurvey flags - raised by Tax Collectors during
// collection when a holding's recorded details look different from
// what they found on the ground. Viewable/reviewable by Tax Daroga
// or Commissioner; export restricted to Commissioner, matching the
// migrated-holdings export pattern.
const requireResurveyFlagReviewRole = requireAdminRole("tax_daroga", "commissioner");
adminRouter.get("/property-resurvey-flags", requireResurveyFlagReviewRole, listResurveyFlagsHandler);
adminRouter.post("/property-resurvey-flags/:id/review", requireResurveyFlagReviewRole, reviewResurveyFlagHandler);
adminRouter.get("/property-resurvey-flags/export", requireAdminRole("commissioner"), exportResurveyFlagsHandler);


// Demand notice cancel/supersede and receipt cancel - a separate,
// FIXED 2-stage chain (Stall Prabhari, then City Manager only - no
// Deputy Commissioner, unlike the 3-stage publication/edit chains
// above), since this specific approval was asked for as exactly those
// two roles.
const requireDemandActionStageRole = requireAdminRole("stall_prabhari", "city_manager");
adminRouter.get("/shop-demand-actions", requireDemandActionStageRole, getDemandActionRequests);
adminRouter.get("/shop-demand-actions/:id", requireDemandActionStageRole, getDemandActionRequestById);
adminRouter.post("/shop-demand-actions/:id/approve", requireDemandActionStageRole, postApproveDemandAction);
adminRouter.post("/shop-demand-actions/:id/reject", requireDemandActionStageRole, postRejectDemandAction);
adminRouter.get("/shops/per-sqft-report", getPerSqftReport);
adminRouter.post("/violation-notices/:id/resolve", postResolveViolationNotice);

// Shop rental applications (new tenant applications for vacant shops)
adminRouter.get("/shop-rental-applications", getRentalApplications);
adminRouter.get("/shop-rental-applications/:id", getRentalApplicationById);
adminRouter.post("/shop-rental-applications/:id/approve", postApproveRentalApplication);
adminRouter.post("/shop-rental-applications/:id/reject", postRejectRentalApplication);

// Shop rental preferences (market/size/bid intake, before a specific shop is picked)
// - /matching must come before /:id, or Express would treat "matching" as an id.
adminRouter.get("/shop-rental-preferences", getRentalPreferences);
adminRouter.get("/shop-rental-preferences/matching", getPreferencesMatchingShop);
adminRouter.get("/shop-rental-preferences/:id", getRentalPreferenceById);
adminRouter.post("/shop-rental-preferences/:id/allot", postAllotPreference);
adminRouter.post("/shop-rental-preferences/:id/reject", postRejectRentalPreference);

// Trade license applications (new + renewal) — /stats MUST come before
// /:id below, or Express would try to parse "stats" as an id.
// Restricted from Stall Prabhari - trade licenses aren't part of the
// shop/rental workflow that role is scoped to.
adminRouter.get("/trade-license-applications/stats", requireNonStallPrabhari, getTradeLicenseStats);
adminRouter.get("/trade-license-applications", requireNonStallPrabhari, getTradeLicenseApplications);
adminRouter.get("/trade-license-applications/:id", requireNonStallPrabhari, getTradeLicenseApplicationById);
adminRouter.post("/trade-license-applications/:id/approve", requireNonStallPrabhari, postApproveTradeLicenseApplication);
adminRouter.post("/trade-license-applications/:id/reject", requireNonStallPrabhari, postRejectTradeLicenseApplication);

// Bulk demand notice generation
adminRouter.post("/demand-notices/bulk-generate", requireSeniorAdmin, postBulkGenerateDemandNotices);

// Bulk tax-history-stage regeneration (backfill from current Floors)
adminRouter.post("/tax-history/bulk-regenerate", requireSeniorAdmin, postBulkRegenerateTaxHistory);

// Data export - GET /api/v1/admin/export?dataset=properties|payments|notices|changes|all
adminRouter.get("/export", requireSeniorAdmin, getDataExport);

// Tax collector management - any admin except Stall Prabhari can view/create/toggle.
adminRouter.get("/tax-collectors", requireNonStallPrabhari, listTaxCollectors);
adminRouter.post("/tax-collectors", requireNonStallPrabhari, createTaxCollector);
adminRouter.patch("/tax-collectors/:id/active", requireNonStallPrabhari, setTaxCollectorActive);

// Ward tagging - viewing is open to any admin except Stall Prabhari,
// but only Tax Daroga can change which wards a collector is allowed
// to operate in.
adminRouter.get("/tax-collectors/available-wards", requireNonStallPrabhari, getAvailableWards);
adminRouter.get("/tax-collectors/:id/wards", requireNonStallPrabhari, getTaxCollectorWards);
adminRouter.put("/tax-collectors/:id/wards", requireAdminRole("tax_daroga"), setTaxCollectorWards);

// Assistant Town Planning Supervisor (ATPS) and Commissioner
// capture/edit coordinates and manage KML imports. Assistant
// Architect is view-only (the GIS map) - added to search/view/export
// endpoints but deliberately left off anything that writes data.
const requireGeoEditRole = requireAdminRole("assistant_town_planning_supervisor", "commissioner");
const requireGeoViewRole = requireAdminRole("assistant_town_planning_supervisor", "commissioner", "assistant_architect");
adminRouter.get("/geo/properties/search", requireGeoViewRole, searchPropertiesForGeo);
adminRouter.get("/geo/properties/all", requireGeoViewRole, listAllPropertyGeoHandler);
adminRouter.get("/geo/properties/:holdingNo", requireGeoViewRole, getPropertyGeo);
adminRouter.put("/geo/properties/:holdingNo", requireGeoEditRole, putPropertyGeo);
adminRouter.get("/geo/progress", requireGeoViewRole, getGeoProgress);
adminRouter.get("/geo/infrastructure-lines", requireGeoViewRole, listInfrastructureLinesHandler);
adminRouter.post("/geo/infrastructure-lines", requireGeoEditRole, createInfrastructureLineHandler);
adminRouter.post("/geo/infrastructure-lines/import-kml", requireGeoEditRole, importInfrastructureLinesKmlHandler);
adminRouter.put("/geo/infrastructure-lines/:id", requireGeoEditRole, updateInfrastructureLineHandler);
adminRouter.delete("/geo/infrastructure-lines/:id", requireGeoEditRole, deleteInfrastructureLineHandler);
adminRouter.get("/geo/ward-boundaries", requireGeoViewRole, listWardBoundariesHandler);
adminRouter.post("/geo/ward-boundaries/import-kml", requireGeoEditRole, importWardBoundariesKmlHandler);
adminRouter.delete("/geo/ward-boundaries/:id", requireGeoEditRole, deleteWardBoundaryHandler);
adminRouter.get("/geo/export", requireGeoViewRole, exportGeoData);