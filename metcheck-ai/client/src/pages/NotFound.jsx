import { Link } from "react-router-dom";
export default function NotFound() {
  return (
    <div className="card empty">
      <div className="empty-art" aria-hidden="true"><span /></div>
      <h3>Hmm, that page wandered off</h3>
      <p className="muted">The link may be mistyped, or the page was moved. Here are some useful places:</p>
      <div className="row" style={{ justifyContent: "center" }}>
        <Link className="btn" to="/">Go to dashboard</Link>
        <Link className="btn secondary" to="/scan">Scan a product</Link>
        <Link className="btn secondary" to="/inspections">View inspections</Link>
      </div>
    </div>
  );
}
