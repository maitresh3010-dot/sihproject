const FIELD_LABELS = {
  productName: "Product name", mrp: "MRP", netQuantity: "Net Quantity",
  manufacturer: "Manufacturer", otherInfo: "Other information",
};

// Optional package-vs-listing comparison. Mismatches are reported as
// potential discrepancies requiring verification — never as violations.
export default function EcommerceComparison({ comparison }) {
  if (!comparison) return null;
  return (
    <div className="card"><h3 style={{ marginTop: 0 }}>Compare Online Listing</h3>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Field</th><th>Package</th><th>Listing</th><th>Result</th></tr></thead>
        <tbody>{comparison.map((r) => (
          <tr key={r.field}>
            <td>{FIELD_LABELS[r.field] || r.field}</td>
            <td>{r.package_value || "—"}</td>
            <td>{r.listing_value || "—"}</td>
            <td>{r.info || r.match == null ? <span className="muted">info</span>
              : r.match ? <span className="res-ok">✓</span>
              : <span className="res-warn">⚠ Potential mismatch</span>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <div className="disclaimer">Potential discrepancy — requires verification. A mismatch is not automatically a legal violation.</div>
    </div>
  );
}
