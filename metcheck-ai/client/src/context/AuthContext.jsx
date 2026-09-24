import { createContext, useContext, useEffect, useState } from "react";
import { authService } from "../services/authService";
const Ctx = createContext(null);
const norm = (r) => ["ADMIN", "OFFICER", "VIEWER"].includes(String(r || "").toUpperCase()) ? String(r).toUpperCase() : "OFFICER";
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const u = JSON.parse(localStorage.getItem("mc_user") || "null");
      return u ? { ...u, role: norm(u.role) } : null;
    } catch { return null; }
  });
  const save = (d) => {
    const u = { ...d.user, role: norm(d.user.role) };
    localStorage.setItem("mc_token", d.token); localStorage.setItem("mc_user", JSON.stringify(u));
    setUser(u); return u;
  };
  const login = async (email, password) => save(await authService.login(email, password));
  const register = async (p) => save(await authService.register({ ...p, role: norm(p.role) }));
  const logout = () => { localStorage.removeItem("mc_token"); localStorage.removeItem("mc_user"); setUser(null); };
  const hasRole = (...roles) => user && roles.map(norm).includes(norm(user.role));
  useEffect(() => {
    if (user) authService.me().then((d) => setUser({ ...d.user, role: norm(d.user.role) })).catch(() => logout());
    // eslint-disable-next-line
  }, []);
  return <Ctx.Provider value={{ user, login, register, logout, hasRole }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
