// Built-in terminology for academic title capitalization.
// Data only — the capitalization rules live in academicTitle.ts.
// Journal-specific additions are stored by admins in admin_settings
// (setting_key "title_terminology") and merged at runtime.

export type TermKind = "acronym" | "proper" | "brand" | "species" | "genus" | "term";

export interface TermEntry {
  /** Canonical spelling, e.g. "COVID-19", "Escherichia coli". */
  form: string;
  kind: TermKind;
  /** Italicize in HTML output (scientific names). */
  italic?: boolean;
  /**
   * The lowercase form is also an ordinary English word ("who", "us", "it"),
   * so the term is only recognised when the title already uses the canonical form.
   */
  ambiguous?: boolean;
  /** Where the entry came from — shown in the editor's review notes. */
  source?: "builtin" | "journal" | "ai";
}

const ACRONYMS = [
  "WWJMRD", "AI", "ML", "DL", "NLP", "LLM", "LLMs", "GPT", "GPT-4", "ChatGPT", "IoT", "IoMT", "API", "APIs",
  "SaaS", "ERP", "CRM", "GIS", "GPS", "UAV", "UAVs", "AR", "VR", "XR", "3D", "2D", "5G", "4G", "Wi-Fi",
  "DNA", "RNA", "mRNA", "tRNA", "rRNA", "miRNA", "siRNA", "cDNA", "PCR", "RT-PCR", "qPCR", "RT-qPCR", "CRISPR",
  "CRISPR-Cas9", "ATP", "NADH", "pH", "HbA1c", "eGFR", "ELISA", "HPLC", "GC-MS", "LC-MS", "NMR", "FTIR", "XRD",
  "TEM", "UV", "UV-Vis", "LED", "LEDs", "MRI", "ECG", "EEG", "BMI", "ICU", "COPD", "PCOS", "PCOD", "ADHD", "ASD",
  "PTSD", "OCD", "CVD", "CKD", "NAFLD", "HIV", "HPV", "HBV", "HCV", "BCG", "MDR", "AMR", "ESBL", "MRSA", "NSAID",
  "NSAIDs", "COVID-19", "SARS-CoV-2", "SARS", "MERS", "UNESCO", "UNICEF", "NGO", "NGOs", "ICT", "GDP", "GST",
  "FDI", "NPA", "NPAs", "UPI", "RBI", "SEBI", "MSME", "MSMEs", "SME", "SMEs", "ESG", "CSR", "HRM", "KPI", "KPIs",
  "ROI", "B2B", "B2C", "SDG", "SDGs", "ISRO", "IIT", "IITs", "NEP", "UGC", "AICTE", "NCERT", "CBSE", "ICMR",
  "AIIMS", "NEET", "JEE", "PhD", "MBA", "BBA", "STEM", "SPSS", "ANOVA", "PLS-SEM", "SEM", "TAM", "UTAUT", "SWOT",
  "PESTLE", "USA", "UK", "EU", "UAE", "iPhone", "iPad", "YouTube", "LinkedIn", "WhatsApp", "TikTok", "eBay",
  "PubMed", "MATLAB", "COVID",
];

const AMBIGUOUS_ACRONYMS = ["WHO", "US", "IT", "AIDS", "UN", "CAT", "MAP", "ACE", "SMART", "PIN", "AIM", "CAD", "HR", "TB"];

const PROPER_NOUNS = [
  // Countries and regions
  "India", "China", "Japan", "Nepal", "Bhutan", "Bangladesh", "Pakistan", "Afghanistan", "Myanmar", "Maldives",
  "Sri Lanka", "Indonesia", "Malaysia", "Thailand", "Vietnam", "Philippines", "Singapore", "Iran", "Iraq", "Israel",
  "Qatar", "Oman", "Kuwait", "Bahrain", "Saudi Arabia", "United Arab Emirates", "Egypt", "Nigeria", "Kenya",
  "Ethiopia", "Ghana", "Uganda", "Tanzania", "South Africa", "Russia", "Ukraine", "Germany", "France", "Italy",
  "Spain", "Portugal", "Netherlands", "Sweden", "Norway", "Finland", "Denmark", "Poland", "Brazil", "Argentina",
  "Mexico", "Canada", "Australia", "New Zealand", "United States", "United Kingdom", "South Korea", "North Korea",
  "Asia", "Africa", "Europe", "America", "Antarctica", "Middle East", "European Union", "United Nations",
  "World Health Organization",
  // Indian states and cities
  "Uttar Pradesh", "Madhya Pradesh", "Andhra Pradesh", "Himachal Pradesh", "Arunachal Pradesh", "Tamil Nadu",
  "West Bengal", "New Delhi", "Delhi", "Gujarat", "Maharashtra", "Rajasthan", "Kerala", "Karnataka", "Punjab",
  "Haryana", "Bihar", "Odisha", "Assam", "Jharkhand", "Chhattisgarh", "Uttarakhand", "Goa", "Telangana",
  "Manipur", "Mizoram", "Nagaland", "Sikkim", "Tripura", "Meghalaya", "Kashmir", "Jammu", "Ladakh", "Mumbai",
  "Kolkata", "Chennai", "Bengaluru", "Bangalore", "Hyderabad", "Pune", "Jaipur", "Lucknow", "Ahmedabad",
  "Varanasi", "Bharat", "Himalaya", "Himalayas", "Ganga", "Ganges", "Yamuna",
  // Peoples, languages, religions
  "Indian", "Asian", "African", "European", "American", "Chinese", "Japanese", "English", "Hindi", "Sanskrit",
  "Tamil", "Telugu", "Bengali", "Marathi", "Urdu", "Hindu", "Hinduism", "Muslim", "Islam", "Islamic", "Christian",
  "Buddhist", "Buddhism", "Sikh", "Jain", "Ayurveda", "Ayurvedic",
  // People and eponyms common in titles
  "Gandhi", "Gandhian", "Nehru", "Ambedkar", "Tagore", "Kautilya", "Marx", "Marxist", "Darwin", "Darwinian",
  "Freud", "Freudian", "Shakespeare", "Bayesian", "Gaussian", "Markov", "Fourier", "Newtonian", "Euclidean",
  "Boolean", "Likert", "Cronbach", "Pearson", "Taguchi",
  // Months and days ("May", "March" are ordinary words too)
  "January", "February", "April", "June", "July", "August", "September", "October", "November", "December",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  // Brands
  "Google", "Microsoft", "Facebook", "Instagram", "Twitter", "Amazon", "Netflix", "Flipkart", "Paytm",
];

const AMBIGUOUS_PROPER = ["May", "March", "Turkey", "Chile", "Jordan", "Apple", "Polish", "Georgia"];

// Binomial (genus + species) names. The genus list is derived from these.
const BINOMIALS = [
  "Escherichia coli", "Staphylococcus aureus", "Staphylococcus epidermidis", "Streptococcus pneumoniae",
  "Streptococcus pyogenes", "Streptococcus mutans", "Pseudomonas aeruginosa", "Pseudomonas fluorescens",
  "Klebsiella pneumoniae", "Salmonella typhi", "Salmonella enterica", "Salmonella typhimurium",
  "Mycobacterium tuberculosis", "Bacillus subtilis", "Bacillus cereus", "Bacillus thuringiensis",
  "Candida albicans", "Aspergillus niger", "Aspergillus flavus", "Aspergillus fumigatus", "Saccharomyces cerevisiae",
  "Lactobacillus acidophilus", "Lactobacillus plantarum", "Helicobacter pylori", "Vibrio cholerae",
  "Listeria monocytogenes", "Clostridium difficile", "Clostridioides difficile", "Enterococcus faecalis",
  "Acinetobacter baumannii", "Proteus mirabilis", "Shigella flexneri", "Neisseria gonorrhoeae",
  "Plasmodium falciparum", "Plasmodium vivax", "Aedes aegypti", "Anopheles stephensi", "Culex quinquefasciatus",
  "Drosophila melanogaster", "Caenorhabditis elegans", "Danio rerio", "Mus musculus", "Rattus norvegicus",
  "Homo sapiens", "Arabidopsis thaliana", "Oryza sativa", "Triticum aestivum", "Zea mays", "Solanum lycopersicum",
  "Solanum tuberosum", "Glycine max", "Cicer arietinum", "Brassica juncea", "Brassica oleracea",
  "Azadirachta indica", "Ocimum sanctum", "Ocimum tenuiflorum", "Withania somnifera", "Curcuma longa",
  "Zingiber officinale", "Allium sativum", "Allium cepa", "Moringa oleifera", "Tinospora cordifolia",
  "Phyllanthus emblica", "Emblica officinalis", "Terminalia chebula", "Terminalia arjuna", "Centella asiatica",
  "Bacopa monnieri", "Asparagus racemosus", "Camellia sinensis", "Coffea arabica", "Mangifera indica",
  "Psidium guajava", "Carica papaya", "Punica granatum", "Ficus religiosa", "Ficus benghalensis",
  "Eucalyptus globulus", "Tectona grandis", "Gossypium hirsutum", "Musa paradisiaca", "Cocos nucifera",
  "Nicotiana tabacum", "Catharanthus roseus", "Datura stramonium", "Ricinus communis", "Calotropis procera",
  "Lantana camara", "Parthenium hysterophorus", "Eichhornia crassipes", "Spirulina platensis", "Chlorella vulgaris",
  "Bombyx mori", "Apis mellifera", "Labeo rohita", "Catla catla", "Cirrhinus mrigala", "Oreochromis niloticus",
  "Gallus gallus", "Bos taurus", "Bos indicus", "Bubalus bubalis", "Capra hircus", "Ovis aries", "Sus scrofa",
  "Canis familiaris", "Canis lupus", "Felis catus", "Panthera tigris", "Panthera leo", "Elephas maximus",
  "Penicillium chrysogenum", "Penicillium notatum", "Rhizopus stolonifer", "Fusarium oxysporum",
  "Trichoderma viride", "Trichoderma harzianum", "Rhizobium leguminosarum", "Azotobacter chroococcum",
  "Agrobacterium tumefaciens", "Xanthomonas oryzae", "Magnaporthe oryzae", "Phytophthora infestans",
  "Meloidogyne incognita", "Helicoverpa armigera", "Spodoptera frugiperda", "Spodoptera litura",
  "Leishmania donovani", "Trypanosoma cruzi", "Toxoplasma gondii", "Entamoeba histolytica", "Giardia lamblia",
  "Wuchereria bancrofti", "Ascaris lumbricoides", "Aloe vera",
];

// Genera whose names are also everyday words; only recognised when already capitalized.
const AMBIGUOUS_GENERA = new Set(["aloe", "asparagus", "eucalyptus", "allium", "musa", "bos", "sus", "canis", "felis", "catla", "ficus"]);

export function builtinTerms(): TermEntry[] {
  const out: TermEntry[] = [];
  for (const form of ACRONYMS) out.push({ form, kind: /^[a-z]|[a-z][A-Z]/.test(form) && form !== form.toUpperCase() ? "brand" : "acronym", source: "builtin" });
  for (const form of AMBIGUOUS_ACRONYMS) out.push({ form, kind: "acronym", ambiguous: true, source: "builtin" });
  for (const form of PROPER_NOUNS) out.push({ form, kind: "proper", source: "builtin" });
  for (const form of AMBIGUOUS_PROPER) out.push({ form, kind: "proper", ambiguous: true, source: "builtin" });
  const genera = new Set<string>();
  for (const form of BINOMIALS) {
    const genus = form.split(" ")[0];
    const amb = AMBIGUOUS_GENERA.has(genus.toLowerCase());
    out.push({ form, kind: "species", italic: true, ambiguous: amb || form === "Aloe vera", source: "builtin" });
    if (!genera.has(genus)) {
      genera.add(genus);
      out.push({ form: genus, kind: "genus", italic: true, ambiguous: true, source: "builtin" });
    }
  }
  return out;
}
