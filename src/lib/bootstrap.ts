import { readFile } from "node:fs/promises";
import { Client } from "pg";
import path from "node:path";

// Minimal migration 
export async function runMigrations() {
	const schemaPath = path.join(process.cwd(), "src", "lib", "schema.sql");
	const sql = await readFile(schemaPath, "utf-8");
	const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || "";
	if (!connectionString) {
		throw new Error("No database connection string found. Set DATABASE_URL or SUPABASE_DB_URL.");
	}
	const client = new Client({ connectionString });
	await client.connect();
	try {
		await client.query(sql);
	} finally {
		await client.end();
	}
}

// Allow running as a script
if (require.main === module) {
	runMigrations()
		.then(() => {
			console.log("Database schema ensured.");
			process.exit(0);
		})
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
}


