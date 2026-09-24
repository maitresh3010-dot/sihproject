import { api, API_BASE } from "./api";
export const reportService = {
  summary: () => api.get("/api/reports/summary"),
  rules: () => api.get("/api/rules"),
  saveRules: (rules) => api.put("/api/rules", { rules }),
  csvUrl: () => `${API_BASE}/api/reports/export.csv`,
};
