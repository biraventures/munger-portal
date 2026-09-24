import { pool } from "../config/db";
import { cancellationRequestRepository } from "../repositories/cancellationRequest.repository";
import { demandNoticeRepository } from "../repositories/demandNotice.repository";
import { paymentRepository } from "../repositories/payment.repository";
import { adminRepository } from "../repositories/admin.repository";
import { ApiError } from "../utils/ApiError";
import type { CancellationRequestRow } from "../repositories/cancellationRequest.repository";

/**
 * Any operator or Tax Collector can request cancellation of any
 * demand notice or receipt (not restricted to their own). Both go
 * through Tax Daroga review; a Tax Collector's request additionally
 * needs the sign-off of whichever City Manager the Commissioner
 * assigned to them (see admin.repository.ts's assignCityManager) -
 * an operator's request is decided by Tax Daroga alone, exactly as
 * before.
 */
export async function requestCancellation(
  requestType: "demand_notice" | "receipt",
  targetId: string,
  reason: string,
  requestedBy: string,
  requestedByUsername?: string | null,
  requestedByRole?: string | null,
): Promise<CancellationRequestRow> {
  if (!reason.trim()) throw ApiError.badRequest("A reason is required to request a cancellation.");

  const alreadyPending = await cancellationRequestRepository.findPendingForTarget(requestType, targetId);
  if (alreadyPending) {
    throw ApiError.badRequest(`A cancellation request for this ${requestType === "demand_notice" ? "demand notice" : "receipt"} is already pending approval.`);
  }

  let holdingNo: string;
  if (requestType === "demand_notice") {
    const notice = await demandNoticeRepository.findByDemandNo(targetId);
    if (!notice) throw ApiError.notFound(`Demand notice ${targetId} not found.`);
    if (notice.cancelled) throw ApiError.badRequest("This demand notice is already cancelled.");
    if (notice.settled) {
      throw ApiError.badRequest("This demand notice has already been paid - request cancellation of its receipt instead, which will also revert this notice.");
    }
    holdingNo = notice.holding_no;
  } else {
    const txn = await paymentRepository.findByReceiptNo(targetId);
    if (!txn) throw ApiError.notFound(`Receipt ${targetId} not found.`);
    if (txn.cancelled) throw ApiError.badRequest("This receipt is already cancelled.");
    holdingNo = txn.holding_no;
  }

  let assignedCityManagerUsername: string | null = null;
  let assignedCityManagerDisplayName: string | null = null;
  if (requestedByRole === "tax_collector" && requestedByUsername) {
    const collector = await adminRepository.findByUsername(requestedByUsername);
    if (collector?.assigned_city_manager_username) {
      const cityManager = await adminRepository.findByUsername(collector.assigned_city_manager_username);
      if (cityManager) {
        assignedCityManagerUsername = cityManager.username;
        assignedCityManagerDisplayName = cityManager.display_name;
      }
    }
  }

  return cancellationRequestRepository.create({
    requestType,
    targetId,
    holdingNo,
    reason: reason.trim(),
    requestedBy,
    requestedByUsername,
    requestedByRole,
    assignedCityManagerUsername,
    assignedCityManagerDisplayName,
  });
}

export async function listPendingCancellationRequests(): Promise<CancellationRequestRow[]> {
  return cancellationRequestRepository.listPending();
}

export async function listCancellationRequests(status?: "pending" | "approved" | "rejected"): Promise<CancellationRequestRow[]> {
  return cancellationRequestRepository.list({ status });
}

/**
 * Atomically finalizes a request as approved AND applies the
 * cancellation (cancels the receipt/demand notice, reverting a
 * settled demand notice back to payable if its receipt is what's
 * being cancelled) in one transaction - a failure partway through can
 * never leave the request marked approved but the underlying
 * receipt/notice untouched, or vice versa. Called only once a request
 * has cleared every stage it needs (Tax Daroga alone, or Tax Daroga
 * then City Manager).
 */
async function finalizeAndApplyCancellation(requestId: number, reviewedBy: string, reviewNotes: string | null): Promise<CancellationRequestRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const request = await cancellationRequestRepository.finalize(requestId, "approved", reviewedBy, reviewNotes, client);
    if (!request) throw ApiError.badRequest("This request is no longer pending (already reviewed).");

    if (request.request_type === "demand_notice") {
      const cancelled = await demandNoticeRepository.cancel(request.target_id, request.reason, client);
      if (!cancelled) {
        throw ApiError.badRequest("Could not cancel this demand notice - it may have been settled or already cancelled since the request was made.");
      }
    } else {
      const txn = await paymentRepository.findByReceiptNo(request.target_id);
      if (!txn) throw ApiError.notFound(`Receipt ${request.target_id} not found.`);

      const cancelledTxn = await paymentRepository.cancel(request.target_id, request.reason, client);
      if (!cancelledTxn) throw ApiError.badRequest("Could not cancel this receipt - it may already be cancelled.");

      if (txn.demand_no) {
        await demandNoticeRepository.revertToUnsettled(txn.demand_no, client);
      }
    }

    await client.query("COMMIT");
    return request;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * tax_daroga only. For an operator-raised request (no assigned City
 * Manager), this finalizes and applies the cancellation directly -
 * unchanged from before. For a Tax-Collector-raised request, this
 * only advances it to the assigned City Manager's stage; the
 * cancellation isn't applied until that City Manager approves too.
 */
export async function approveCancellationAtTaxDaroga(requestId: number, reviewedBy: string, reviewNotes: string | null): Promise<CancellationRequestRow> {
  const request = await cancellationRequestRepository.findById(requestId);
  if (!request) throw ApiError.notFound("Cancellation request not found.");
  if (request.status !== "pending" || request.stage !== "tax_daroga") throw ApiError.badRequest("This request isn't awaiting your review.");

  if (request.assigned_city_manager_username) {
    const advanced = await cancellationRequestRepository.advanceToCityManager(requestId, reviewedBy, reviewNotes);
    if (!advanced) throw ApiError.badRequest("This request is no longer awaiting your review.");
    return advanced;
  }

  return finalizeAndApplyCancellation(requestId, reviewedBy, reviewNotes);
}

/** The City Manager assigned to this request's Tax Collector - final approval, applies the cancellation. */
export async function approveCancellationAtCityManager(requestId: number, cityManagerUsername: string, reviewedBy: string, reviewNotes: string | null): Promise<CancellationRequestRow> {
  const request = await cancellationRequestRepository.findById(requestId);
  if (!request) throw ApiError.notFound("Cancellation request not found.");
  if (request.status !== "pending" || request.stage !== "city_manager") throw ApiError.badRequest("This request isn't awaiting your review.");
  if (request.assigned_city_manager_username !== cityManagerUsername) throw ApiError.badRequest("This request wasn't assigned to you.");

  return finalizeAndApplyCancellation(requestId, reviewedBy, reviewNotes);
}

/** tax_daroga only. Rejecting leaves the notice/receipt completely untouched - only the request itself is marked rejected. */
export async function rejectCancellation(requestId: number, reviewedBy: string, reviewNotes: string | null): Promise<CancellationRequestRow> {
  const request = await cancellationRequestRepository.finalize(requestId, "rejected", reviewedBy, reviewNotes);
  if (!request) throw ApiError.badRequest("This request is no longer pending (already reviewed).");
  return request;
}
