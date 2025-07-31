import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import CustomXAxisTick from "./CustomXAxisTick";

export default function ModelsChart({ models }) {
  return (
    <div className="h-80 bg-white dark:bg-gray-800 p-4 rounded shadow">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={models}
          margin={{ top: 16, right: 16, left: 16, bottom: 70 }}
        >
          <XAxis dataKey="Model" interval={0} tick={<CustomXAxisTick />} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="VRAM Required (GB)" name="VRAM (GB)" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}