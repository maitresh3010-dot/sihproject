export default function StatCard({ label, value, tone }) {
  return <div className={`card stat${tone ? ` tone-${tone}` : ""}`}><div className="num">{value}</div><div className="lbl">{label}</div></div>;
}
