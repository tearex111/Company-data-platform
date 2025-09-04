Company-Data Mini-Platform
==========================

- Stack: Next.js (App Router) • TypeScript • Supabase Postgres • Tailwind • ky/fetch

Features
--------

- Upload messy CSV to `/api/upload` (multipart/form-data)
- Cleans & enriches (country names, domain normalization, employee size buckets)
- Upserts into Postgres with duplicate safe constraints 
- Filter the table 

Setup
-----

1. Create a Supabase project and run the SQL in the Supabase SQL editor (see section below).
2. Create `.env.local` with:

```
SUPABASE_URL="https://YOUR-REF.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
OPENAI_ENABLED="1"          # optional; set to 0 to disable
OPENAI_API_KEY="sk-proj-..."
```

3. Install deps:

```
npm i
```

4. Start dev server:

```
npm run dev
```  

End to end pipeline
-------------------

1) Upload (UI → /api/upload)
- Client sends multipart/form data CSV to `POST /api/upload`.
- Server parses, cleans each row, optionally enriches missing fields with AI, then upserts to Supabase.

2) Cleaning
- Domain: Strip protocol/www/paths, keep the apex domain via tldts. Fix simple glued TLDs (e.g. `brandcom` → `brand.com`), else return `null`.  
- Country: Take the last comma separated part. Handle alpha-2, alpha-3, or full names. If it says “Global/Worldwide”, normalize to `Global`.  
- City: Drop URLs or numbers. Use the first segment and trim trailing country names/codes.  
- Employee size: Normalize numbers, ranges, or “k” suffixes into one of 8 fixed buckets.  
- Raw row:  keep the original CSV row in `raw_json` for reference.  


3) Optional AI enrichment 
- Only for rows with missing fields after cleaning.
- Payload includes missing keys, non-null context.
- AI rules: infer domain from brand token (`airbnb` → `airbnb.com`), infer country from city, map `global`/`worldwide` to `Global`. We re normalize AI outputs.

4) Write to Supabase (src/app/api/upload/route.ts)
- Rows with domain:
  - If both name and domain exist, first try to promote an existing domainless record (match by name, then name+city) by updating it with the domain and other fields.
  - Then upsert on `(domain,name)` to avoid duplicates when the domain is known.
- Rows without domain:
  - If name exists, try to find and update an existing domainless record by `name+city`, else by `name`.
  - If no match, insert a new domainless row.

5) Filter API (src/app/api/companies/route.ts)
- `GET /api/companies?country=...&employee_size=...&domain=...` returns `{ data, total }`.

6) UI (src/app/page.tsx)
- Drag and drop upload with progress, filter dropdowns, responsive table showing count.

Database (Supabase Postgres)
----------------------------
- Table `companies`: id, name, domain, country, city, employee_size_bucket, timestamps, raw_json.
- Constraint: `unique(domain, name)` to support idempotent uploads.
- Trigger updates `updated_at` on change.

## Tech choices

-


Files overview
--------------
- `src/app/api/upload/route.ts`: CSV ingest → clean → optional AI → write to DB.
- `src/app/api/companies/route.ts`: Filtered list with count.
- `src/app/api/countries/route.ts`, `src/app/api/employee-sizes/route.ts`: Dropdown data.
- `src/lib/clean.ts`: Central cleaning/normalization logic.
- `src/lib/ai.ts`: Lightweight OpenAI client - fills only missing fields.
- `src/lib/db.ts`: Supabase admin client .
- `src/env.ts`: Zod validated env Supabase + optional OpenAI + toggle.
- `src/app/page.tsx`: Upload + filters + table UI.
