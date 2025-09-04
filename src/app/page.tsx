"use client";
import { useEffect, useState } from "react";
import ky from "ky";

type Company = {
  id: string;
  name: string | null;
  domain: string | null;
  country: string | null;
  city: string | null;
  employee_size_bucket: string | null;
  created_at: string;
};

type ListResponse<T> = { data: T; total?: number };
const fetcher = <T = unknown>(url: string) => ky.get(url).json<T>();

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [filters, setFilters] = useState({ country: "", employee_size: "", domain: "" });
  const [countries, setCountries] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [rows, setRows] = useState<Company[]>([]);
  const [count, setCount] = useState<number>(0);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    (async () => {
      const c = await fetcher<ListResponse<string[]>>("/api/countries").catch(
        () => ({ data: [] as string[] } as ListResponse<string[]>)
      );
      const s = await fetcher<ListResponse<string[]>>("/api/employee-sizes").catch(
        () => ({ data: [] as string[] } as ListResponse<string[]>)
      );
      setCountries(c.data ?? []);
      setSizes(s.data ?? []);
    })();
  }, []);

  // Refetch the table 
  useEffect(() => {
    const handle = setTimeout(async () => {
      setSearching(true);
      const params = new URLSearchParams();
      if (filters.country) params.set("country", filters.country);
      if (filters.employee_size) params.set("employee_size", filters.employee_size);
      if (filters.domain && filters.domain.length >= 2) params.set("domain", filters.domain);
      const r = await fetcher<ListResponse<Company[]>>(`/api/companies?${params.toString()}`);
      setRows(r.data || []);
      setCount(r.total || 0);
      setSearching(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [filters]);

  // Upload handler send CSV and AI preference 
  async function onUpload() {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("use_ai", useAi ? "1" : "0");
    try {
      const res = await ky.post("/api/upload", { body: fd, timeout: 60000 });
      setUploading(false);
      if (res.ok) {
        setFile(null);
        const r = await fetcher<ListResponse<Company[]>>(`/api/companies`);
        setRows(r.data || []);
        setCount(r.total || 0);
        alert("Upload successful!");
      } else {
        const msg = await res.text();
        alert(`Upload failed: ${msg}`);
      }
    } catch (err) {
      setUploading(false);
      const message =
        err && typeof err === "object" && "response" in err && err.response ? await (err.response as Response).text() : String(err);
      alert(`Upload failed: ${message}`);
    }
  }

  // UI: uploader, filters, simple table
  return (
    <div className="min-h-screen p-6">
      <main className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Company Data Platform</h1>
          <p className="text-sm text-neutral-500">Upload CSV and filter company data</p>
        </header>

        {/* Upload */}
        <section className="rounded border p-4 space-y-3">
          <h2 className="text-base font-medium">Upload CSV</h2>
          <div
            className="border-2 border-dashed rounded p-8 text-center text-sm cursor-pointer hover:bg-neutral-50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
            onClick={() => document.getElementById("fileInput")?.click()}
            role="button"
            aria-label="Upload CSV"
          >
            {file ? <span className="font-medium">{file.name}</span> : <span>Drag & drop or click to choose CSV</span>}
          </div>
          <input
            id="fileInput"
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
              e.currentTarget.value = "";
            }}
          />
          <div>
            <label className="inline-flex items-center gap-2 mr-4 text-sm text-neutral-700">
              <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
              Use AI enrichment
            </label>
            <button className="inline-flex items-center justify-center rounded bg-black px-3 py-2 text-white disabled:opacity-50" onClick={onUpload} disabled={!file || uploading}>
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </section>

        {/* Filters */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-1">
            <label className="text-sm text-neutral-600">Country</label>
            <select className="border rounded px-2 py-2" value={filters.country} onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))}>
              <option value="">All</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <label className="text-sm text-neutral-600">Employee size</label>
            <select className="border rounded px-2 py-2" value={filters.employee_size} onChange={(e) => setFilters((f) => ({ ...f, employee_size: e.target.value }))}>
              <option value="">All</option>
              {sizes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <label className="text-sm text-neutral-600">Domain</label>
            <input className="border rounded px-2 py-2" value={filters.domain} onChange={(e) => setFilters((f) => ({ ...f, domain: e.target.value }))} placeholder="e.g. amazon" />
          </div>
        </section>

        {/* Results */}
        <section className="rounded border p-4">
          <div className="flex items-center justify-between mb-3 text-sm text-neutral-600">
            <div>{count}</div>
            <div className="flex items-center gap-2">
              {searching ? <span className="text-neutral-400">loading...</span> : null}
              <button
                className="inline-flex items-center justify-center rounded border px-2 py-1 text-xs"
                onClick={async () => {
                  if (!confirm("Delete all companies?")) return;
                  await ky.delete("/api/companies");
                  const r = await fetcher<ListResponse<Company[]>>(`/api/companies`);
                  setRows(r.data || []);
                  setCount(r.total || 0);
                }}
              >
                Clear data
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Domain</th>
                  <th className="py-2 pr-4">Country</th>
                  <th className="py-2 pr-4">Employee Size</th>
                  <th className="py-2 pr-4">City</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td className="py-2" colSpan={5}>No results</td></tr>
                ) : rows.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="py-2 pr-4">{c.name ?? "—"}</td>
                    <td className="py-2 pr-4">{c.domain ?? "—"}</td>
                    <td className="py-2 pr-4">{c.country ?? "—"}</td>
                    <td className="py-2 pr-4">{c.employee_size_bucket ?? "—"}</td>
                    <td className="py-2 pr-4">{c.city ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
        </section>
      </main>
    </div>
  );
}
