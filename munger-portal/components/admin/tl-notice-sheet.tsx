import { QRCodeSVG } from "qrcode.react";
import type { TlNotice } from "@/lib/tl-notice-api";

/**
 * One trade-licence notice, sized to half an A4 sheet, Hindi with English. Every notice prints as both halves of one
 * sheet (see TlNoticePages): the top half is given to the business; the bottom half - the receiving copy - is signed by
 * the business and kept by the Tax Collector, who photographs it and uploads it in the portal. Signed by the City
 * Manager; the Tax Collector who recorded the visit is deliberately not named on it.
 */
export function TlNoticeSheet({ n, receiving = false, printerRole }: { n: TlNotice; receiving?: boolean; printerRole?: string }) {
  // Signed by the Trade Licence Prabhari when they print it (kept on the notice for reprints), else by the City Manager.
  const byPrabhari = (n.printedByRole ?? printerRole) === "trade_license_nodal";
  const second = n.level === 2;
  const fy = n.financialYear;
  const cell = "border border-black px-1.5 py-[1px]";
  // The QR code (application form filled in from this notice) is on the business's copy only.
  const qr = !receiving && n.applyUrl ? n.applyUrl : null;
  return (
    <div
      className="tl-notice relative mx-auto overflow-hidden bg-white px-6 py-3 text-[12px] leading-snug text-black"
      style={{ width: "190mm", height: "128mm", boxSizing: "border-box" }}
    >
      {qr && (
        // Scanning it opens the trade licence application form, already filled in from this notice.
        <div className="absolute left-4 top-2 w-[21mm] text-center">
          <QRCodeSVG value={qr} size={68} level="M" />
          <p className="mt-0.5 text-[7px] font-semibold leading-tight">आवेदन हेतु स्कैन करें / Scan to apply</p>
        </div>
      )}
      <p className="absolute right-6 top-2 border border-black px-1 text-[9px] font-bold">
        {receiving ? "प्राप्ति प्रति / RECEIVING COPY" : "व्यापारी प्रति / BUSINESS COPY"}
      </p>
      <div className={`mt-3 border-b-2 border-black pb-1 text-center ${qr ? "pl-[19mm]" : ""}`}>
        <p className="text-[15px] font-bold leading-tight">मुंगेर नगर निगम / MUNGER NAGAR NIGAM, MUNGER (BIHAR)</p>
        <p className="mt-1 inline-block border border-black px-2 text-[11px] font-bold">
          {second ? "द्वितीय एवं अंतिम सूचना / SECOND & FINAL NOTICE" : "सूचना / NOTICE"} — व्यापार अनुज्ञप्ति / TRADE LICENCE
        </p>
      </div>

      <div className={`mt-1 flex justify-between ${qr ? "pl-[19mm]" : ""}`}>
        <p>
          सूचना क्रमांक / Notice No: <b>{n.noticeNo}</b>
        </p>
        <p>
          दिनांक / Date: <b>{n.issuedOn}</b>
        </p>
      </div>

      <table className="mt-1 w-full border-collapse">
        <tbody>
          <tr>
            <td className={`${cell} w-[20%]`}>प्रतिष्ठान / Business</td>
            <td className={`${cell} w-[30%] font-semibold`}>{n.businessName}</td>
            <td className={`${cell} w-[20%]`}>संचालक / Person</td>
            <td className={`${cell} font-semibold`}>{n.personName}</td>
          </tr>
          <tr>
            <td className={cell}>पता / Address</td>
            <td className={`${cell} font-semibold`} colSpan={3}>
              {n.address}
            </td>
          </tr>
          <tr>
            <td className={cell}>होल्डिंग सं. / Holding No</td>
            <td className={`${cell} font-semibold`}>{n.holdingNo}</td>
            <td className={cell}>वार्ड / Ward</td>
            <td className={`${cell} font-semibold`}>{n.ward ?? "-"}</td>
          </tr>
          <tr>
            <td className={cell}>मोबाइल / Phone</td>
            <td className={`${cell} font-semibold`}>{n.phone}</td>
            <td className={cell}>अंतिम तिथि / Last date</td>
            <td className={`${cell} font-bold`}>सूचना प्राप्ति से 14 दिन / 14 days from receipt</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-2 space-y-1.5">
        {second ? (
          <>
            <p>
              इस कार्यालय की सूचना क्रमांक <b>{n.firstNoticeNo}</b> दिनांक <b>{n.firstNoticeDate}</b> द्वारा आपको वित्तीय वर्ष <b>{fy}</b> के लिए
              व्यापार अनुज्ञप्ति (ट्रेड लाइसेंस) 14 दिनों के भीतर प्राप्त करने का निर्देश दिया गया था, परंतु आपके द्वारा अनुज्ञप्ति प्राप्त नहीं की गई है। अंतिम अवसर
              देते हुए निर्देश दिया जाता है कि इस सूचना की प्राप्ति की तिथि से <b>14 दिनों के भीतर</b> वित्तीय वर्ष {fy} की व्यापार अनुज्ञप्ति अवश्य प्राप्त कर
              लें, अन्यथा आपके विरुद्ध नियमानुसार विधिक कार्रवाई की जाएगी, जिसकी समस्त जिम्मेदारी आपकी होगी।
            </p>
            <p>
              By Notice No <b>{n.firstNoticeNo}</b> dated <b>{n.firstNoticeDate}</b> you were directed to obtain a trade licence for{" "}
              <b>{fy}</b> within 14 days, which you have not done. As a final opportunity, obtain the trade licence for {fy}{" "}
              <b>within 14 days of receipt of this notice</b>, failing which legal action will be taken against you as per law, for which
              you alone will be responsible.
            </p>
          </>
        ) : (
          <>
            <p>
              नगर निगम के प्रतिनिधि द्वारा दिनांक <b>{n.issuedOn}</b> को निरीक्षण में पाया गया कि आपके प्रतिष्ठान द्वारा वित्तीय वर्ष <b>{fy}</b> के लिए
              वैध व्यापार अनुज्ञप्ति (ट्रेड लाइसेंस) प्राप्त नहीं की गई है
              {n.licenseValidTill ? ` (प्रस्तुत अनुज्ञप्ति की वैधता वर्ष ${n.licenseValidTill} तक ही थी)` : ""}। अतः निर्देश दिया जाता है कि इस सूचना की
              प्राप्ति की तिथि से <b>14 दिनों के भीतर</b> नगर निगम से वित्तीय वर्ष {fy} की व्यापार अनुज्ञप्ति प्राप्त कर लें। निर्देश का पालन नहीं करने पर
              नियमानुसार विधिक कार्रवाई की जाएगी।
            </p>
            <p>
              On inspection on <b>{n.issuedOn}</b> by a representative of the Nagar Nigam, your business was found to be without a valid
              trade licence for <b>{fy}</b>
              {n.licenseValidTill ? ` (the licence shown was valid only till ${n.licenseValidTill})` : ""}. You are directed to obtain the
              trade licence for {fy} from Munger Nagar Nigam <b>within 14 days of receipt of this notice</b>. Non-compliance will lead to
              legal consequences as per law.
            </p>
          </>
        )}
        <p className="text-[10.5px]">
          आवेदन नगर निगम कार्यालय या पोर्टल पर करें तथा अनुज्ञप्ति की प्रति इस सूचना के संदर्भ के साथ जमा करें। / Apply at the Nagar Nigam office or portal
          and submit a copy of the licence quoting this notice.
        </p>
      </div>

      <div className="absolute bottom-3 left-6 right-6 flex items-end justify-between">
        <div className="text-[10.5px]">
          {receiving && (
            <>
              <p className="font-semibold">सूचना प्राप्त की / Notice received by</p>
              <p className="mt-4">नाम व हस्ताक्षर / Name & signature: ______________________</p>
              <p className="mt-2">मोबाइल / Mobile: ________________ &nbsp; दिनांक / Date: ____________</p>
            </>
          )}
        </div>
        <div className="text-center">
          <p className="font-semibold">{byPrabhari ? "अनुज्ञप्ति प्रभारी / Trade Licence Prabhari" : "सिटी मैनेजर / City Manager"}</p>
          <p>मुंगेर नगर निगम, मुंगेर</p>
        </div>
      </div>
    </div>
  );
}

/**
 * One A4 page per notice: the business copy on the top half and the receiving copy on the bottom half, with a cut line
 * between. Each half is 128 mm, so the pair fits A4 and Letter paper even with the printer's own margins.
 */
export function TlNoticePages({ notices, printerRole }: { notices: TlNotice[]; printerRole?: string }) {
  return (
    <>
      {/* The site-wide print CSS hides everything outside .printable-area (a single fixed-position sheet); these pages
          flow over several sheets, so they opt back in. */}
      <style>
        {
          "@page { size: A4; margin: 6mm; } @media print { html, body { height: auto !important; } .tl-print, .tl-print * { visibility: visible !important; } }"
        }
      </style>
      {notices.map((n, i) => (
        <div
          key={n.id}
          className="tl-print"
          style={{
            breakInside: "avoid",
            pageBreakInside: "avoid",
            breakAfter: i < notices.length - 1 ? "page" : "auto",
            pageBreakAfter: i < notices.length - 1 ? "always" : "auto",
          }}
        >
          <TlNoticeSheet n={n} printerRole={printerRole} />
          <div className="relative mx-auto border-t border-dashed border-slate-500" style={{ width: "190mm", margin: "2.5mm auto" }}>
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-white px-2 text-[8px] text-slate-600">
              ✂ यहाँ से काटें / cut here
            </span>
          </div>
          <TlNoticeSheet n={n} receiving printerRole={printerRole} />
        </div>
      ))}
    </>
  );
}
