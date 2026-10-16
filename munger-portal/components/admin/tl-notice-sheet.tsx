import type { TlNotice } from "@/lib/tl-notice-api";

/**
 * One trade-licence notice, sized to half an A4 sheet (two per page - see TlNoticePages), Hindi with English. Signed by
 * the City Manager; the Tax Collector who recorded the visit is deliberately not named on it.
 */
export function TlNoticeSheet({ n, officeCopy = false }: { n: TlNotice; officeCopy?: boolean }) {
  const second = n.level === 2;
  const fy = n.financialYear;
  const cell = "border border-black px-1.5 py-[1px]";
  return (
    <div className="tl-notice relative mx-auto overflow-hidden bg-white px-6 py-3 text-[12px] leading-snug text-black" style={{ width: "190mm", height: "134mm", boxSizing: "border-box" }}>
      {officeCopy && <p className="absolute right-6 top-2 text-[9px] font-bold">कार्यालय प्रति / OFFICE COPY</p>}
      <div className="border-b-2 border-black pb-1 text-center">
        <p className="text-[15px] font-bold leading-tight">मुंगेर नगर निगम / MUNGER NAGAR NIGAM, MUNGER (BIHAR)</p>
        <p className="mt-1 inline-block border border-black px-2 text-[11px] font-bold">
          {second ? "द्वितीय एवं अंतिम सूचना / SECOND & FINAL NOTICE" : "सूचना / NOTICE"} — व्यापार अनुज्ञप्ति / TRADE LICENCE
        </p>
      </div>

      <div className="mt-1 flex justify-between">
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
            <td className={`${cell} font-bold`}>{n.dueOn}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-2 space-y-1.5">
        {second ? (
          <>
            <p>
              इस कार्यालय की सूचना क्रमांक <b>{n.firstNoticeNo}</b> दिनांक <b>{n.firstNoticeDate}</b> द्वारा आपको वित्तीय वर्ष <b>{fy}</b> के लिए व्यापार
              अनुज्ञप्ति (ट्रेड लाइसेंस) 14 दिनों के भीतर प्राप्त करने का निर्देश दिया गया था, परंतु आपके द्वारा अनुज्ञप्ति प्राप्त नहीं की गई है। अंतिम अवसर
              देते हुए निर्देश दिया जाता है कि दिनांक <b>{n.dueOn}</b> तक वित्तीय वर्ष {fy} की व्यापार अनुज्ञप्ति अवश्य प्राप्त कर लें, अन्यथा आपके विरुद्ध
              नियमानुसार विधिक कार्रवाई की जाएगी, जिसकी समस्त जिम्मेदारी आपकी होगी।
            </p>
            <p>
              By Notice No <b>{n.firstNoticeNo}</b> dated <b>{n.firstNoticeDate}</b> you were directed to obtain a trade licence for <b>{fy}</b> within 14
              days, which you have not done. As a final opportunity, obtain the trade licence for {fy} on or before <b>{n.dueOn}</b>, failing which legal
              action will be taken against you as per law, for which you alone will be responsible.
            </p>
          </>
        ) : (
          <>
            <p>
              नगर निगम के प्रतिनिधि द्वारा दिनांक <b>{n.issuedOn}</b> को निरीक्षण में पाया गया कि आपके प्रतिष्ठान द्वारा वित्तीय वर्ष <b>{fy}</b> के लिए वैध
              व्यापार अनुज्ञप्ति (ट्रेड लाइसेंस) प्राप्त नहीं की गई है
              {n.licenseValidTill ? ` (प्रस्तुत अनुज्ञप्ति की वैधता वर्ष ${n.licenseValidTill} तक ही थी)` : ""}। अतः निर्देश दिया जाता है कि 14 दिनों के
              भीतर, अर्थात दिनांक <b>{n.dueOn}</b> तक, नगर निगम से वित्तीय वर्ष {fy} की व्यापार अनुज्ञप्ति प्राप्त कर लें। निर्देश का पालन नहीं करने पर
              नियमानुसार विधिक कार्रवाई की जाएगी।
            </p>
            <p>
              On inspection on <b>{n.issuedOn}</b> by a representative of the Nagar Nigam, your business was found to be without a valid trade licence for{" "}
              <b>{fy}</b>
              {n.licenseValidTill ? ` (the licence shown was valid only till ${n.licenseValidTill})` : ""}. You are directed to obtain the trade licence
              for {fy} from Munger Nagar Nigam within 14 days, i.e. on or before <b>{n.dueOn}</b>. Non-compliance will lead to legal consequences as per
              law.
            </p>
          </>
        )}
        <p className="text-[10.5px]">
          आवेदन नगर निगम कार्यालय या पोर्टल पर करें तथा अनुज्ञप्ति की प्रति इस सूचना के संदर्भ के साथ जमा करें। / Apply at the Nagar Nigam office or
          portal and submit a copy of the licence quoting this notice.
        </p>
      </div>

      <div className="absolute bottom-3 left-6 right-6 flex items-end justify-between">
        <div className="text-[10.5px]">
          {officeCopy && (
            <>
              <p className="font-semibold">प्राप्ति / Received</p>
              <p className="mt-4">नाम व हस्ताक्षर / Name & signature: ____________________ &nbsp; दिनांक / Date: __________</p>
            </>
          )}
        </div>
        <div className="text-center">
          <p className="font-semibold">सिटी मैनेजर / City Manager</p>
          <p>मुंगेर नगर निगम, मुंगेर</p>
        </div>
      </div>
    </div>
  );
}

/** Lays notices out two to an A4 page with a cut line between them. */
export function TlNoticePages({ sheets }: { sheets: { key: string; n: TlNotice; officeCopy?: boolean }[] }) {
  const pages: (typeof sheets)[] = [];
  for (let i = 0; i < sheets.length; i += 2) pages.push(sheets.slice(i, i + 2));
  return (
    <>
      {/* The site-wide print CSS hides everything outside .printable-area (a single fixed-position sheet); these pages
          flow over several sheets, so they opt back in. */}
      <style>
        {"@page { size: A4; margin: 8mm; } @media print { html, body { height: auto !important; } .tl-print, .tl-print * { visibility: visible !important; } }"}
      </style>
      {pages.map((pair, i) => (
        <div key={pair[0]!.key} className="tl-print" style={{ breakAfter: i < pages.length - 1 ? "page" : "auto", pageBreakAfter: i < pages.length - 1 ? "always" : "auto" }}>
          <TlNoticeSheet n={pair[0]!.n} officeCopy={pair[0]!.officeCopy} />
          {pair[1] && (
            <>
              <div className="mx-auto border-t border-dashed border-slate-500" style={{ width: "190mm", margin: "3mm auto" }} />
              <TlNoticeSheet n={pair[1].n} officeCopy={pair[1].officeCopy} />
            </>
          )}
        </div>
      ))}
    </>
  );
}
