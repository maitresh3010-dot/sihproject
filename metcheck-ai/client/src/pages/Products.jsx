import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import LoadingScanner from "../components/LoadingScanner";
import { EmptyState } from "../components/ui";
import { productService } from "../services/productService";
import { fmtDate } from "../utils/formatters";

export default function Products() {
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const load = () => {
    setList(null); setErr("");
    productService.list(q).then(setList).catch((e) => setErr(e.message));
  };
  useEffect(() => { productService.list().then(setList).catch((e) => setErr(e.message)); }, []); // eslint-disable-line

  return (
    <div className="grid">
      <h2 style={{ margin: 0 }}>Product repository</h2>
      {err && <div><span className="badge bad">{err}</span></div>}
      <div className="card"><div className="row">
        <input className="input" style={{ maxWidth: 300 }} placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn secondary" onClick={load}>Search Products</button>
      </div></div>
      {!list && !err && <LoadingScanner text="Loading products…" />}
      {list && (
        <div className="card"><div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Product</th><th>Manufacturer</th><th>Category</th><th>Last Inspection</th><th>Compliance Status</th><th>Inspections</th><th></th></tr></thead>
          <tbody>{list.map((p) => (
            <tr key={p.productId}><td>{p.name}</td><td>{p.manufacturer || "—"}</td><td>{p.categoryLabel || p.category || "—"}</td>
              <td>{p.lastInspection ? fmtDate(p.lastInspection) : "—"}</td>
              <td><StatusBadge value={p.lastVerdict} /> <span className="muted">({p.avgScore ?? "—"}%)</span></td>
              <td>{p.inspectionCount}</td><td><Link to={`/products/${encodeURIComponent(p.productId)}`}>View Inspection</Link></td></tr>
          ))}
          {!list.length && <tr><td colSpan={7} className="muted">No products match.</td></tr>}</tbody>
        </table></div></div>
      )}
      {list && !list.length && !err && (
        <EmptyState title="No products yet" body="Products appear here automatically after your first scan — each scanned package builds this library." actionLabel="Scan your first product" to="/scan" />
      )}
    </div>
  );
}
