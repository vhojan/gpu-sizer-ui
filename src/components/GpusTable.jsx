export default function GpusTable({ gpus }) {
    return (
      <div className="overflow-auto bg-white dark:bg-gray-800 p-4 rounded shadow">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="px-2 py-1">GPU</th>
              <th className="px-2 py-1">VRAM</th>
              <th className="px-2 py-1">TFLOPs</th>
              <th className="px-2 py-1">Tokens/s</th>
            </tr>
          </thead>
          <tbody>
            {gpus.map((g) => (
              <tr key={g["GPU Type"]} className="border-t">
                <td className="px-2 py-1">{g["GPU Type"]}</td>
                <td className="px-2 py-1">{g["VRAM (GB)"]}</td>
                <td className="px-2 py-1">{g["TFLOPs (FP16)"]}</td>
                <td className="px-2 py-1">{g["Tokens/s"]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }