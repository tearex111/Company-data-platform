import { env, isOpenAIEnabled } from "@/env";

export type EnrichmentInput = {
  name?: string | null;
  domain?: string | null;
  country?: string | null;
  city?: string | null;
  employee_size_bucket?: string | null;
  raw_json?: Record<string, unknown>;
};

// Fields ai can fill// 
const FILLABLE_KEYS = [
  "name",
  "domain",
  "country",
  "city",
  "employee_size_bucket",
] as const;


//  Ask OpenAI to fill only missing fields
//  - Never overwrite 
//  - Returns partial object containing only filled keys or empty
//  - On failure returns empty
 
export async function enrichIfNeeded(
  input: EnrichmentInput
): Promise<Partial<EnrichmentInput>> {
  // disabled or nothing to fill
  if (!isOpenAIEnabled) return {};

  const missing = FILLABLE_KEYS.filter((k) => !input[k]);
  if (missing.length === 0) return {};

  // Provide the model with context 
  const context: Record<string, unknown> = {};
  for (const k of FILLABLE_KEYS) {
    if (input[k] != null) context[k] = input[k] as unknown;
  }

  // instructions to model
  const systemPrompt =
    "You clean messy company data. Only fill missing fields. Never modify provided non-null fields. If uncertain, return null.\n" +
    "Rules: (1) If domain is missing and name is a single brand token (letters/digits only, e.g. airbnb), set domain to '<brand>.com'.\n" +
    "(2) If any input suggests global/worldwide, set country to 'Global'.\n" +
    "(3) If country is missing but city is present (e.g. San Francisco, Palo Alto), infer the country and keep city.\n" +
    "Return JSON with keys: name, domain, country, city, employee_size_bucket.";

  const userPayload = JSON.stringify({
    missing,
    context,
    row: input.raw_json ?? {},
  });

  try {
    // JSON mode enforces structur
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPayload },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    // If the API breaks or rate limits, skip enrichment
    if (!resp.ok) return {};

    // Parse the JSON output 
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? "{}";

    type AiJson = {
      name?: unknown;
      domain?: unknown;
      country?: unknown;
      city?: unknown;
      employee_size_bucket?: unknown;
    };

    let parsed: AiJson;
    try {
      parsed = JSON.parse(content) as AiJson;
    } catch {
      return {};
    }

    const asStringOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

    // Map response to our required shape, nulls otherwise
    return {
      name: asStringOrNull(parsed.name),
      domain: asStringOrNull(parsed.domain),
      country: asStringOrNull(parsed.country),
      city: asStringOrNull(parsed.city),
      employee_size_bucket: asStringOrNull(parsed.employee_size_bucket),
    };
  } catch {
    // Network error - proceed without enrichment
    return {};
  }
}
