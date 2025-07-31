export default function ModelsTable({ models }) {
    return (
      <div className="overflow-auto bg-white dark:bg-gray-800 p-4 rounded shadow">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="px-2 py-1">Model</th>
              <th className="px-2 py-1">Size</th>
              <th className="px-2 py-1">VRAM (GB)</th>
              <th className="px-2 py-1">Latency (s)</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.Model} className="border-t">
                <td className="px-2 py-1">{m.Model}</td>
                <td className="px-2 py-1">{m.Size}</td>
                <td className="px-2 py-1">{m["VRAM Required (GB)"]}</td>
                <td className="px-2 py-1">{m["Base Latency (s)"]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }