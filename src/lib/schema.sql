-- Main table for uploaded and enriched records
create table if not exists companies (
	id uuid primary key default gen_random_uuid(),
	name text,
	domain text,
	country text,
	city text,
	employee_size_bucket text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	raw_json jsonb not null,
	unique(domain, name)
);

-- Simple indexes to speed up filtering 
create index if not exists idx_companies_country on companies (country);
create index if not exists idx_companies_employee on companies (employee_size_bucket);
create index if not exists idx_companies_domain on companies using gin (to_tsvector('simple', coalesce(domain, '')));

-- Trigger to keep updated_at in sync on row updates
create or replace function set_updated_at()
returns trigger as $$
begin
	new.updated_at = now();
	return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_updated_at on companies;
create trigger trg_set_updated_at
before update on companies
for each row execute function set_updated_at();


