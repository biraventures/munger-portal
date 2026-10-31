import { useRef, useState } from "react";

interface ReceiptData {
    // UPI / QR related (empty strings on card sales)
    Address: string;
    City: string;
    MerchantName: string;
    MerchantVPA: string;
    PayerAmount: string;
    PayerMobile: string;
    PayerName: string;
    PayerVPA: string;
    SMID: string;
    TxnCompletionDate: string;
    TxnInitDate: string;
    TxnStatus: string;

    // Card / EMV
    AID: string;
    AuthCode: string;
    CrdType: string;            // e.g. "VISA"
    EmvAppName: string;         // e.g. "Visa Debit"
    Last4Digit: string;         // masked, e.g. "************1660"
    NameOnCard: string;
    PosEntryMode: string;
    TC: string;
    TSI: string;
    TVR: string;
    CertIf: string;
    ContactType: number;
    IsPinEntered: boolean;
    IsSigned: boolean;

    // Amounts
    BaseAmount: string;         // "3993.00"
    SaleAmt: string;
    TipAmount: string;
    TipAmtType: string;
    CashAmt: string;
    Currency: string;           // "INR"
    currencyCode: string;
    IsOfferSale: boolean;

    // DCC
    DCCCommission: string;
    DCCConversionRate: string;
    DCCCurrencyCode: string;
    DCCCurrencyFlag: string;
    DCCInverseConversionRate: string;
    DCCRateMarkup: string;
    DCCRateMarkupText: string;

    // Transaction / terminal identifiers
    AppVersion: string;
    BankLogo: string;
    BankName: string;
    BatchNr: string;
    billNumber: string;         // note: lowercase 'b'
    CustCode: string;
    DateTime: string;           // "2026-10-31"
    InvoiceNr: string;
    switchInvoiceNo: string;
    MID: string;
    TID: string;
    RRN: string;
    Stan: string;
    TranType: string;           // "Sale"
    type: string;
}

interface IntentResult {
    RESPONSE_TYPE: 'SALE' | 'QR' | (string & {});
    STATUS_CODE: string;        // "00" = success
    STATUS_MSG: string;         // "SUCCESS"
    RECEIPT_DATA: ReceiptData;
    UDF1: string;
    UDF2: string;
    UDF3: string;
    UDF4: string;
    UDF5: string;
}

export interface IntentResponse {
    extras: {
        RESULT: IntentResult;
        CODE_RESULT?: string;     // in the docs, but absent from your sample
    };
    statusMsg: string;
    receiptData: ReceiptData;   // same as extras.RESULT.RECEIPT_DATA
    resultCode: number;         // -1 in sample (Android RESULT_OK)
    ok: boolean;
    responseType: 'SALE' | 'QR' | (string & {});
    statusCode: string;         // "00" = success
    pm: 'CARD' | (string & {}); // payment mode; other values unknown
}

const IntentHandler = ({ handler }: { handler: (data: IntentResponse) => void }) => {
    const intentFieldRef = useRef<HTMLInputElement>(null);

    const [intentResult, setIntentResult] = useState<string>("Waiting for intent data...");

    const handleIntentClick = (): void => {
        const intentData = intentFieldRef.current?.value;

        if (!intentData) {
            setIntentResult("No intent data received.");
            return;
        }

        try {
            // Parse JSON if applicable
            const parsedData: IntentResponse = JSON.parse(intentData);
            handler(parsedData)
            setIntentResult(JSON.stringify(parsedData, null, 2));
        } catch {
            // Display raw text if it is not valid JSON
            console.log(intentData)
            setIntentResult(intentData);
        }
    };

    return (
        <div>
            {/* Hidden Intent Field */}
            <input
                type="text"
                id="intent_field"
                ref={intentFieldRef}
                style={{ display: "none" }}
            />

            {/* Hidden Intent Button */}
            <button
                type="button"
                id="intent_button"
                style={{ display: "none" }}
                onClick={handleIntentClick}
            >
                Capture Intent
            </button>

            {/* Visible Debug Output */}
            <div
                style={{
                    margin: "20px",
                    padding: "16px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                    background: "#f5f5f5",
                    color: "#222",
                    overflowX: "auto",
                }}
            >
                <h3>Intent Debugger</h3>

                <pre
                    style={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontSize: "14px",
                    }}
                >
                    {intentResult}
                </pre>
            </div>
        </div>
    );
};

export default IntentHandler;