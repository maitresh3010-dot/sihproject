import { api } from "./api";
export const userService = {
  list: () => api.get("/api/users"),
  create: (payload) => api.post("/api/users", payload),
  setRole: (id, role) => api.put(`/api/users/${id}`, { role }),
  setActive: (id, active) => api.put(`/api/users/${id}`, { active }),
  remove: (id) => api.del(`/api/users/${id}`),
};
