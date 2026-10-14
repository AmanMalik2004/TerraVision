import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export default function MetricComparisonChart({ data, className = "" }) {
  if (!data.some(row => row.accuracy != null)) {
    return <div className={`evaluation-empty ${className}`}><h3>Comparison data unavailable</h3><p>No measured comparison metrics were found.</p></div>;
  }
  return <div className={`chart-wrap ${className}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}><CartesianGrid stroke="#253144" strokeDasharray="3 4" vertical={false}/><XAxis dataKey="model" stroke="#8190a6" tickLine={false} axisLine={false} tick={{ fontSize: 10 }}/><YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={v => `${v}%`} stroke="#8190a6" tickLine={false} axisLine={false} tick={{ fontSize: 10 }}/><Tooltip contentStyle={{ background: "#111b29", border: "1px solid #334156", borderRadius: 8, color: "#e8edf5" }} formatter={v => [`${Number(v).toFixed(2)}%`]}/><Legend/><Bar dataKey="accuracy" name="Accuracy" fill="#65deb0" radius={[4, 4, 0, 0]} maxBarSize={40}/><Bar dataKey="f1" name="Macro F1" fill="#62d8e8" radius={[4, 4, 0, 0]} maxBarSize={40}/></BarChart></ResponsiveContainer></div>;
}
