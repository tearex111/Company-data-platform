import { NextResponse } from "next/server";

const EMPLOYEE_BUCKETS = [
	"1-10",
	"11-50",
	"51-200",
	"201-500",
	"501-1 000",
	"1 001-5 000",
	"5 001-10 000",
	"10 000+",
];

// Rndpoint to feed the size dropdown
export async function GET() {
	return NextResponse.json({ data: EMPLOYEE_BUCKETS });
}


