import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function App() {
  const API_BASE = "https://gpu-sizer-api-bqb6bnc8e0c8hfgm.northeurope-01.azurewebsites.net/";

  // Tabs
  const tabs = ["Sizer", "Models", "GPUs"];
  const [activeTab, setActiveTab] = useState("Sizer");

  // Shared data
  const [models, setModels] = useState([]);
  const [gpus, setGpus] = useState([]);

  // Sizer state
  const [model, setModel] = useState("");
  const [modelDetails, setModelDetails] = useState(null);
  const [users, setUsers] = useState(1);
  const [latency, setLatency] = useState(1000);
  const [rec, setRec] = useState(null);
  const [error, setError] = useState("");

  // Load models & GPUs once
  useEffect(() => {
    fetch(`${API_BASE}/models`)
      .then((r) => r.json())
      .then((list) => {
        setModels(list);
        if (list.length) setModel(list[0].Model);
      })
      .catch(() => setError("Failed to load models"));

    fetch(`${API_BASE}/gpus`)
      .then((r) => r.json())
      .then(setGpus)
      .catch(() => setError("Failed to load GPUs"));
  }, []);

  // Update model details & default latency
  useEffect(() => {
    if (!model) return;
    const details = models.find((m) => m.Model === model) || null;
    setModelDetails(details);
    if (details) setLatency(Math.round(details["Base Latency (s)"] * 1000));
    fetchRecommendation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // Refetch on users or latency change
  useEffect(() => {
    if (activeTab === "Sizer" && model) fetchRecommendation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, latency]);

  const fetchRecommendation = async (overrideGpu) => {
    setError("");
    setRec(null);
    try {
      const url = new URL(`${API_BASE}/recommendation`);
      url.searchParams.set("model", model);
      url.searchParams.set("users", users);
      url.searchParams.set("latency", latency);
      if (overrideGpu) url.searchParams.set("gpu", overrideGpu);
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      setRec(await res.json());
    } catch (e) {
      setError(e.message);
    }
  };

  // Swap logic: click an alternative → becomes recommended, old recommended goes back into alternatives
  const swapAlt = (alt) => {
    setRec((prev) => {
      if (!prev) return prev;
      const oldRec = prev.recommended;
      const newAlts = prev.alternatives
        .filter((a) => a["GPU Type"] !== alt["GPU Type"])
        .concat(oldRec);
      return {
        ...prev,
        recommended: alt,
        alternatives: newAlts,
      };
    });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-6">
      <h1 className="text-4xl font-bold mb-6">GPU Sizer</h1>

      {/* Tabs */}
      <div className="flex space-x-4 mb-6">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-t-lg ${
              activeTab === t
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* SIZER TAB */}
      {activeTab === "Sizer" && (
        <div className="space-y-6">
          {/* Model selector */}
          <label className="block">
            <span className="font-medium">Model</span>
            <select
              className="mt-1 block w-full p-2 border rounded bg-white dark:bg-gray-800"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.Model} value={m.Model}>
                  {m.Model}
                </option>
              ))}
            </select>
          </label>

          {/* Model Requirements */}
          {modelDetails && (
            <div>
              <h2 className="text-xl font-semibold mb-2">Model Requirements</h2>
              <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded grid grid-cols-2 gap-4">
                <div>
                  <strong>Model Size:</strong> {modelDetails.Size}
                </div>
                <div>
                  <strong>First Time to Token Latency:</strong>{" "}
                  {modelDetails["Base Latency (s)"]} s
                </div>
                <div>
                  <strong>Minimal GPU memory:</strong>{" "}
                  {modelDetails["VRAM Required (GB)"]} GB
                </div>
                <div>
                  <strong>Suggested KVCache with FP16 Precision:</strong>{" "}
                  {modelDetails["KV Cache (GB per user)"]} GB/user
                </div>
              </div>
            </div>
          )}

          {/* Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className="font-medium">Concurrent Sessions</span>
              <input
                type="number"
                min="1"
                className="mt-1 block w-full p-2 border rounded bg-white dark:bg-gray-800"
                value={users}
                onChange={(e) => setUsers(+e.target.value)}
              />
              <div className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                Adding more concurrent sessions adds more KVCache reservations and adds up the average number of tokens/seconds for a session. Adding more users automatically means you are asking more computational and memory resources from the GPU.
              </div>
            </label>
            <label>
              <span className="font-medium">First Time to Token Latency (ms)</span>
              <div className="flex items-center space-x-2 mt-1">
                <span className="font-mono text-sm">{latency} ms</span>
              </div>
              <input
                type="range"
                min={modelDetails ? Math.round(modelDetails["Base Latency (s)"] * 1000) : 1}
                max={30000}
                step={50}
                value={latency}
                onChange={(e) => setLatency(Number(e.target.value))}
                className="w-full mt-2"
                disabled={!modelDetails}
              />
              <div className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                The initial latency is the minimal achievable latency for a single session. Increasing users without increasing the first time to token latency will require more GPU cores and could ask for multiple GPUs if it exceeds a single one.
              </div>
            </label>
          </div>

          {/* Recommendation */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded shadow space-y-4">
            <h2 className="text-2xl font-semibold">Recommendation</h2>
            {error && <div className="text-red-500">{error}</div>}
            {!error && rec == null && <div>Loading…</div>}
            {!error && rec && !rec.recommended && <div>No GPU found.</div>}
            {!error && rec && rec.recommended && (
              <div className="space-y-2">
                <div>
                  <strong>GPU:</strong> {rec.recommended["GPU Type"]}
                </div>
                <div>
                  <strong>Qty:</strong> {rec.recommended.Config}
                </div>
                <div>
                  <strong>Total VRAM:</strong>{" "}
                  {rec.recommended["Total VRAM (GB)"]} GB
                </div>
                <div>
                  <strong>Tokens/s:</strong>{" "}
                  {rec.recommended["Tokens/s"] ?? rec.recommended.tokens_per_second ?? "—"}
                </div>
              </div>
            )}

            {/* Alternatives */}
            {rec && rec.alternatives?.length > 0 && (
              <>
                <h3 className="mt-4 font-medium">Alternatives</h3>
                <ul className="list-disc pl-6 space-y-1">
                  {rec.alternatives.map((alt) => (
                    <li key={`${alt["GPU Type"]}-${alt.Config}`}>
                      <button
                        className="text-blue-500 underline"
                        onClick={() => swapAlt(alt)}
                      >
                        {alt["GPU Type"]} – {alt.Config} (
                        {alt["Tokens/s"] ?? alt.tokens_per_second ?? "—"} Tokens/s)
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Reasoning */}
            {rec && rec.reasoning && (
              <>
                <h3 className="mt-4 font-medium">Reasoning</h3>
                <pre className="bg-gray-100 dark:bg-gray-700 p-2 rounded text-sm">
                  {rec.reasoning}
                </pre>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODELS TAB */}
      {activeTab === "Models" && (
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold">Model Repository</h2>
          <div className="h-64 bg-white dark:bg-gray-800 p-4 rounded shadow">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={models}>
                <XAxis dataKey="Model" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar
                  dataKey="VRAM Required (GB)"
                  name="VRAM (GB)"
                  fill="#3b82f6"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
        </div>
      )}

      {/* GPUS TAB */}
      {activeTab === "GPUs" && (
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold">GPU List & Performance</h2>
          <div className="h-64 bg-white dark:bg-gray-800 p-4 rounded shadow">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gpus}>
                <XAxis dataKey="GPU Type" tickLine={false} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="Tokens/s" name="Tokens/sec" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
        </div>
      )}
    </div>
  );
}