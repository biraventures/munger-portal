import type { CollectionIssueType } from "./collectionIssue.types";

/** The two languages a notice can be generated in - see NOTICE_LANGUAGE_LABELS on the frontend for the selector copy. */
export type NoticeLanguage = "en" | "hi";

export const NOTICE_LANGUAGES: NoticeLanguage[] = ["en", "hi"];

export interface CollectionIssueNoticeTemplateText {
  /** Short label used on the notice itself, e.g. "NOTICE OF DEMAND AND WARNING OF COERCIVE RECOVERY". */
  title: string;
  /** The statutory provisions this notice is issued under - shown on the notice as its legal basis. */
  legalBasis: string;
  /**
   * The operative body text of the notice. {ownerName}, {holdingNo},
   * {address}, {ward}, {demandNo}, {totalAmountDemanded}, {issueNotes},
   * {reportedDate}, {complianceDays} are substituted at generation time
   * - see collectionIssueNotice.service.ts.
   */
  body: string;
}

export interface CollectionIssueNoticeTemplate {
  /** Number of days given to respond/comply before the next enforcement step, stated on the notice - same figure regardless of the language chosen. */
  complianceDays: number;
  /** The same notice's wording in each supported language - one City Manager generating in Hindi and another in English are issuing the identical notice, just worded differently. */
  text: Record<NoticeLanguage, CollectionIssueNoticeTemplateText>;
}

/**
 * Six standard notice formats, one per collection_issues type (migration
 * 079), grounded in the Bihar Municipal Act, 2007 and the Bihar Property
 * Tax (Assessment, Collection and Recovery) Rules, 2013, each available
 * in English and Hindi. These are starting templates for the
 * Municipality's own legal/law officer to review and adapt to local
 * practice before first use.
 */
export const COLLECTION_ISSUE_NOTICE_TEMPLATES: Record<CollectionIssueType, CollectionIssueNoticeTemplate> = {
  refused_to_pay: {
    complianceDays: 15,
    text: {
      en: {
        title: "Notice of Demand and Warning of Coercive Recovery",
        legalBasis:
          "Section 127 and Section 158 of the Bihar Municipal Act, 2007, read with the Bihar Property Tax (Assessment, Collection and Recovery) Rules, 2013",
        body:
          "Whereas Property Tax amounting to Rs. {totalAmountDemanded}/- stands due and payable in respect of Holding No. {holdingNo} " +
          "situated at {address}, Ward No. {ward}, in the name of {ownerName}, as per Demand Notice No. {demandNo} attached herewith; " +
          "\n\nAnd whereas on {reportedDate} the Tax Collector of this Municipality visited the said holding for collection of the above dues " +
          "and it is reported that {ownerName} refused to make payment of the amount demanded; " +
          "\n\nNow, therefore, {ownerName} is hereby called upon to pay the entire outstanding amount of Rs. {totalAmountDemanded}/- to the " +
          "Municipality within {complianceDays} days of the date of this notice, failing which the Municipality shall, without further notice, " +
          "proceed to recover the said amount as an arrear of tax by any or all of the following modes as provided under Section 158 of the " +
          "Bihar Municipal Act, 2007: issue of a warrant for attachment, distress and sale of movable property; attachment and sale of " +
          "immovable property; attachment of bank accounts; and such other coercive process as the Act permits, together with such interest " +
          "and penalty as may accrue for the period of default.",
      },
      hi: {
        title: "मांग की सूचना एवं बलपूर्वक वसूली की चेतावनी",
        legalBasis:
          "बिहार नगरपालिका अधिनियम, 2007 की धारा 127 एवं धारा 158, बिहार संपत्ति कर (निर्धारण, संग्रहण एवं वसूली) नियमावली, 2013 के साथ पठित",
        body:
          "जबकि धारक क्रमांक {holdingNo}, पता {address}, वार्ड क्रमांक {ward}, स्वामी {ownerName} के संबंध में संलग्न मांग सूचना क्रमांक " +
          "{demandNo} के अनुसार रु. {totalAmountDemanded}/- मात्र संपत्ति कर देय एवं बकाया है; " +
          "\n\nऔर जबकि दिनांक {reportedDate} को इस नगर निगम के कर संग्रहकर्ता (टैक्स कलेक्टर) द्वारा उक्त धारक पर उपरोक्त बकाया राशि की " +
          "वसूली हेतु भ्रमण किया गया, जिसमें प्रतिवेदित किया गया कि {ownerName} द्वारा मांगी गई राशि का भुगतान करने से इन्कार कर दिया गया; " +
          "\n\nअतः, {ownerName} को इस सूचना की तिथि से {complianceDays} दिनों के भीतर संपूर्ण बकाया राशि रु. {totalAmountDemanded}/- मात्र " +
          "नगर निगम में जमा करने हेतु निर्देशित किया जाता है, अन्यथा बिना किसी अन्य सूचना के नगर निगम बिहार नगरपालिका अधिनियम, 2007 की धारा " +
          "158 के अंतर्गत निम्नलिखित में से किसी भी अथवा सभी उपायों द्वारा उक्त राशि को कर के बकाये के रूप में वसूल करने हेतु कार्यवाही " +
          "करेगा: चल संपत्ति की कुर्की, अभिग्रहण एवं नीलामी हेतु वारंट जारी करना; अचल संपत्ति की कुर्की एवं नीलामी; बैंक खातों की कुर्की; तथा " +
          "अधिनियम द्वारा अनुमत अन्य बलपूर्वक प्रक्रिया, साथ ही व्यतिक्रम की अवधि हेतु प्रोद्भूत ब्याज एवं शास्ति (पेनाल्टी) सहित।",
      },
    },
  },
  disputes_tax_amount: {
    complianceDays: 21,
    text: {
      en: {
        title: "Notice of Demand with Intimation of Right to Object",
        legalBasis: "Section 127 of the Bihar Municipal Act, 2007, read with the Bihar Property Tax (Assessment, Collection and Recovery) Rules, 2013",
        body:
          "This is to inform {ownerName}, owner/occupier of Holding No. {holdingNo} situated at {address}, Ward No. {ward}, that as per Demand " +
          "Notice No. {demandNo} attached herewith, a sum of Rs. {totalAmountDemanded}/- stands assessed and due as Property Tax on the said " +
          "holding, computed on its Annual Rental Value in accordance with Section 127 of the Bihar Municipal Act, 2007 and the Rules made " +
          "thereunder. " +
          "\n\nOn {reportedDate} the Tax Collector of this Municipality visited the said holding for collection of the above dues, and it is " +
          "reported that {ownerName} disputes the correctness of the amount so assessed and demanded, on the following stated grounds: " +
          "\"{issueNotes}\" " +
          "\n\n{ownerName} is hereby given the opportunity to submit a written objection to the assessment, along with supporting documents, " +
          "to this Municipality within {complianceDays} days of the date of this notice. The objection shall be examined and disposed of in " +
          "accordance with the applicable provisions for revision of assessment. If no objection is received within the said period, the " +
          "amount stated in the attached Demand Notice shall be treated as final and due, and shall be recoverable as an arrear of tax under " +
          "Section 158 of the Act without further reference to this dispute.",
      },
      hi: {
        title: "मांग की सूचना एवं आपत्ति के अधिकार की सूचना",
        legalBasis: "बिहार नगरपालिका अधिनियम, 2007 की धारा 127, बिहार संपत्ति कर (निर्धारण, संग्रहण एवं वसूली) नियमावली, 2013 के साथ पठित",
        body:
          "धारक क्रमांक {holdingNo}, पता {address}, वार्ड क्रमांक {ward} के स्वामी/अधिभोगी {ownerName} को सूचित किया जाता है कि संलग्न मांग " +
          "सूचना क्रमांक {demandNo} के अनुसार, उक्त धारक पर वार्षिक भाड़ा मूल्य (Annual Rental Value) के आधार पर बिहार नगरपालिका अधिनियम, " +
          "2007 की धारा 127 एवं तत्संबंधी नियमावली के अनुसार रु. {totalAmountDemanded}/- मात्र संपत्ति कर के रूप में निर्धारित एवं देय है। " +
          "\n\nदिनांक {reportedDate} को इस नगर निगम के कर संग्रहकर्ता द्वारा उपरोक्त बकाया राशि की वसूली हेतु उक्त धारक पर भ्रमण किया गया, " +
          "जिसमें प्रतिवेदित किया गया कि {ownerName} द्वारा निर्धारित एवं मांगी गई राशि की सत्यता पर निम्नलिखित आधार पर आपत्ति व्यक्त की " +
          "गई: \"{issueNotes}\" " +
          "\n\n{ownerName} को इस सूचना की तिथि से {complianceDays} दिनों के भीतर निर्धारण के विरुद्ध समर्थक अभिलेखों सहित लिखित आपत्ति इस " +
          "नगर निगम में प्रस्तुत करने का अवसर प्रदान किया जाता है। आपत्ति की जांच एवं निराकरण निर्धारण के पुनरीक्षण संबंधी प्रावधानों के " +
          "अनुसार किया जाएगा। यदि उक्त अवधि के भीतर कोई आपत्ति प्राप्त नहीं होती है, तो संलग्न मांग सूचना में उल्लिखित राशि अंतिम एवं देय " +
          "मानी जाएगी तथा इस विवाद के संदर्भ के बिना अधिनियम की धारा 158 के अंतर्गत कर के बकाये के रूप में वसूल की जा सकेगी।",
      },
    },
  },
  disputes_solid_waste_amount: {
    complianceDays: 21,
    text: {
      en: {
        title: "Notice of Demand for Solid Waste Management User Charges",
        legalBasis: "Section 127 and Section 158 (as amended by the Bihar Municipal (Amendment) Act, 2011) of the Bihar Municipal Act, 2007",
        body:
          "This is to inform {ownerName}, owner/occupier of Holding No. {holdingNo} situated at {address}, Ward No. {ward}, that Solid Waste " +
          "Management User Charges, forming part of the total amount of Rs. {totalAmountDemanded}/- shown in Demand Notice No. {demandNo} " +
          "attached herewith, stand levied and due in respect of the said holding under the provisions of the Bihar Municipal Act, 2007 " +
          "governing the levy and recovery of user charges. " +
          "\n\nOn {reportedDate} the Tax Collector of this Municipality visited the said holding for collection of the above dues, and it is " +
          "reported that {ownerName} disputes the amount so levied as Solid Waste Management User Charges, on the following stated grounds: " +
          "\"{issueNotes}\" " +
          "\n\n{ownerName} is hereby given the opportunity to submit a written objection, along with supporting documents concerning the " +
          "category or usage of the holding relevant to the charge, to this Municipality within {complianceDays} days of the date of this " +
          "notice. If no objection is received within the said period, the User Charge shown in the attached Demand Notice shall be treated " +
          "as final and due, and shall be recoverable along with Property Tax as an arrear under Section 158 of the Act.",
      },
      hi: {
        title: "ठोस अपशिष्ट प्रबंधन उपयोगकर्ता प्रभार की मांग सूचना",
        legalBasis: "बिहार नगरपालिका अधिनियम, 2007 की धारा 127 एवं धारा 158 (बिहार नगरपालिका (संशोधन) अधिनियम, 2011 द्वारा यथासंशोधित)",
        body:
          "धारक क्रमांक {holdingNo}, पता {address}, वार्ड क्रमांक {ward} के स्वामी/अधिभोगी {ownerName} को सूचित किया जाता है कि संलग्न मांग " +
          "सूचना क्रमांक {demandNo} में दर्शाई गई कुल राशि रु. {totalAmountDemanded}/- का भाग बनने वाला ठोस अपशिष्ट प्रबंधन उपयोगकर्ता " +
          "प्रभार, बिहार नगरपालिका अधिनियम, 2007 के उपयोगकर्ता प्रभार के अधिरोपण एवं वसूली संबंधी प्रावधानों के अंतर्गत उक्त धारक के " +
          "संबंध में अधिरोपित एवं देय है। " +
          "\n\nदिनांक {reportedDate} को इस नगर निगम के कर संग्रहकर्ता द्वारा उपरोक्त बकाया राशि की वसूली हेतु उक्त धारक पर भ्रमण किया गया, " +
          "जिसमें प्रतिवेदित किया गया कि {ownerName} द्वारा ठोस अपशिष्ट प्रबंधन उपयोगकर्ता प्रभार के रूप में अधिरोपित राशि पर निम्नलिखित " +
          "आधार पर आपत्ति व्यक्त की गई: \"{issueNotes}\" " +
          "\n\n{ownerName} को इस सूचना की तिथि से {complianceDays} दिनों के भीतर धारक की श्रेणी अथवा उपयोग से संबंधित समर्थक अभिलेखों सहित " +
          "लिखित आपत्ति इस नगर निगम में प्रस्तुत करने का अवसर प्रदान किया जाता है। यदि उक्त अवधि के भीतर कोई आपत्ति प्राप्त नहीं होती है, तो " +
          "संलग्न मांग सूचना में उल्लिखित उपयोगकर्ता प्रभार अंतिम एवं देय माना जाएगा तथा अधिनियम की धारा 158 के अंतर्गत संपत्ति कर के साथ " +
          "बकाये के रूप में वसूल किया जा सकेगा।",
      },
    },
  },
  absent_door_locked: {
    complianceDays: 10,
    text: {
      en: {
        title: "Notice of Intimation - Holding Found Locked/Inaccessible",
        legalBasis: "The Bihar Property Tax (Assessment, Collection and Recovery) Rules, 2013 (provision for a holding found locked or inaccessible)",
        body:
          "This is to inform {ownerName}, owner/occupier of Holding No. {holdingNo} situated at {address}, Ward No. {ward}, that on " +
          "{reportedDate} the Tax Collector of this Municipality visited the said holding for collection of Property Tax dues of Rs. " +
          "{totalAmountDemanded}/- as per Demand Notice No. {demandNo} attached herewith, and found the holding locked and/or the occupant " +
          "not available, such that collection could not be effected. " +
          "\n\n{ownerName} is hereby requested to remain present at the said holding, or to depute an authorised representative, on the next " +
          "visit of the Tax Collector, or alternatively to make payment of the outstanding amount directly at the Municipal counter within " +
          "{complianceDays} days of the date of this notice. Failure to make payment or to remain available for collection within the said " +
          "period shall be treated as continued default, and the Municipality shall be entitled to proceed with recovery of the outstanding " +
          "amount, together with applicable interest and penalty, as an arrear of tax under Section 158 of the Bihar Municipal Act, 2007.",
      },
      hi: {
        title: "सूचना - धारक बंद/अगम्य पाया गया",
        legalBasis: "बिहार संपत्ति कर (निर्धारण, संग्रहण एवं वसूली) नियमावली, 2013 (धारक के बंद अथवा अगम्य पाए जाने संबंधी प्रावधान)",
        body:
          "धारक क्रमांक {holdingNo}, पता {address}, वार्ड क्रमांक {ward} के स्वामी/अधिभोगी {ownerName} को सूचित किया जाता है कि दिनांक " +
          "{reportedDate} को इस नगर निगम के कर संग्रहकर्ता द्वारा संलग्न मांग सूचना क्रमांक {demandNo} के अनुसार रु. {totalAmountDemanded}/- " +
          "मात्र संपत्ति कर बकाये की वसूली हेतु उक्त धारक पर भ्रमण किया गया, परंतु धारक बंद पाया गया एवं/अथवा अधिभोगी उपस्थित नहीं थे, " +
          "जिससे वसूली संपन्न नहीं हो सकी। " +
          "\n\n{ownerName} से अनुरोध किया जाता है कि कर संग्रहकर्ता की अगली यात्रा के समय वे स्वयं उक्त धारक पर उपस्थित रहें अथवा अपना " +
          "प्राधिकृत प्रतिनिधि नियुक्त करें, अथवा इस सूचना की तिथि से {complianceDays} दिनों के भीतर बकाया राशि सीधे नगर निगम काउंटर पर " +
          "जमा करें। उक्त अवधि के भीतर भुगतान न करने अथवा वसूली हेतु उपलब्ध न रहने की स्थिति को निरंतर व्यतिक्रम माना जाएगा, तथा नगर निगम " +
          "बिहार नगरपालिका अधिनियम, 2007 की धारा 158 के अंतर्गत लागू ब्याज एवं शास्ति सहित बकाया राशि की वसूली हेतु कार्यवाही करने का " +
          "अधिकारी होगा।",
      },
    },
  },
  under_construction: {
    complianceDays: 21,
    text: {
      en: {
        title: "Notice of Provisional Assessment - Holding Under Construction",
        legalBasis: "Section 127(4) of the Bihar Municipal Act, 2007, read with the Bihar Property Tax (Assessment, Collection and Recovery) Rules, 2013",
        body:
          "This is to inform {ownerName}, owner/occupier of Holding No. {holdingNo} situated at {address}, Ward No. {ward}, that on " +
          "{reportedDate} the Tax Collector of this Municipality visited the said holding for collection of dues of Rs. {totalAmountDemanded}/- " +
          "as per Demand Notice No. {demandNo} attached herewith, and reported that construction on the holding is stated to be incomplete: " +
          "\"{issueNotes}\" " +
          "\n\n{ownerName} is hereby directed to intimate this Municipality, within {complianceDays} days of the date of this notice, of the " +
          "present stage of construction and the extent of covered/built-up area actually completed on the holding, supported by such " +
          "evidence as may be required, so that the assessment may be revised, if warranted, in accordance with the classification of vacant " +
          "and partly-constructed land under the Bihar Property Tax (Assessment, Collection and Recovery) Rules, 2013. Until any such revision " +
          "is made and approved, the amount stated in the attached Demand Notice shall continue to be due and payable, and shall remain " +
          "recoverable as an arrear of tax under Section 158 of the Act if not paid or duly disputed within the said period.",
      },
      hi: {
        title: "अस्थायी निर्धारण की सूचना - निर्माणाधीन धारक",
        legalBasis: "बिहार नगरपालिका अधिनियम, 2007 की धारा 127(4), बिहार संपत्ति कर (निर्धारण, संग्रहण एवं वसूली) नियमावली, 2013 के साथ पठित",
        body:
          "धारक क्रमांक {holdingNo}, पता {address}, वार्ड क्रमांक {ward} के स्वामी/अधिभोगी {ownerName} को सूचित किया जाता है कि दिनांक " +
          "{reportedDate} को इस नगर निगम के कर संग्रहकर्ता द्वारा संलग्न मांग सूचना क्रमांक {demandNo} के अनुसार रु. {totalAmountDemanded}/- " +
          "मात्र बकाये की वसूली हेतु उक्त धारक पर भ्रमण किया गया, जिसमें प्रतिवेदित किया गया कि धारक पर निर्माण कार्य अपूर्ण बताया गया है: " +
          "\"{issueNotes}\" " +
          "\n\n{ownerName} को निर्देशित किया जाता है कि वे इस सूचना की तिथि से {complianceDays} दिनों के भीतर निर्माण की वर्तमान अवस्था " +
          "एवं धारक पर वास्तव में पूर्ण हुए ढके/निर्मित क्षेत्रफल की सूचना, आवश्यक साक्ष्यों सहित, इस नगर निगम को दें, जिससे बिहार संपत्ति " +
          "कर (निर्धारण, संग्रहण एवं वसूली) नियमावली, 2013 के अंतर्गत रिक्त एवं आंशिक रूप से निर्मित भूमि के वर्गीकरण के अनुसार, यदि " +
          "आवश्यक हो तो निर्धारण में संशोधन किया जा सके। जब तक ऐसा कोई संशोधन नहीं किया जाता एवं स्वीकृत नहीं होता, संलग्न मांग सूचना में " +
          "उल्लिखित राशि देय एवं भुगतान योग्य बनी रहेगी, तथा यदि उक्त अवधि के भीतर भुगतान अथवा सम्यक आपत्ति नहीं की जाती है तो अधिनियम की " +
          "धारा 158 के अंतर्गत कर के बकाये के रूप में वसूल की जा सकेगी।",
      },
    },
  },
  disputes_measurement: {
    complianceDays: 21,
    text: {
      en: {
        title: "Notice of Re-Measurement and Verification of Carpet Area",
        legalBasis: "Section 127(6) of the Bihar Municipal Act, 2007, read with the Bihar Property Tax (Assessment, Collection and Recovery) Rules, 2013",
        body:
          "This is to inform {ownerName}, owner/occupier of Holding No. {holdingNo} situated at {address}, Ward No. {ward}, that on " +
          "{reportedDate} the Tax Collector of this Municipality visited the said holding for collection of dues of Rs. {totalAmountDemanded}/- " +
          "as per Demand Notice No. {demandNo} attached herewith, and it is reported that {ownerName} disputes the carpet area/measurement of " +
          "the holding on which the assessment is based, on the following stated grounds: \"{issueNotes}\" " +
          "\n\n{ownerName} is hereby given the opportunity to request a re-measurement of the holding by remaining present, or deputing an " +
          "authorised representative, for a joint measurement to be conducted by this Municipality within {complianceDays} days of the date " +
          "of this notice, in accordance with the carpet-area measurement provisions of Section 127(6) of the Bihar Municipal Act, 2007 and " +
          "the Rules made thereunder. If no such request is made, or the holding is not made available for re-measurement, within the said " +
          "period, the measurement on record and the amount stated in the attached Demand Notice shall be treated as final and due, and shall " +
          "be recoverable as an arrear of tax under Section 158 of the Act.",
      },
      hi: {
        title: "पुनर्मापन एवं कारपेट क्षेत्रफल के सत्यापन की सूचना",
        legalBasis: "बिहार नगरपालिका अधिनियम, 2007 की धारा 127(6), बिहार संपत्ति कर (निर्धारण, संग्रहण एवं वसूली) नियमावली, 2013 के साथ पठित",
        body:
          "धारक क्रमांक {holdingNo}, पता {address}, वार्ड क्रमांक {ward} के स्वामी/अधिभोगी {ownerName} को सूचित किया जाता है कि दिनांक " +
          "{reportedDate} को इस नगर निगम के कर संग्रहकर्ता द्वारा संलग्न मांग सूचना क्रमांक {demandNo} के अनुसार रु. {totalAmountDemanded}/- " +
          "मात्र बकाये की वसूली हेतु उक्त धारक पर भ्रमण किया गया, जिसमें प्रतिवेदित किया गया कि {ownerName} द्वारा उस कारपेट क्षेत्रफल/मापन " +
          "पर, जिस पर निर्धारण आधारित है, निम्नलिखित आधार पर आपत्ति व्यक्त की गई: \"{issueNotes}\" " +
          "\n\n{ownerName} को इस सूचना की तिथि से {complianceDays} दिनों के भीतर बिहार नगरपालिका अधिनियम, 2007 की धारा 127(6) एवं " +
          "तत्संबंधी नियमावली के कारपेट क्षेत्रफल मापन संबंधी प्रावधानों के अनुसार, इस नगर निगम द्वारा किए जाने वाले संयुक्त मापन हेतु " +
          "स्वयं उपस्थित रहकर अथवा अपना प्राधिकृत प्रतिनिधि नियुक्त कर पुनर्मापन का अनुरोध करने का अवसर प्रदान किया जाता है। यदि उक्त अवधि " +
          "के भीतर ऐसा कोई अनुरोध नहीं किया जाता है, अथवा पुनर्मापन हेतु धारक उपलब्ध नहीं कराया जाता है, तो अभिलेख पर दर्ज मापन एवं संलग्न " +
          "मांग सूचना में उल्लिखित राशि अंतिम एवं देय मानी जाएगी तथा अधिनियम की धारा 158 के अंतर्गत कर के बकाये के रूप में वसूल की जा " +
          "सकेगी।",
      },
    },
  },
};
