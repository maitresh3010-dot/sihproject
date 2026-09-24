import { reportService } from "../services/reportService";
export default function Reports() {
  const token = localStorage.getItem("mc_token");
  const url = `${reportService.csvUrl()}?token=${encodeURIComponent(token || "")}`;
  return <div className="grid"><h2 style={{ margin: 0 }}>Compliance reports</h2>
    <div className="card"><p className="muted">Export inspection history as CSV for enforcement records. Attach the token automatically — or open with your session.</p>
      <div className="row"><a className="btn" href={reportService.csvUrl()} onClick={(e) => { e.preventDefault(); fetch(reportService.csvUrl(), { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.blob()).then((b) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "legalmet-report.csv"; a.click(); }); }}>Download CSV</a></div>
      <div className="disclaimer" style={{ marginTop: 10 }}>Exports contain advisory screening results only, not legal determinations.</div></div></div>;
}
