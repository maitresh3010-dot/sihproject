const fmtDate = (s) => { try { return new Date(s).toLocaleString(); } catch { return s; } };
module.exports = { fmtDate };
