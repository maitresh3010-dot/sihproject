import { api } from "./api";
export const productService = {
  list: (q = "") => api.get(`/api/products${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  get: (id) => api.get(`/api/products/${encodeURIComponent(id)}`),
};
