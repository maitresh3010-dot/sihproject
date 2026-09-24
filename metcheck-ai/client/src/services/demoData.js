// DEMO MODE — sample data for SIH presentation.
//
// Separation of concerns:
//   REAL AI MODE: officer uploads real package photos; text comes from the
//     Python AI service (Tesseract/OpenCV) or browser OCR; rules evaluated live.
//   DEMO MODE: sample label text + a locally rendered label image stand in for
//     the camera/AI input. Everything downstream (extraction, rule engine,
//     scoring) is 100% REAL — only the input is simulated, and results are
//     always badged "Demo Mode — demonstration data".
// Never present demo results as live AI results.

export const DEMO_PRODUCTS = [
  {
    id: "demo-biscuits",
    name: "ABC Premium Biscuits",
    category: "food",
    expected: "MRP ✓ · Net Quantity ✓ · Manufacturer ✓ · Date ✓ · Consumer Care ✕ → Potential Violation",
    labelText: [
      "ABC Premium Biscuits",
      "Manufactured by ABC Foods Pvt Ltd, MIDC Area, Pune, Maharashtra, India",
      "Net Qty: 500 g",
      "MRP Rs 299 inclusive of all taxes",
      "Mfg: 15/03/2026",
      "Best before 9 months from manufacture",
    ].join("\n"),
  },
  {
    id: "demo-milk",
    name: "Farm Fresh Toned Milk",
    category: "food",
    expected: "All declarations present → Compliant",
    labelText: [
      "Farm Fresh Toned Milk",
      "Packed by Green Dairy, Anand, Gujarat, India",
      "Net Qty: 1 L",
      "MRP Rs 66",
      "Pkd: 12/08/2026",
      "Best before 6 months from packing",
      "Consumer care: 1800-103-1111, care@greendairy.example",
    ].join("\n"),
  },
  {
    id: "demo-soap",
    name: "Herbal Bathing Soap",
    category: "cosmetics",
    expected: "MRP + expiry missing → Potential Violation",
    labelText: [
      "Herbal Bathing Soap",
      "Manufactured by Nature Care, Delhi, India",
      "Net Qty: 100 g",
      "Mfg: 01/2026",
      "Consumer care: care@naturecare.example",
    ].join("\n"),
  },
];

// Renders a clean synthetic label image so the demo exercises the real
// upload → quality-check → scan path without needing a camera or AI service.
export function renderDemoLabelImage(demo) {
  const canvas = document.createElement("canvas");
  canvas.width = 900; canvas.height = 560;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 900, 560);
  ctx.fillStyle = "#1d4ed8"; ctx.fillRect(0, 0, 900, 90);
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 40px sans-serif";
  ctx.fillText("DEMO LABEL — NOT A REAL PACKAGE", 24, 58);
  ctx.fillStyle = "#0f172a"; ctx.font = "30px sans-serif";
  demo.labelText.split("\n").forEach((line, i) => ctx.fillText(line, 24, 140 + i * 56));
  ctx.strokeStyle = "#e2e8f0"; ctx.strokeRect(4, 4, 892, 552);
  return new Promise((resolve) => canvas.toBlob((blob) => {
    resolve(new File([blob], `${demo.id}.png`, { type: "image/png" }));
  }, "image/png"));
}
