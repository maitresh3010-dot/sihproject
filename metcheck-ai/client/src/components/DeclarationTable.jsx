const LABELS = {
  productName: "Product Name", manufacturer: "Manufacturer", packer: "Packer",
  importer: "Importer", address: "Address", netQuantity: "Net Quantity",
  mrp: "MRP", manufacturingDate: "Manufacturing Date", packingDate: "Packing Date",
  importDate: "Import Date", expiry: "Expiry / Best-before", consumerCare: "Consumer Care",
  countryOrigin: "Country of Origin", otherDeclarations: "Other Declarations",
  product_name: "Product Name", net_quantity: "Net Quantity", mfg_date: "Date",
  consumer_care: "Consumer Care", country_origin: "Country of Origin",
};
const ORDER = ["productName", "manufacturer", "packer", "importer", "address", "netQuantity", "mrp",
  "manufacturingDate", "packingDate", "importDate", "expiry", "consumerCare", "countryOrigin", "otherDeclarations"];

export function shortDeclLabel(key) {
  const map = { productName: "Product Name", manufacturer: "Manufacturer", packer: "Packer", importer: "Importer", netQuantity: "Net Quantity", mrp: "MRP" };
  return map[key] || LABELS[key] || key;
}

export default function DeclarationTable({ declarations }) {
  if (!declarations) return <p className="muted">No declarations extracted.</p>;
  const keys = [...ORDER.filter((k) => k in declarations), ...Object.keys(declarations).filter((k) => !ORDER.includes(k))];
  return (
    <div className="tbl-wrap"><table className="tbl">
      <thead><tr><th>Declaration</th><th>Result</th><th>Confidence</th></tr></thead>
      <tbody>{keys.map((k) => {
        const v = declarations[k] || {};
        const st = v.status || (v.present ? "FOUND" : "NOT_FOUND");
        const ok = st === "FOUND";
        return (
          <tr key={k}><td>{LABELS[k] || k}</td>
            <td>{ok
              ? <span className="res-ok">✓ Found</span>
              : <span className="res-bad">✕ Not Found</span>}</td>
            <td>{ok && v.confidence != null ? `${Math.round(v.confidence * 100)}%` : <span className="muted">—</span>}</td></tr>
        );
      })}</tbody>
    </table></div>
  );
}
