import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db";
import {cleanRow,parseCsv,normalizeCountry,normalizeCity,normalizeDomain,bucketEmployeeSize,}
from "@/lib/clean";
import { isOpenAIEnabled } from "@/env";
import { enrichIfNeeded, type EnrichmentInput } from "@/lib/ai";
import type { Database } from "@/types/database";
import type { Supabase } from "@/lib/db";

// Route config 
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;


// Try to update an existing domainless company record - avoids duplicates
 
async function promoteDomainlessIfExists(
  supabase: Supabase,
  payload: Database["public"]["Tables"]["companies"]["Insert"]
) {
  for (const filters of [{ name: payload.name, city: payload.city }, { name: payload.name }]) {
    // Consider only domainless rows
    let q = supabase.from("companies").select("id").is("domain", null);

    // Apply current filter (name, city)
    for (const [k, v] of Object.entries(filters) as Array<
      ["name" | "city" | "country", unknown]
    >) {
      if (v != null) q = q.eq(k, v as string);
    }

    // Only need one match
    const { data: match, error: selErr } = await q.limit(1).returns<{ id: string }[]>();
    if (selErr) throw new Error(selErr.message);

    if (match && match.length > 0) {
      const { error: updErr } = await supabase
        .from("companies")
        .update(({
          domain: payload.domain,
          country: payload.country,
          city: payload.city,
          employee_size_bucket: payload.employee_size_bucket,
          raw_json: payload.raw_json,
        }) as unknown as never)
        .eq("id", match[0].id);

      if (updErr) throw new Error(updErr.message);
      return; 
    }
  }
}

//  * Accept  CSV and  use ai flag - clean rows,
//  * enriches  missing fields via AI then writes to DB
//  * deduplication:
//  * With domain: promote prior domainless match, then upsert domain,name
//  * Without domain: update existing domainless by name+city, else insert
 
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  const useAiFlag = formData.get("use_ai");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  // Parse + deterministic cleaning 
  const text = await file.text();
  const rows = parseCsv(text);
  const cleaned = rows.map((r) => cleanRow(r));

  // AI enrichment: only fill fields that are still missing 
  const useAi = (typeof useAiFlag === "string" ? useAiFlag : "0") === "1" && isOpenAIEnabled;
  const enriched = await Promise.all(
    cleaned.map(async (base) => {
      const needsAi =
        useAi &&
        (!base.name ||
          !base.domain ||
          !base.country ||
          !base.city ||
          !base.employee_size_bucket);

      const aiHints: Partial<EnrichmentInput> = needsAi ? await enrichIfNeeded({ ...base }) : {};

      // Merge AI hints without overwriting 
      const merged = {
        ...base,
        name: base.name ?? aiHints.name ?? null,
        domain: base.domain ?? aiHints.domain ?? null,
        country: base.country ?? aiHints.country ?? null,
        city: base.city ?? aiHints.city ?? null,
        employee_size_bucket: base.employee_size_bucket ?? aiHints.employee_size_bucket ?? null,
      };

      // normalize to keep formatting consistent
      return {
        ...merged,
        domain: normalizeDomain(merged.domain),
        country: normalizeCountry(merged.country),
        city: normalizeCity(merged.city),
        employee_size_bucket: bucketEmployeeSize(merged.employee_size_bucket),
      };
    })
  );

  // DB setup
  const supabase = getSupabaseAdmin();
  type CompanyInsert = Database["public"]["Tables"]["companies"]["Insert"];

  const withDomain = enriched.filter((r) => r.domain);
  const withoutDomain = enriched.filter((r) => !r.domain);

  // With domain
  for (const r of withDomain) {
    const payload: CompanyInsert = {
      name: r.name ?? null,
      domain: r.domain ?? null,
      country: r.country ?? null,
      city: r.city ?? null,
      employee_size_bucket: r.employee_size_bucket ?? null,
      raw_json: r.raw_json as CompanyInsert["raw_json"],
    };

    // If both name and domain are present, try promoting a prior domainless record first
    if (payload.name && payload.domain) {
      try {
        await promoteDomainlessIfExists(supabase, payload);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    // Upsert on (domain,name) to avoid duplicates when domain is known
    const { error } = await supabase
      .from("companies")
      .upsert([payload] as unknown as never, { onConflict: "domain,name" });

    if (error) {
      console.error("Supabase upsert error (domain)", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Without domain 
  for (const r of withoutDomain) {
    const payload: CompanyInsert = {
      name: r.name ?? null,
      domain: null,
      country: r.country ?? null,
      city: r.city ?? null,
      employee_size_bucket: r.employee_size_bucket ?? null,
      raw_json: r.raw_json as CompanyInsert["raw_json"],
    };

    if (payload.name) {
      // Try domainless match: name + cit)  fallback toname
      const match = await findDomainlessMatch(supabase, {
        name: payload.name ?? undefined,
        city: payload.city ?? undefined,
      });

      if (match?.id) {
        // enrichment of the existing domainless record
        const { error: updErr } = await supabase
          .from("companies")
          .update(({
            country: payload.country,
            city: payload.city,
            employee_size_bucket: payload.employee_size_bucket,
            raw_json: payload.raw_json,
          }) as unknown as never)
          .eq("id", match.id);

        if (updErr) {
          console.error("Supabase update error (no-domain)", updErr);
          return NextResponse.json({ error: updErr.message }, { status: 500 });
        }
        continue; 
      }
    }

    // No prior domainless match - insert new 
    const { error: insErr } = await supabase
      .from("companies")
      .insert(payload as unknown as never);

    if (insErr) {
      console.error("Supabase insert error (no-domain)", insErr);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  // Report the number of input rows processed 
  return NextResponse.json({ inserted: cleaned.length });
}

// Helpers //

// domainless match: try name + city, then name. Returns first match or null //
async function findDomainlessMatch(
  supabase: Supabase,
  { name, city }: { name?: string; city?: string }
): Promise<{ id: string } | null> {
  if (name && city) {
    const { data, error } = await supabase
      .from("companies")
      .select("id")
      .is("domain", null)
      .eq("name", name)
      .eq("city", city)
      .limit(1);

    if (error) {
      console.error("Supabase match error (name+city)", error);
      throw new Error(error.message);
    }
    if (data && data.length > 0) return data[0];
  }

  if (name) {
    const { data, error } = await supabase
      .from("companies")
      .select("id")
      .is("domain", null)
      .eq("name", name)
      .limit(1);

    if (error) {
      console.error("Supabase match error (name only)", error);
      throw new Error(error.message);
    }
    if (data && data.length > 0) return data[0];
  }

  return null;
}
