import Sanscript from "@indic-transliteration/sanscript";

/**
 * Best-effort English -> Devanagari transliteration for field-staff
 * names, used when a record has no manually-corrected `nameHi`
 * (@see attendance-api.ts's FieldStaffSummary.nameHi and friends).
 *
 * This is deliberately a two-layer approach, not a single clever
 * algorithm, because the two layers fail in different ways:
 *
 * 1. DICTIONARY - a lookup of common Bihar/Hindi given-name and
 *    surname components (Singh, Devi, Yadav, Kumar, Prasad, ...).
 *    English spelling of Hindi names is ambiguous about vowel length
 *    (the single letter "a" stands for both अ and आ - "Yadav" could
 *    be यदव or यादव purely from spelling), so there is no rule that
 *    gets these right from the letters alone. A short list of exact,
 *    known-correct answers for the most common names covers a large
 *    share of any real Bihar roster.
 * 2. RULE-BASED FALLBACK - for a name part not in the dictionary, via
 *    the ITRANS scheme (@indic-transliteration/sanscript), patched
 *    for the two systematic errors a raw ITRANS pass makes on plain
 *    English name spelling (not grammatically-marked ITRANS input):
 *      - it adds an explicit halant (्) to a bare word-final
 *        consonant, which Hindi name orthography never writes (the
 *        inherit vowel is simply understood as silent) - "Mohan"
 *        should render as मोहन, not मोहन्.
 *      - it reads a word-final single "i"/"u" as the SHORT vowel
 *        (ि/ु), when a Hindi name's final syllable is almost always
 *        the LONG sound in speech (Devi -> देवी, not देवि).
 *
 * Even patched, the fallback still can't resolve the vowel-length
 * ambiguity above for a name part it doesn't recognise - that
 * residual uncertainty is why FieldStaffSummary.nameHi exists as an
 * editable override: attendance_admin/sanitation_officer/apswmo/
 * sanitation_prabhari can correct a wrong guess once, after which
 * this function is never consulted for that record again.
 */
const NAME_DICTIONARY: Record<string, string> = {
  // --- Common male given names ---
  ramesh: "रमेश", suresh: "सुरेश", mahesh: "महेश", rakesh: "रकेश", dinesh: "दिनेश",
  mukesh: "मुकेश", hitesh: "हितेश", naresh: "नरेश", lokesh: "लोकेश", umesh: "उमेश",
  manoj: "मनोज", sanjay: "संजय", vijay: "विजय", ajay: "अजय", pawan: "पवन",
  praveen: "प्रवीण", pravin: "प्रवीण", naveen: "नवीन", navin: "नवीन", sunil: "सुनील",
  anil: "अनिल", kamal: "कमल", vimal: "विमल", nirmal: "निर्मल", ashok: "अशोक",
  vinod: "विनोद", pramod: "प्रमोद", pradeep: "प्रदीप", pradip: "प्रदीप", sandeep: "संदीप",
  sandip: "संदीप", dilip: "दिलीप", birendra: "बिरेंद्र", dharmendra: "धर्मेंद्र",
  jitendra: "जितेंद्र", surendra: "सुरेंद्र", mahendra: "महेंद्र", narendra: "नरेंद्र",
  upendra: "उपेंद्र", ravindra: "रविंद्र", rajendra: "राजेंद्र", devendra: "देवेंद्र",
  yogendra: "योगेंद्र", satyendra: "सत्येंद्र", amrendra: "अमरेंद्र", chandra: "चंद्र",
  chandan: "चंदन", raj: "राज", rajesh: "राजेश", rajan: "राजन", santosh: "संतोष",
  subodh: "सुबोध", manohar: "मनोहर", mohan: "मोहन", mohammad: "मोहम्मद",
  mohammed: "मोहम्मद", irfan: "इरफ़ान", islam: "इस्लाम", alam: "आलम", akhtar: "अख़्तर",
  aslam: "असलम", shamim: "शमीम", hussain: "हुसैन", husain: "हुसैन", hasan: "हसन",
  ali: "अली", anwar: "अनवर", imran: "इमरान", sahil: "साहिल", rahul: "राहुल",
  rohit: "रोहित", amit: "अमित", sumit: "सुमित", vikash: "विकाश", vikas: "विकास",
  abhishek: "अभिषेक", deepak: "दीपक", gopal: "गोपाल", shyam: "श्याम", shiv: "शिव",
  ram: "राम", lakshman: "लक्ष्मण", krishna: "कृष्णा", hari: "हरि", hariram: "हरिराम",
  bablu: "बबलू", guddu: "गुड्डू", pappu: "पप्पू", sonu: "सोनू", monu: "मोनू",
  bhola: "भोला", bhim: "भीम", bihari: "बिहारी", birju: "बिरजू", chhotu: "छोटू",
  lalan: "लालन", lallan: "लल्लन", lal: "लाल", prakash: "प्रकाश", jagdish: "जगदीश",
  arvind: "अरविंद", govind: "गोविंद", mukund: "मुकुंद", vinay: "विनय", uday: "उदय",
  jay: "जय", sanjeev: "संजीव", rajeev: "राजीव", rajiv: "राजीव", sudhir: "सुधीर",
  ranjit: "रंजीत", ajit: "अजीत", sujit: "सुजीत", kailash: "कैलाश", satish: "सतीश",
  girish: "गिरीश", manish: "मनीष", harish: "हरीश", om: "ओम", omprakash: "ओमप्रकाश",
  // --- Common female given names ---
  sunita: "सुनीता", anita: "अनीता", kavita: "कविता", savita: "सविता", lalita: "ललिता",
  mamta: "ममता", geeta: "गीता", gita: "गीता", sita: "सीता", rita: "रीता", nita: "नीता",
  babita: "बबीता", sarita: "सरिता", manju: "मंजू", pooja: "पूजा", puja: "पूजा",
  priya: "प्रिया", priyanka: "प्रियंका", rekha: "रेखा", usha: "उषा", seema: "सीमा",
  reena: "रीना", rina: "रीना", meena: "मीना", mina: "मीना", meera: "मीरा", mira: "मीरा",
  neelam: "नीलम", nirmala: "निर्मला", shanti: "शांति", suman: "सुमन", kiran: "किरण",
  asha: "आशा", lata: "लता", radha: "राधा", shobha: "शोभा", sheela: "शीला",
  pushpa: "पुष्पा", kamla: "कमला", kamala: "कमला", vimla: "विमला", urmila: "उर्मिला",
  sarla: "सरला", indira: "इंदिरा", laxmi: "लक्ष्मी", lakshmi: "लक्ष्मी", durga: "दुर्गा",
  saraswati: "सरस्वती", parvati: "पार्वती", khatoon: "खातून", begum: "बेगम",
  fatima: "फ़ातिमा", shabnam: "शबनम", nasreen: "नसरीन", jyoti: "ज्योति",
  archana: "अर्चना", poonam: "पूनम", punam: "पूनम", shashi: "शशि", vandana: "वंदना",
  chanda: "चंदा", guddi: "गुड्डी", devi: "देवी", kumari: "कुमारी", rani: "रानी",
  // --- Common surnames / caste-identifier words ---
  kumar: "कुमार", singh: "सिंह", yadav: "यादव", prasad: "प्रसाद", sharma: "शर्मा",
  verma: "वर्मा", gupta: "गुप्ता", mishra: "मिश्रा", pandey: "पांडे", thakur: "ठाकुर",
  mandal: "मंडल", paswan: "पासवान", rai: "राय", ray: "राय", das: "दास",
  manjhi: "मांझी", hansda: "हांसदा", ravidas: "रविदास", chaudhary: "चौधरी",
  choudhary: "चौधरी", mahto: "महतो", mahato: "महतो", sahni: "साहनी", sahu: "साहू",
  shah: "शाह", jha: "झा", tiwari: "तिवारी", dubey: "दुबे", pathak: "पाठक",
  ojha: "ओझा", agarwal: "अग्रवाल", jaiswal: "जायसवाल", bind: "बिंद", nishad: "निषाद",
  sahani: "साहनी", rajak: "रजक", mallah: "मल्लाह", dhobi: "धोबी", pasi: "पासी",
  chamar: "चमार", bhuiyan: "भुइयां", ansari: "अंसारी", khan: "ख़ान", ahmad: "अहमद",
  ahmed: "अहमद",
};

/** Hindi name spelling never writes an explicit halant on a bare word-final consonant. */
function stripTrailingHalant(devanagari: string): string {
  return devanagari.replace(/्$/, "");
}

/**
 * Transliterates one word not found in the dictionary. Biases the
 * final syllable toward the long vowel sound (Hindi names almost
 * always end that way even when spelled with a single "i"/"u" in
 * English) and routes the common "ngh" cluster (Singh-type names)
 * through the anusvara + ha form instead of a literal nasal+gh.
 */
function transliterateFallback(word: string): string {
  let w = word.toLowerCase();

  const nghIndex = w.indexOf("ngh");
  if (nghIndex !== -1 && nghIndex === w.length - 3) {
    const before = w.slice(0, nghIndex);
    const beforeDev = before ? stripTrailingHalant(Sanscript.t(before, "itrans", "devanagari")) : "";
    return beforeDev + "ं" + "ह"; // anusvara + ha
  }

  w = w.replace(/i$/, "ii").replace(/u$/, "uu");
  return stripTrailingHalant(Sanscript.t(w, "itrans", "devanagari"));
}

/** Transliterates one name part (a single word), dictionary first. */
export function transliterateWord(word: string): string {
  const clean = word.trim();
  if (!clean) return clean;
  const lower = clean.toLowerCase();
  if (NAME_DICTIONARY[lower]) return NAME_DICTIONARY[lower];
  return transliterateFallback(clean);
}

/**
 * Transliterates a full name (any number of space/hyphen-separated
 * parts), e.g. "Ramesh Kumar Singh" -> "रमेश कुमार सिंह". Non-letter
 * characters (numbers, punctuation already in the name) pass through
 * untouched rather than being dropped.
 */
export function transliterateName(fullName: string): string {
  if (!fullName) return fullName;
  return fullName
    .split(/(\s+|-)/) // keep the separators so spacing/hyphens are preserved
    .map((part) => (/[a-zA-Z]/.test(part) ? transliterateWord(part) : part))
    .join("");
}
