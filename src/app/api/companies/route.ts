import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns list of companies plus a total count for pagination.
export async function GET(req: NextRequest) {
	// Parse filters and pagination from the URL
	const { searchParams } = new URL(req.url);
	const country = searchParams.get("country");
	const employee = searchParams.get("employee_size");
	const domain = searchParams.get("domain");
	const limit = Math.min(Number(searchParams.get("limit") || 50), 500);
	const offset = Math.max(Number(searchParams.get("offset") || 0), 0);
	const supabase = getSupabaseAdmin();

	// Base selection plus exact count so UI can show total rows
	let query = supabase
		.from("companies")
		.select("id,name,domain,country,city,employee_size_bucket,created_at", { count: "estimated" });
	// Apply filters
	if (country) query = query.eq("country", country);
	if (employee) query = query.eq("employee_size_bucket", employee);
	if (domain && domain.length >= 2) query = query.ilike("domain", `%${domain}%`);

	// Sort newest first and paginate using range
	query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
	const { data, error, count } = await query;
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json({ data, total: count ?? 0 });
}


// deletes all companies
export async function DELETE() {
	const supabase = getSupabaseAdmin();
	const { error } = await supabase.from("companies").delete().not("id", "is", null as unknown as never);
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json({ ok: true });
}


