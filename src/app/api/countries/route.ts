import { NextResponse } from "next/server";
import countries from "i18n-iso-countries";
import enCountriesJson from "i18n-iso-countries/langs/en.json" assert { type: "json" };

// Register English locale so lookups return English names
const enLocale = enCountriesJson as unknown as Parameters<typeof countries.registerLocale>[0];
countries.registerLocale(enLocale);

// 	Country names for dropdown
export async function GET() {
	const names = countries.getNames("en");
	const list = Object.values(names).sort();
	return NextResponse.json({ data: list });
}


