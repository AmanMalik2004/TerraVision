import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export default function TrainingHistoryChart({ data }) {
  const grouped = [...data.reduce((epochs, row) => {
    const epoch = Number(row.epoch);
    const point = epochs.get(epoch) || { epoch };
    const model = /cnn/i.test(row.model) ? "cnn" : /resnet/i.test(row.model) ? "resnet" : /vit/i.test(row.model) ? "vit" : null;
    if (model && Number.isFinite(Number(row.val_accuracy))) point[model] = Number(row.val_accuracy);
    epochs.set(epoch, point);
    return epochs;
  }, new Map()).values()].sort((a, b) => a.epoch - b.epoch);

  return <div className="chart-wrap history-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={grouped} margin={{ top: 8, right: 14, bottom: 0, left: -15 }}><CartesianGrid stroke="#253144" strokeDasharray="3 4"/><XAxis dataKey="epoch" type="number" domain={["dataMin", "dataMax"]} ticks={[...new Set(grouped.map(row => row.epoch))]} stroke="#8190a6" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} tickFormatter={v => `Epoch ${v}`}/><YAxis domain={[0, 1]} tickFormatter={v => `${Math.round(v * 100)}%`} stroke="#8190a6" tickLine={false} axisLine={false} tick={{ fontSize: 10 }}/><Tooltip contentStyle={{ background: "#111b29", border: "1px solid #334156", borderRadius: 8, color: "#e8edf5" }} formatter={v => [`${(Number(v) * 100).toFixed(1)}%`, "Validation accuracy"]}/><Legend/><Line type="monotone" dataKey="cnn" name="CNN validation" stroke="#65deb0" strokeWidth={2} dot={{ r: 3 }}/><Line type="monotone" dataKey="resnet" name="ResNet18 validation" stroke="#62d8e8" strokeWidth={2} dot={{ r: 3 }}/><Line type="monotone" dataKey="vit" name="ViT validation" stroke="#a99aff" strokeWidth={2} dot={{ r: 3 }}/></LineChart></ResponsiveContainer></div>;
}
