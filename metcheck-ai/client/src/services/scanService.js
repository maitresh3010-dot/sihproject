import { api } from "./api";
export const scanService = {
  // files: File | File[] (up to 5). manualText from browser OCR or typed input.
  scan: (files, manualText = "", opts = {}) => {
    const f = new FormData();
    const arr = Array.isArray(files) ? files : files ? [files] : [];
    arr.slice(0, 5).forEach((file) => f.append("images", file));
    f.append("manualText", manualText || "");
    f.append("category", opts.category || "general");
    if (opts.listing) f.append("listing", JSON.stringify(opts.listing));
    if (opts.quality) f.append("quality", JSON.stringify(opts.quality));
    if (opts.location) f.append("location", opts.location);
    if (opts.demo) f.append("demo", "true");
    return api.postForm("/api/inspections/scan", f);
  },
  evaluateText: (text, opts = {}) =>
    api.post("/api/inspections/evaluate-text", { text, listing: opts.listing || null, category: opts.category || "general" }),
  categories: () => api.get("/api/inspections/categories"),
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.get(`/api/inspections${q ? `?${q}` : ""}`);
  },
  get: (id) => api.get(`/api/inspections/${id}`),
  update: (id, patch) => api.put(`/api/inspections/${id}`, patch),
  remove: (id) => api.del(`/api/inspections/${id}`),
};
