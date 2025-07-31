import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import CustomXAxisTick from "./CustomXAxisTick";

export default function GpusChart({ gpus }) {
  return (
    <div className="h-80 bg-white dark:bg-gray-800 p-4 rounded shadow">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={gpus}
          margin={{ top: 16, right: 16, left: 16, bottom: 70 }}
        >
          <XAxis dataKey="GPU Type" interval={0} tick={<CustomXAxisTick />} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="Tokens/s" name="Tokens/sec" fill="#10b981" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}