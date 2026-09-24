export const fmtDate = (s) => { try { return new Date(s).toLocaleString(); } catch { return s; } };
export const shortId = (s) => String(s || "").replace(/^insp_/, "").slice(-8).toUpperCase() || "—";
export const verdictClass = (v) => {
  const s = String(v || "").toUpperCase().replace(/[\s-]+/g, "_");
  if (["COMPLIANT", "OK", "PASS"].includes(s)) return "ok";
  if (["POTENTIAL_VIOLATION", "POTENTIAL", "BAD", "FAIL"].includes(s)) return "bad";
  if (["MANUAL_REVIEW", "MANUAL_REVIEW_REQUIRED", "REVIEW", "WARN"].includes(s)) return "warn";
  return "info";
};
export const declVal = (d, camel, snake) => d?.[camel]?.value ?? (snake ? d?.[snake]?.value : undefined) ?? "—";
export const formatBytes = (n) => {
  const x = Number(n) || 0;
  if (x < 1024) return `${x} B`;
  if (x < 1024 * 1024) return `${(x / 1024).toFixed(1)} KB`;
  return `${(x / (1024 * 1024)).toFixed(2)} MB`;
};
