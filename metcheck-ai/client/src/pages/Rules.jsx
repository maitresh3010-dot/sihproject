import { useEffect, useState } from "react";
import LoadingScanner from "../components/LoadingScanner";
import { reportService } from "../services/reportService";
import { scanService } from "../services/scanService";

const SEV = ["LOW", "MEDIUM", "HIGH"];
const VT = ["REQUIRED", "OPTIONAL"];
const EMPTY = { ruleId: "", name: "", field: "", anyOf: "", description: "", category: "GENERAL", validationType: "REQUIRED", severity: "MEDIUM", active: true, source: "Legal Metrology reference material", requiredFor: "" };

export default function Rules() {
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState("");
  const [fCat, setFCat] = useState("");
  const [fSev, setFSev] = useState("");
  const [fActive, setFActive] = useState("");
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    reportService.rules().then(setRules).catch((e) => setMsg(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); scanService.categories().then(setCategories).catch(() => {}); }, []); // eslint-disable-line

  const persist = async (next) => {
    setMsg("");
    try {
      const cleaned = next.map((r) => ({
        ruleId: r.ruleId, name: r.name, field: r.field || null,
        anyOf: String(r.anyOf || "").split(",").map((s) => s.trim()).filter(Boolean),
        description: r.description || "", category: (r.category || "GENERAL").toUpperCase(),
        requirement: r.requirement || null,
        sourceDocument: r.sourceDocument || null,
        sourcePage: r.sourcePage != null && r.sourcePage !== "" ? r.sourcePage : null,
        status: r.status || (r.active === false ? "inactive" : "active"),
        validationType: r.validationType, severity: r.severity, active: r.active !== false,
        source: r.source || "",
        requiredFor: Array.isArray(r.requiredFor) ? r.requiredFor : String(r.requiredFor || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
      }));
      const saved = await reportService.saveRules(cleaned);
      setRules(saved);
      setMsg("Rule database saved.");
    } catch (e) { setMsg(e.message); }
  };

  const toggleActive = (id) => {
    const next = rules.map((r) => (r.ruleId || r.id) === id ? { ...r, active: (r.active !== false) ? false : true } : r);
    setRules(next); persist(next);
  };
  const remove = (id) => {
    if (!confirm(`Delete rule ${id}?`)) return;
    const next = rules.filter((r) => (r.ruleId || r.id) !== id);
    setRules(next); persist(next);
  };
  const saveEdit = () => {
    if (!editing.ruleId.trim() || !editing.name.trim()) { setMsg("Rule ID and name are required."); return; }
    if (!editing.field.trim() && !editing.anyOf.trim()) { setMsg("Field or Any-of is required."); return; }
    const next = editing._isNew
      ? [...rules, { ...editing }]
      : rules.map((r) => ((r.ruleId || r.id) === editing.ruleId ? { ...editing } : r));
    if (editing._isNew && rules.some((r) => (r.ruleId || r.id) === editing.ruleId)) { setMsg("Rule ID already exists."); return; }
    setEditing(null); setRules(next); persist(next);
  };

  let rows = [...rules];
  if (q.trim()) rows = rows.filter((r) => `${r.ruleId || r.id} ${r.name} ${r.description || ""}`.toLowerCase().includes(q.toLowerCase()));
  if (fCat) rows = rows.filter((r) => (r.category || "GENERAL").toUpperCase() === fCat);
  if (fSev) rows = rows.filter((r) => String(r.severity).toUpperCase() === fSev);
  if (fActive === "active") rows = rows.filter((r) => r.active !== false);
  if (fActive === "inactive") rows = rows.filter((r) => r.active === false);

  return (
    <div className="grid">
      <div className="row"><h2 style={{ margin: 0 }}>Rule management</h2><div style={{ flex: 1 }} />
        <button className="btn" onClick={() => setEditing({ ...EMPTY, _isNew: true })}>+ Add Rule</button></div>
      {msg && <div><span className="badge info">{msg}</span></div>}
      <div className="disclaimer">Rules live in the MongoDB rule collection (file fallback). Only ADMIN can access this page. Advisory screening only.</div>
      {loading && <LoadingScanner text="Loading rules…" />}
      {!loading && (<>
      <div className="card"><div className="row">
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search rules…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ maxWidth: 170 }} value={fCat} onChange={(e) => setFCat(e.target.value)}>
          <option value="">All categories</option><option value="GENERAL">GENERAL</option>
          {categories.map((c) => <option key={c.id} value={c.id.toUpperCase()}>{c.label}</option>)}
        </select>
        <select className="input" style={{ maxWidth: 150 }} value={fSev} onChange={(e) => setFSev(e.target.value)}>
          <option value="">All severities</option>{SEV.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input" style={{ maxWidth: 150 }} value={fActive} onChange={(e) => setFActive(e.target.value)}>
          <option value="">Active + inactive</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
      </div></div>
      <div className="card"><div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Rule ID</th><th>Name</th><th>Category</th><th>Severity</th><th>Status</th><th>Source</th><th>Action</th></tr></thead>
        <tbody>{rows.map((r) => {
          const id = r.ruleId || r.id;
          return (
            <tr key={id}><td>{id}</td><td>{r.name}</td><td>{(r.category || "GENERAL").toUpperCase()}</td>
              <td>{String(r.severity).toUpperCase()}</td>
              <td>{r.active === false ? <span className="badge">Inactive</span> : <span className="badge ok">Active</span>}</td>
              <td style={{ maxWidth: 220 }}>{r.source || "—"}
                {r.requirement && <div className="req-quote">“{String(r.requirement).slice(0, 160)}{String(r.requirement).length > 160 ? "…" : ""}”<footer>— {r.sourceDocument || ""}{r.sourcePage != null ? `, p. ${r.sourcePage}` : ""} (human-verified)</footer></div>}</td>
              <td><div className="row">
                <button className="link-btn" onClick={() => setEditing({ ...r, anyOf: Array.isArray(r.anyOf) ? r.anyOf.join(", ") : (r.anyOf || ""), requiredFor: Array.isArray(r.requiredFor) ? r.requiredFor.join(", ") : (r.requiredFor || "") })}>Edit</button>
                <button className="link-btn" onClick={() => toggleActive(id)}>{r.active === false ? "Activate" : "Deactivate"}</button>
                <button className="link-btn" onClick={() => remove(id)}>Delete</button>
              </div></td></tr>
          );
        })}
        {!rows.length && <tr><td colSpan={7} className="muted">No rules match.</td></tr>}</tbody>
      </table></div></div>
      </>)}

      {editing && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{editing._isNew ? "Add rule" : `Edit ${editing.ruleId}`}</h3>
            <div className="grid form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div><label className="lbl">Rule ID (e.g. LM-009)</label>
                <input className="input" value={editing.ruleId} disabled={!editing._isNew} onChange={(e) => setEditing({ ...editing, ruleId: e.target.value })} /></div>
              <div><label className="lbl">Name</label>
                <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div style={{ gridColumn: "1 / -1" }}><label className="lbl">Description</label>
                <input className="input" value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div><label className="lbl">Field</label>
                <input className="input" value={editing.field || ""} placeholder="e.g. mrp" onChange={(e) => setEditing({ ...editing, field: e.target.value })} /></div>
              <div><label className="lbl">Any-of (comma-separated, alternative fields)</label>
                <input className="input" value={editing.anyOf || ""} placeholder="e.g. manufacturer, packer" onChange={(e) => setEditing({ ...editing, anyOf: e.target.value })} /></div>
              <div><label className="lbl">Category</label>
                <select className="input" value={(editing.category || "GENERAL").toUpperCase()} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                  <option value="GENERAL">GENERAL (all)</option>
                  {categories.map((c) => <option key={c.id} value={c.id.toUpperCase()}>{c.label}</option>)}
                </select></div>
              <div><label className="lbl">Validation type</label>
                <select className="input" value={editing.validationType || "REQUIRED"} onChange={(e) => setEditing({ ...editing, validationType: e.target.value })}>
                  {VT.map((v) => <option key={v} value={v}>{v}</option>)}
                </select></div>
              <div><label className="lbl">Severity</label>
                <select className="input" value={String(editing.severity || "MEDIUM").toUpperCase()} onChange={(e) => setEditing({ ...editing, severity: e.target.value })}>
                  {SEV.map((v) => <option key={v} value={v}>{v}</option>)}
                </select></div>
              <div><label className="lbl">Required for categories</label>
                <input className="input" value={editing.requiredFor || ""} placeholder="e.g. food, pharmaceuticals" onChange={(e) => setEditing({ ...editing, requiredFor: e.target.value })} /></div>
                      <div style={{ gridColumn: "1 / -1" }}><label className="lbl">Source / reference</label>
                        <input className="input" value={editing.source || ""} onChange={(e) => setEditing({ ...editing, source: e.target.value })} /></div>
                      <div style={{ gridColumn: "1 / -1" }}><label className="lbl">Verified requirement (exact source text — set via human review)</label>
                        <textarea className="input" rows={3} value={editing.requirement || ""} onChange={(e) => setEditing({ ...editing, requirement: e.target.value })} /></div>
                      <div><label className="lbl">Source document</label>
                        <input className="input" value={editing.sourceDocument || ""} onChange={(e) => setEditing({ ...editing, sourceDocument: e.target.value })} /></div>
                      <div><label className="lbl">Source page</label>
                        <input className="input" type="number" value={editing.sourcePage ?? ""} onChange={(e) => setEditing({ ...editing, sourcePage: e.target.value === "" ? null : Number(e.target.value) })} /></div>
              <label className="row" style={{ fontSize: 14 }}><input type="checkbox" checked={editing.active !== false}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Active</label>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={saveEdit}>Save Changes</button>
              <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
