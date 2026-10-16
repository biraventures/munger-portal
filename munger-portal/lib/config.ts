// Set this to your deployed Google Apps Script web app URL for the
// Property Tax Counter Receipt System (Code.gs / Index.html), e.g.
// "https://script.google.com/macros/s/AKfycb.../exec"
//
// You can hardcode it below, or set NEXT_PUBLIC_PROPERTY_TAX_URL in
// .env.local so it doesn't need to be committed to source control.
export const PROPERTY_TAX_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_URL || "#";

// Internal route where citizens search for their holding number and see
// dues/arrears before paying. "Pay Property Tax" buttons across the site
// send people here first, not straight to the Apps Script web app.
export const PROPERTY_TAX_SEARCH_PATH = "/property-tax";
export const NAGAR_NIGAM_SHOPS_HUB_PATH = "/nagar-nigam-shops";
export const SHOP_RENT_SEARCH_PATH = "/shop-rent";

export const services = [
  {
    counter: "COUNTER 01",
    title: "Property Tax",
    description:
      "Look up your holding, view this year's dues, and pay at the digital counter.",
    icon: "receipt",
    cta: "Pay Now",
    href: PROPERTY_TAX_SEARCH_PATH,
    live: true,
  },
  {
    counter: "COUNTER 01A",
    title: "Nagar Nigam Shops",
    description:
      "Pay shop rent, apply for a new rental shop, or download your shop's details.",
    icon: "store",
    cta: "View Options",
    href: NAGAR_NIGAM_SHOPS_HUB_PATH,
    live: true,
  },
  {
    counter: "COUNTER 01B",
    title: "Mutation of Holding",
    description:
      "Apply online to change the owner's name on a holding after sale, partition, gift, inheritance or auction - and track it.",
    icon: "file-text",
    cta: "Apply Now",
    href: "/mutation",
    live: true,
  },
  {
    counter: "COUNTER 02",
    title: "Solid Waste Management",
    description:
      "Sanitation coverage and collection schedules across the city's zones.",
    icon: "trash",
    cta: "Coming soon",
    href: "#",
    live: false,
  },
  {
    counter: "COUNTER 03",
    title: "Water Supply & Sewerage",
    description:
      "New connections, complaints, and billing for municipal water supply.",
    icon: "droplet",
    cta: "Coming soon",
    href: "#",
    live: false,
  },
  {
    counter: "COUNTER 04",
    title: "Trade License",
    description:
      "Apply for or renew a trade license for a shop or business in the city.",
    icon: "store",
    cta: "Apply Now",
    href: "/trade-license",
    live: true,
  },
  {
    counter: "COUNTER 05",
    title: "Birth & Death Certificates",
    description:
      "Register or request certified copies of birth and death records.",
    icon: "file-text",
    cta: "Coming soon",
    href: "#",
    live: false,
  },
  {
    counter: "COUNTER 06",
    title: "Public Grievance",
    description:
      "Report a civic issue or track a complaint filed with the Corporation.",
    icon: "alert-triangle",
    cta: "Coming soon",
    href: "#",
    live: false,
  },
] as const;

export const stats = [
  { value: "45", label: "Municipal wards" },
  { value: "2.13L", label: "City population" },
  { value: "Online", label: "Property tax counter, now digital" },
] as const;