export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || "");
export const required = (s) => !!(s || "").toString().trim();
