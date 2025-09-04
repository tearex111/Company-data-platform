import countries from "i18n-iso-countries";
import { parse } from "papaparse";
import { getDomain as tldGetDomain, parse as tldParse } from "tldts";
import enCountriesJson from "i18n-iso-countries/langs/en.json" assert { type: "json" };

// Register English locale once
countries.registerLocale(enCountriesJson as Parameters<typeof countries.registerLocale>[0]);

//types 

export type RawRow = Record<string, string | number | null | undefined>;

export type CleanCompany = {
  name: string | null;
  domain: string | null;
  country: string | null;
  city: string | null;
  employee_size_bucket: string | null;
  raw_json: Record<string, unknown>;
};

//constants 

const EMPLOYEE_BUCKETS = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1 000",
  "1 001-5 000",
  "5 001-10 000",
  "10 000+",
] as const;

const DOMAIN_TLDS_GLUED = /(com|net|org|io|ai|co|app|dev)$/;

const NAME_ALIASES = ["name", "company", "company name", "company_name", "organization", "org"];
const DOMAIN_ALIASES = ["domain", "website", "url", "website url", "website_url"];
const COUNTRY_ALIASES = ["country", "country code", "country_code", "location"];
const CITY_ALIASES = ["city", "town"];
const EMP_ALIASES = [
  "employees",
  "employee_size",
  "employee range",
  "size",
  "headcount",
  "number of employees",
];

// Normalizers //

export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  const host = String(input)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[#?].*$/, "")
    .replace(/\/.+$/, "")
    .replace(/\s+/g, "");
  if (!host) return null;

  // Prefer registered/apex domain
  const apex = tldGetDomain(host);
  if (apex) return apex;

  // Handle glued tlds
  if (!host.includes(".")) {
    const m = host.match(new RegExp(`^(.*)${DOMAIN_TLDS_GLUED.source}$`));
    if (m && m[1] && m[1].length >= 2) return `${m[1]}.${m[2]}`;
  }
  return null;
}
// normalize country
export function normalizeCountry(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  if (/\b(global|worldwide)\b/i.test(raw)) return "Global";

  const seg = raw.replace(/\(.*?\)/g, "").split(",").pop()!.trim().replace(/[._-]+/g, " ");
  if (!seg) return null;

  const upper = seg.replace(/\./g, "").toUpperCase();

  // Try A2 
  if (/^[A-Z]{2}$/.test(upper)) {
    return countries.getName(upper, "en", { select: "official" }) || countries.getName(upper, "en") || null;
  }

  // Try A3 
  if (/^[A-Z]{3}$/.test(upper)) {
    const alpha3ToAlpha2 = (countries as unknown as { alpha3ToAlpha2?: (c: string) => string | undefined }).alpha3ToAlpha2;
    const a2 = alpha3ToAlpha2?.(upper);
    if (a2) return countries.getName(a2, "en", { select: "official" }) || countries.getName(a2, "en") || null;
  }

  // Try name
  const a2ByName = countries.getAlpha2Code(seg, "en");
  return a2ByName
    ? countries.getName(a2ByName, "en", { select: "official" }) || countries.getName(a2ByName, "en") || null
    : null;
}
// normalize city
export function normalizeCity(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = String(input).trim();
  if (!s || /https?:\/\//i.test(s) || /\.[a-z]{2,}$/i.test(s) || /\d{3,}/.test(s)) return null;

  // First segment, strip parens and postal codew
  s = s.split(",")[0]!.replace(/\(.*?\)$/g, "").replace(/\b\d{4,6}(?:-\d{4})?$/g, "").trim();

  const tokens = s.split(/\s+/);
  const last = tokens.at(-1);
  if (
    last &&
    (countries.getName(last, "en") || countries.getAlpha2Code(last, "en") || /^[A-Z]{2,3}$/.test(last))
  ) {
    tokens.pop();
  }
  s = tokens.join(" ").trim();
  return s.length >= 2 ? s : null;
}
// bucket employee size
export function bucketEmployeeSize(input: string | number | null | undefined): string | null {
  if (input == null) return null;

  // Already bucketed
  if (typeof input === "string" && (EMPLOYEE_BUCKETS as readonly string[]).includes(input)) return input;

  const s = String(input).replace(/[,\s]/g, "").toLowerCase();

  // Range 
  const m = s.match(/(\d+)(?:-(\d+)|\+)?/);
  if (m) return mapToBucket(Number(m[1]), m[2] ? Number(m[2]) : undefined);

  // Single value
  const n = Number(s.replace(/k/g, "000"));
  return Number.isNaN(n) ? null : mapToBucket(n);
}

function mapToBucket(start: number, end?: number): string {
  const n = end ?? start;
  if (n <= 10) return "1-10";
  if (n <= 50) return "11-50";
  if (n <= 200) return "51-200";
  if (n <= 500) return "201-500";
  if (n <= 1000) return "501-1 000";
  if (n <= 5000) return "1 001-5 000";
  if (n <= 10000) return "5 001-10 000";
  return "10 000+";
}

// row cleaner
export function cleanRow(row: RawRow): CleanCompany {
  // Build lowercase key map once
  const byLower: Record<string, string> = {};
  for (const k in row) byLower[k.toLowerCase()] = k;

  const pick = (aliases: string[]): string | number | null => {
    for (const a of aliases) {
      const key = byLower[a.toLowerCase()];
      const v = key ? row[key] : null;
      if (v != null && String(v).trim() !== "") return v as string | number;
    }
    return null;
  };

  const domain = normalizeDomain(pick(DOMAIN_ALIASES) as string | null);

  let name = (pick(NAME_ALIASES) as string | null)?.toString().trim() || null;
  if (!name && domain) {
    const p = tldParse(domain);
    const base = p.domainWithoutSuffix || domain.split(".")[0];
    if (base) {
      name = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
      name = name ? name[0].toUpperCase() + name.slice(1) : null;
    }
  }

  const countryRaw = pick(COUNTRY_ALIASES) as string | null;
  const cityRaw = pick(CITY_ALIASES) as string | null;
  const employeesRaw = pick(EMP_ALIASES) as string | number | null;

  const country = normalizeCountry(countryRaw);

  let city = normalizeCity(cityRaw);
  if (!city && countryRaw) {
    const left = String(countryRaw).split(",")[0]?.trim() || "";
    city = normalizeCity(left) ?? city;
  }

  return {
    name,
    domain,
    country,
    city,
    employee_size_bucket: bucketEmployeeSize(employeesRaw),
    raw_json: row as Record<string, unknown>,
  };
}

// parse csv

export function parseCsv(content: string): RawRow[] {
  const { data } = parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  return data as RawRow[];
}
