import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { API_BASE } from "./api";
import { fmtDate } from "../utils/formatters";

const val = (d, k) => {
  const f = d?.[k];
  if (f && typeof f === "object") return Array.isArray(f.value) ? f.value.join("; ") : f.value || "—";
  return f || "—";
};

async function imageToDataUrl(src) {
  const url = src.startsWith("http") || src.startsWith("blob:") || src.startsWith("data:")
    ? src : `${API_BASE}${src}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("image fetch failed");
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

export async function generateInspectionPdf(rec) {
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  let y = 16;

  doc.setFontSize(18); doc.setFont(undefined, "bold");
  doc.text("LegalMet AI", W / 2, y, { align: "center" }); y += 8;
  doc.setFontSize(12);
  doc.text("LEGAL METROLOGY COMPLIANCE INSPECTION REPORT", W / 2, y, { align: "center" }); y += 4;
  doc.setDrawColor(29, 78, 216); doc.setLineWidth(0.8); doc.line(14, y, W - 14, y); y += 8;

  const meta = [
    ["Inspection ID:", rec.id || "—"],
    ["Date:", fmtDate(rec.createdAt)],
    ["Officer:", `${rec.officerName || ""} (${rec.officer || "—"})`],
    ...(rec.location ? [["Location:", rec.location]] : []),
  ];
  autoTable(doc, { startY: y, body: meta, theme: "plain", styles: { fontSize: 10 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } } });
  y = doc.lastAutoTable.finalY + 6;

  doc.setFontSize(13); doc.setFont(undefined, "bold"); doc.text("Product Information", 14, y); y += 2;
  autoTable(doc, {
    startY: y, theme: "grid", styles: { fontSize: 10 },
    head: [["Field", "Value"]],
    body: [
      ["Product Name", val(rec.declarations, "productName")],
      ["Manufacturer", val(rec.declarations, "manufacturer")],
      ["Category", rec.categoryLabel || rec.category || "—"],
    ],
  });
  y = doc.lastAutoTable.finalY + 6;

  doc.setFontSize(13); doc.setFont(undefined, "bold"); doc.text("Compliance Summary", 14, y); y += 2;
  autoTable(doc, {
    startY: y, theme: "grid", styles: { fontSize: 10 },
    head: [["Metric", "Value"]],
    body: [
      ["Score", `${rec.score}%${rec.scoreDetail ? ` (${rec.scoreDetail.passed} of ${rec.scoreDetail.applicable} applicable checks passed)` : ""}`],
      ["Status", rec.verdict || rec.status || "—"],
    ],
  });
  y = doc.lastAutoTable.finalY + 6;

  doc.setFontSize(13); doc.setFont(undefined, "bold"); doc.text("Declaration Analysis", 14, y); y += 2;
  autoTable(doc, {
    startY: y, theme: "grid", styles: { fontSize: 10 },
    head: [["Declaration", "Value", "Confidence", "Result"]],
    body: [
      ["MRP", val(rec.declarations, "mrp"), conf(rec, "mrp"), res(rec, "mrp")],
      ["Net Quantity", val(rec.declarations, "netQuantity"), conf(rec, "netQuantity"), res(rec, "netQuantity")],
      ["Manufacturer", val(rec.declarations, "manufacturer"), conf(rec, "manufacturer"), res(rec, "manufacturer")],
      ["Date", [val(rec.declarations, "manufacturingDate"), val(rec.declarations, "packingDate"), val(rec.declarations, "importDate")].filter((v) => v !== "—").join("; ") || "—", "—", dateRes(rec)],
      ["Consumer Care", val(rec.declarations, "consumerCare"), conf(rec, "consumerCare"), res(rec, "consumerCare")],
    ],
  });
  y = doc.lastAutoTable.finalY + 6;

  const fails = (rec.checks || []).filter((c) => c.status === "fail");
  const reviews = (rec.checks || []).filter((c) => c.status === "review");
  doc.setFontSize(13); doc.setFont(undefined, "bold"); doc.text("Potential Violations", 14, y); y += 6;
  doc.setFontSize(10); doc.setFont(undefined, "normal");
  if (!fails.length) { doc.text("None.", 14, y); y += 6; }
  fails.forEach((c, i) => { const lines = doc.splitTextToSize(`${i + 1}. ${c.name || c.label} [${c.ruleId || c.rule_id || ""}]`, W - 28); doc.text(lines, 14, y); y += lines.length * 5 + 2; });

  doc.setFontSize(13); doc.setFont(undefined, "bold"); doc.text("Manual Review Items", 14, y); y += 6;
  doc.setFontSize(10); doc.setFont(undefined, "normal");
  if (!reviews.length) { doc.text("None.", 14, y); y += 6; }
  reviews.forEach((c, i) => { const lines = doc.splitTextToSize(`${i + 1}. ${c.name || c.label} [${c.ruleId || c.rule_id || ""}]`, W - 28); doc.text(lines, 14, y); y += lines.length * 5 + 2; });

  if (rec.remarks) {
    y += 2; doc.setFontSize(13); doc.setFont(undefined, "bold"); doc.text("Officer Remarks", 14, y); y += 6;
    doc.setFontSize(10); doc.setFont(undefined, "normal");
    const lines = doc.splitTextToSize(rec.remarks, W - 28); doc.text(lines, 14, y); y += lines.length * 5 + 4;
  }

  const images = rec.images?.length ? rec.images : rec.image ? [rec.image] : [];
  if (images.length) {
    doc.setFontSize(13); doc.setFont(undefined, "bold");
    if (y > 230) { doc.addPage(); y = 16; }
    doc.text("Evidence Images", 14, y); y += 6;
    for (const src of images.slice(0, 4)) {
      try {
        const dataUrl = await imageToDataUrl(src);
        const fmt = dataUrl.includes("image/png") ? "PNG" : "JPEG";
        if (y > 200) { doc.addPage(); y = 16; }
        doc.addImage(dataUrl, fmt, 14, y, 90, 60);
        y += 66;
      } catch { /* image unavailable — continue without it */ }
    }
  }

  y += 4;
  if (y > 250) { doc.addPage(); y = 16; }
  doc.setFontSize(9); doc.setTextColor(100);
  doc.text("Disclaimer: This report is an AI-assisted inspection aid.", 14, y); y += 5;
  doc.text("Final regulatory determination should be made by the authorized enforcement authority.", 14, y);

  doc.save(`LegalMet-${rec.id || "report"}.pdf`);
}

function conf(rec, key) {
  const f = rec.declarations?.[key];
  const st = f?.status || (f?.present ? "FOUND" : "NOT_FOUND");
  return st === "FOUND" && f?.confidence != null ? `${Math.round(f.confidence * 100)}%` : "—";
}
function res(rec, key) {
  const f = rec.declarations?.[key];
  const st = f?.status || (f?.present ? "FOUND" : "NOT_FOUND");
  return st === "FOUND" ? "Found" : "Not Found";
}
function dateRes(rec) {
  const d = rec.declarations || {};
  const any = ["manufacturingDate", "packingDate", "importDate", "mfg_date"].some((k) => {
    const f = d[k]; const st = f?.status || (f?.present ? "FOUND" : "NOT_FOUND"); return st === "FOUND";
  });
  return any ? "Found" : "Not Found";
}
