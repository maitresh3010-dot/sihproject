import { useRef, useState } from "react";
import { formatBytes } from "../utils/formatters";

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;

export default function UploadBox({ files = [], onFiles }) {
  const ref = useRef();
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState("");

  const pick = (list) => {
    setErr("");
    const valid = [];
    for (const f of Array.from(list || [])) {
      if (!ACCEPT.includes(f.type)) { setErr(`${f.name}: only JPG, JPEG, PNG, WEBP allowed.`); continue; }
      if (f.size > MAX_SIZE) { setErr(`${f.name}: exceeds 10 MB.`); continue; }
      valid.push(f);
    }
    onFiles([...files, ...valid].slice(0, 5));
  };
  const remove = (i) => onFiles(files.filter((_, j) => j !== i));

  return (
    <div>
      <div
        className={`upload${drag ? " drag" : ""}`}
        onClick={() => ref.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
        role="button" tabIndex={0}
      >
        <input ref={ref} type="file" accept=".jpg,.jpeg,.png,.webp" multiple hidden
          onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        {files.length ? (
          <div className="thumbs" onClick={(e) => e.stopPropagation()}>
            {files.map((f, i) => (
              <div key={i} className="thumb">
                <img src={URL.createObjectURL(f)} alt={f.name} />
                <div className="thumb-meta"><strong>{f.name}</strong><span>{formatBytes(f.size)}</span></div>
                <button className="btn secondary thumb-x" onClick={() => remove(i)} aria-label={`Remove ${f.name}`}>Remove</button>
              </div>
            ))}
          </div>
        ) : (
          <><p style={{ fontSize: 16 }}><strong>Drop your package photo here</strong></p>
          <p className="muted">or click to browse your files — up to 5 photos, 10 MB each</p>
          <div className="fmt-row">
            {["JPG", "JPEG", "PNG", "WEBP"].map((f) => <span key={f} className="chip">{f}</span>)}
          </div></>
        )}
        {files.length > 0 && files.length < 5 && <p className="muted">Looking good — drop or click to add more ({files.length} of 5)</p>}
      </div>
      {err && <p style={{ marginTop: 8 }}><span className="badge bad">{err}</span></p>}
    </div>
  );
}
