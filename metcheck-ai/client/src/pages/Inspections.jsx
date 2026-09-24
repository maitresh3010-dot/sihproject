import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import LoadingScanner from "../components/LoadingScanner";
import { EmptyState, PageHeader, Pagination } from "../components/ui";
import { scanService } from "../services/scanService";
import { generateInspectionPdf } from "../services/reportPdf";
import { fmtDate, shortId, declVal } from "../utils/formatters";

export default function Inspections() {
  const [q, setQ] = useState("");
  const [verdict, setVerdict] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("date_desc");
  const [categories, setCategories] = useState([]);
  const [data, setData] = useState({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [pdfId, setPdfId] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const load = () => {
    setLoading(true); setErr(null);
    scanService.list({ q, verdict, category, limit: 100 })
      .then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  const hasFilters = q || verdict || category || from || to;
  const clearFilters = () => {
    setQ(""); setVerdict(""); setCategory(""); setFrom(""); setTo(""); setSort("date_desc"); setPage(1);
    setLoading(true); setErr(null);
    scanService.list({ limit: 100 }).then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); scanService.categories().then(setCategories).catch(() => {}); }, []); // eslint-disable-line

  const download = async (id) => {
    setPdfId(id);
    try { await generateInspectionPdf(await scanService.get(id)); }
    finally { setPdfId(null); }
  };

  let rows = [...data.items];
  if (from) rows = rows.filter((r) => (r.createdAt || "") >= from);
  if (to) rows = rows.filter((r) => (r.createdAt || "") <= `${to}T23:59:59`);
  const byDate = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);
  const byScore = (a, b) => (a.score || 0) - (b.score || 0);
  const byProduct = (a, b) => String(a.declarations?.productName?.value || "").localeCompare(String(b.declarations?.productName?.value || ""));
  if (sort === "date_desc") rows.sort((a, b) => byDate(b, a));
  if (sort === "date_asc") rows.sort(byDate);
  if (sort === "score_desc") rows.sort((a, b) => byScore(b, a));
  if (sort === "score_asc") rows.sort(byScore);
  if (sort === "product") rows.sort(byProduct);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="grid">
      <PageHeader
        title={`Inspections (${rows.length})`}
        subtitle="Every scan your team has run, newest first. Search or filter to find a product, officer or verdict."
        actions={<Link className="btn" to="/scan">+ Scan a product</Link>}
      />
      <div className="card"><div className="row">
        <input className="input" style={{ maxWidth: 220 }} placeholder="Search product, MRP, officer…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inspections" />
        <select className="input" style={{ maxWidth: 170 }} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select className="input" style={{ maxWidth: 190 }} value={verdict} onChange={(e) => setVerdict(e.target.value)}>
          <option value="">All statuses</option><option>Compliant</option><option>Potential Violation</option><option>Manual Review Required</option><option>Unable to Verify</option>
        </select>
        <input className="input" style={{ maxWidth: 150 }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <input className="input" style={{ maxWidth: 150 }} type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        <select className="input" style={{ maxWidth: 160 }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="date_desc">Newest first</option><option value="date_asc">Oldest first</option>
          <option value="score_desc">Score: high → low</option><option value="score_asc">Score: low → high</option>
          <option value="product">Product A–Z</option>
        </select>
        <button className="btn secondary" onClick={() => { setPage(1); load(); }}>Apply filters</button>
        {hasFilters && <button className="link-btn" onClick={clearFilters}>Clear all filters</button>}
      </div></div>
      <div className="card"><div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Inspection ID</th><th>Product</th><th>Category</th><th>Officer</th><th>Date</th><th>Score</th><th>Status</th><th>Action</th></tr></thead>
        {loading ? null : (
        <tbody>{pageRows.map((r) => (
          <tr key={r.id}><td>{shortId(r.id)}</td><td>{declVal(r.declarations, "productName", "product_name")}</td>
            <td>{r.categoryLabel || "—"}</td><td>{r.officer}</td><td>{fmtDate(r.createdAt)}</td><td>{r.score}%</td>
            <td><StatusBadge value={r.verdict} /></td>
            <td><div className="row"><Link to={`/scan/${r.id}`}>View Inspection</Link>
              <button className="link-btn" disabled={pdfId === r.id} onClick={() => download(r.id)}>
                {pdfId === r.id ? "…" : "Download Report"}</button></div></td></tr>
        ))}
        {!rows.length && !loading && <tr><td colSpan={8} className="muted">Nothing to show here yet.</td></tr>}</tbody>
        )}
      </table></div>
      {loading && <LoadingScanner text="Loading inspections…" />}
      {err && <p><span className="badge bad">{err}</span></p>}
      {!loading && !err && !rows.length && hasFilters && (
        <EmptyState title="No matches for these filters" body="Try a shorter search, widen the dates, or clear everything and start fresh." actionLabel="Clear all filters" onAction={clearFilters} />
      )}
      {!loading && !err && !rows.length && !hasFilters && (
        <EmptyState title="No inspections yet" body="Your first scan is a minute away — photograph a package and get a compliance result." actionLabel="Scan your first product" to="/scan" />
      )}
      <Pagination page={safePage} totalPages={totalPages} onPage={setPage} /></div>
    </div>
  );
}
