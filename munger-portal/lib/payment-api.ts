import { getOperatorToken } from "./auth";
import type { DemandNoticeData } from "./demand-notice-api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export interface PaymentInput {
  paymentMode: string;
  counter?: string;
  /** Required — references the demand notice being paid; amount is frozen server-side from that notice. */
  demandNo: string;
  /** Optional — which tax collector (field agent) facilitated this payment, if any. */
  taxCollectorCode?: string | null;
  /** Required only when paymentMode is "District Treasury". */
  tvNumber?: string | null;
  /** Required only when paymentMode is "District Treasury". */
  tvDate?: string | null;
}

export interface ArrearStagePaidView {
  period: string;
  years: number;
  annualCharge: string;
  amount: string;
}

export interface FloorBreakdownEntry {
  floor: string;
  demolished?: boolean;
  error?: string | null;
  area?: number;
  constType?: string;
  usage?: string;
  occupancy?: string;
  rate?: number;
  floorArv?: string;
  floorTax?: string;
}

export interface ReceiptData {
  receiptNo: string;
  formattedReceiptNo: string;
  date: string;
  paymentMode: string;
  amountReceived: string;
  amountInWords: string;
  collectedBy: string;
  demandNo: string;
  verificationUrl: string;
  taxCollectorCode: string | null;
  taxCollectorName: string | null;
  tvNumber: string | null;
  tvDate: string | null;
  /** Set only for public online payments - when the payer ticked the declaration. */
  onlineDeclarationAcceptedAt?: string | null;
  arrearStagesPaid: ArrearStagePaidView[];
  /** After a PART payment: the balance demand notice for the remaining years, generated automatically. */
  followUpNotice?: DemandNoticeData | null;
  followUpNoticeError?: string | null;
  property: Record<string, string | number | boolean | null>;
  floors: unknown[];
  taxCalc: {
    arv: string;
    currentTax: string;
    rebate: string;
    breakdown: FloorBreakdownEntry[];
    vacant: {
      declaredArea: string;
      taxableArea: string;
      groundFloorBuiltArea: string;
      totalPlotArea: string;
      rate: number;
      tax: string;
    };
  };
  totals: {
    yearWiseArrears: string;
    currentTax: string;
    rebate: string;
    penalty: string;
    outstandingDemand: string;
    currentTaxLateFee: string;
    currentTaxRebate: string;
    currentTotal: string;
    grandTotal: string;
  };
}

export interface PaymentError {
  message: string;
  details?: Record<string, string[]>;
}

export async function submitPayment(holdingNo: string, input: PaymentInput): Promise<ReceiptData> {
  const token = getOperatorToken();
  if (!token) throw { message: "Not logged in — please log in again." } as PaymentError;

  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw { message: body.error || "Payment failed", details: body.details } as PaymentError;
  }

  return res.json();
}