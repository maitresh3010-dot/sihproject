import { verdictClass } from "../utils/formatters";
export default function StatusBadge({ value }) {
  return <span className={`badge ${verdictClass(value)}`}>{value || "—"}</span>;
}
