import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import LoadingScanner from "../components/LoadingScanner";
import { productService } from "../services/productService";
import { fmtDate, shortId } from "../utils/formatters";

export default function ProductDetails() {
  const { name } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { productService.get(decodeURIComponent(name)).then(setData).catch((e) => setErr(e.message)); }, [name]);
  if (err) return <div className="card"><span className="badge bad">{err}</span> <Link to="/products">← Products</Link></div>;
  if (!data) return <LoadingScanner text="Loading product…" />;
  const { product, history } = data;
  return (
    <div className="grid">
      <Link to="/products">← Products</Link>
      <h2 style={{ margin: 0 }}>{product.name}</h2>
      <div className="card"><div className="tbl-wrap"><table className="tbl"><tbody>
        <tr><td>Manufacturer</td><td>{product.manufacturer || "—"}</td></tr>
        <tr><td>Category</td><td>{product.categoryLabel || product.category || "—"}</td></tr>
        <tr><td>Inspections</td><td>{product.inspectionCount}</td></tr>
        <tr><td>Latest status</td><td><StatusBadge value={product.lastVerdict} /> ({product.lastScore ?? "—"}%)</td></tr>
      </tbody></table></div></div>
      <div className="card"><h3 style={{ marginTop: 0 }}>Inspection history</h3>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Inspection ID</th><th>Date</th><th>Officer</th><th>Score</th><th>Status</th><th></th></tr></thead>
          <tbody>{history.map((r) => <tr key={r.id}><td>{shortId(r.id)}</td><td>{fmtDate(r.createdAt)}</td><td>{r.officer}</td><td>{r.score}%</td><td><StatusBadge value={r.verdict} /></td><td><Link to={`/scan/${r.id}`}>View Inspection</Link></td></tr>)}
          {!history.length && <tr><td colSpan={6} className="muted">No inspections.</td></tr>}</tbody>
        </table></div></div>
    </div>
  );
}
