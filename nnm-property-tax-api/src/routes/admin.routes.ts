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

// Demand notice / receipt cancellation approval queue - viewable by
// any admin role except Stall Prabhari, but approve/reject is
// tax_daroga-only (unlike the property mutation chain above, this
// doesn't escalate through multiple roles).
const requireTaxDaroga = requireAdminRole("tax_daroga");
adminRouter.get("/cancellation-requests", requireNonStallPrabhari, getCancellationRequests);
adminRouter.post("/cancellation-requests/:id/approve", requireTaxDaroga, postApproveCancellation);
adminRouter.post("/cancellation-requests/:id/reject", requireTaxDaroga, postRejectCancellation);

// Shop agreement approval queue (5-stage: Stall Prabhari -> Tax Daroga NOC -> City Manager -> Deputy Commissioner -> Commissioner)
adminRouter.get("/shop-agreement-requests", getShopAgreementRequests);
adminRouter.get("/shop-agreement-requests/:id", getShopAgreementRequestById);
adminRouter.post("/shop-agreement-requests/:id/approve", postApproveShopAgreementRequest);
adminRouter.post("/shop-agreement-requests/:id/reject", postRejectShopAgreementRequest);
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