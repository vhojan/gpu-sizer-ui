import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// --- Custom XAxis Tick for Multi-line & Rotated Labels (shared by both tabs) ---
const CustomXAxisTick = (props) => {
  const { x, y, payload } = props;
  const text = payload.value;
  // Wrap label every 10 chars, try to break at spaces
  const wrapText = (txt, maxLen = 10) => {
    const words = txt.split(" ");
    let lines = [];
    let curr = "";
    words.forEach(word => {
      if ((curr + " " + word).trim().length > maxLen) {
        if (curr) lines.push(curr);
        curr = word;
      } else {
        curr = (curr + " " + word).trim();
      }
    });
    if (curr) lines.push(curr);
    return lines;
  };
  const lines = wrapText(text, 10);

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={16}
        textAnchor="end"
        fill="#ccc"
        fontSize={12}
        transform="rotate(-35)"
      >
        {lines.map((line, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 0 : 14}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
};

export default function App() {
  const API_BASE = "https://gpu-sizer-api-bqb6bnc8e0c8hfgm.northeurope-01.azurewebsites.net/";

  // Tabs
  const tabs = ["Inference Sizer", "Models", "GPUs"];
  const [activeTab, setActiveTab] = useState("Inference Sizer");

  // Shared data
  const [models, setModels] = useState([]);
  const [gpus, setGpus] = useState([]);

  // Sizer state
  const [model, setModel] = useState(""); // Default: none selected
  const [modelDetails, setModelDetails] = useState(null);
  const [users, setUsers] = useState(1);
  const [latency, setLatency] = useState(1000);
  const [sessionTokens, setSessionTokens] = useState(400);
  const [rec, setRec] = useState(null);
  const [error, setError] = useState("");

  // Load models & GPUs once
  useEffect(() => {
    fetch(`${API_BASE}/models`)
      .then((r) => r.json())
      .then((list) => setModels(list))
      .catch(() => setError("Failed to load models"));

    fetch(`${API_BASE}/gpus`)
      .then((r) => r.json())
      .then(setGpus)
      .catch(() => setError("Failed to load GPUs"));
  }, []);

  // Update model details & default latency
  useEffect(() => {
    if (!model) {
      setModelDetails(null);
      setRec(null);
      return;
    }
    const details = models.find((m) => m.Model === model) || null;
    setModelDetails(details);
    if (details) setLatency(Math.round(details["Base Latency (s)"] * 1000));
    fetchRecommendation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // Refetch on users or latency change
  useEffect(() => {
    if (activeTab === "Inference Sizer" && model) fetchRecommendation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, latency]);

  const fetchRecommendation = async (overrideGpu) => {
    if (!model) return;
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

  // Helper to get tokens/s from a GPU record
  function getTokensPerSec(obj) {
    return (
      obj?.["Tokens/s"] ??
      obj?.tokens_per_second ??
      obj?.tokensPerSecond ??
      null
    );
  }

  // Helper: Find the "best" NVLink GPU (lowest VRAM with enough tokens/s * n)
  function findNvlinkSolution(gpus, modelDetails, totalTokensPerSecond) {
    const nvlinkGpus = gpus.filter(
      (g) => g.NVLink === true || g.nvlink === true
    );
    nvlinkGpus.sort((a, b) => (a["VRAM (GB)"] ?? 9999) - (b["VRAM (GB)"] ?? 9999));
    for (let gpu of nvlinkGpus) {
      const tokensPerGpu = getTokensPerSec(gpu) || 1;
      const vramPerGpu = gpu["VRAM (GB)"] || 1;
      const numNeeded = Math.ceil(totalTokensPerSecond / tokensPerGpu);
      if (vramPerGpu >= (modelDetails?.["VRAM Required (GB)"] || 0)) {
        return {
          ...gpu,
          NVLinkCount: numNeeded,
          TotalVRAM: numNeeded * vramPerGpu,
          TotalTokens: numNeeded * tokensPerGpu,
        };
      }
    }
    return null;
  }

  // --- Calculate required tokens/sec
  const totalTokensPerSecond = users * sessionTokens;
  // --- Token Size (read-only, always 2 bytes for now)
  const TOKEN_SIZE = 2;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-6">
      <h1 className="text-4xl font-bold mb-6">Model to GPU Sizing Toolkit</h1>

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

      {/* INFERENCE SIZER TAB */}
      {activeTab === "Inference Sizer" && (
        <div className="space-y-6">
          {/* Model selector */}
          <label className="block">
            <span className="font-medium">Model</span>
            <select
              className="mt-1 block w-full p-2 border rounded bg-white dark:bg-gray-800"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="" disabled>
                Please select a model
              </option>
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

          {/* --- Session/Token Parameters SECTION --- */}
          <div>
            <h2 className="text-xl font-semibold mb-2">Session/Token Parameters</h2>
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Row 1, Col 1 */}
              <label>
                <span className="font-medium">Concurrent Sessions</span>
                <input
                  type="number"
                  min="1"
                  disabled={!modelDetails}
                  className="mt-1 block w-full p-2 border rounded bg-white dark:bg-gray-800"
                  value={users}
                  onChange={(e) => setUsers(+e.target.value)}
                />
                <div className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                  Adding more concurrent sessions adds more KVCache reservations and adds up the average number of tokens/seconds for a session. Adding more users automatically means you are asking more computational and memory resources from the GPU.
                </div>
              </label>
              {/* Row 1, Col 2 */}
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
                  disabled={!modelDetails}
                  value={latency}
                  onChange={(e) => setLatency(Number(e.target.value))}
                  className="w-full mt-2"
                />
                <div className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                  The initial latency is the minimal achievable latency for a single session. Increasing users without increasing the first time to token latency will require more GPU cores and could ask for multiple GPUs if it exceeds a single one.
                </div>
              </label>
              {/* Row 2, Col 1 */}
              <label>
                <span className="font-medium">Tokens per Second per Session</span>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="font-mono text-sm">{sessionTokens} tokens/s</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={6000}
                  step={1}
                  disabled={!modelDetails}
                  value={sessionTokens}
                  onChange={(e) => setSessionTokens(Number(e.target.value))}
                  className="w-full mt-2"
                />
                <div className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                  This controls the average tokens per second generated by each concurrent session.
                </div>
              </label>
              {/* Row 2, Col 2 */}
              <label>
                <span className="font-medium">Token Size</span>
                <input
                  className="mt-1 block w-full p-2 border rounded bg-white dark:bg-gray-800"
                  value={`${TOKEN_SIZE} bytes`}
                  readOnly
                />
                <div className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                  Token size is the memory size per token (e.g., 2 bytes for FP16).<br />
                  Typical LLMs use 2 bytes/token, but this can vary.<br />
                  A token usually represents ~4 characters of text.
                </div>
              </label>
            </div>
          </div>
          {/* --- END Session/Token Parameters --- */}

          {/* --- GPU Sizing Estimate (2 Columns) --- */}
          <h2 className="text-2xl font-semibold mb-4 mt-8">GPU Sizing Estimate</h2>
          <div className="bg-white dark:bg-gray-800 p-4 rounded shadow">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column: Recommendation */}
              <div>
                <h3 className="text-xl font-semibold mb-2">Recommendation</h3>
                {error && <div className="text-red-500">{error}</div>}
                {!model && <div>Please select a model to see recommendations.</div>}
                {!error && !model && <div />}
                {!error && rec == null && model && <div>Loading…</div>}
                {!error && rec && !rec.recommended && model && <div>No GPU found.</div>}
                {!error && rec && rec.recommended && model && (
                  <>
                    {getTokensPerSec(rec.recommended) &&
                    totalTokensPerSecond <= getTokensPerSec(rec.recommended) ? (
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
                          {getTokensPerSec(rec.recommended) ?? "—"}
                        </div>
                      </div>
                    ) : (
                      (() => {
                        const nvlinkSol = findNvlinkSolution(
                          gpus,
                          modelDetails,
                          totalTokensPerSecond
                        );
                        return nvlinkSol ? (
                          <div className="space-y-2">
                            <div>
                              <strong>GPU (NVLink):</strong> {nvlinkSol["GPU Type"]}
                            </div>
                            <div>
                              <strong>Qty (NVLink):</strong> {nvlinkSol.NVLinkCount}
                            </div>
                            <div>
                              <strong>Total VRAM:</strong> {nvlinkSol.TotalVRAM} GB
                            </div>
                            <div>
                              <strong>Total Tokens/s:</strong> {nvlinkSol.TotalTokens}
                            </div>
                            <div className="text-blue-500 text-sm">
                              🚦 Requirement exceeds a single GPU, NVLink scaling recommended.
                            </div>
                          </div>
                        ) : (
                          <div className="text-red-500">
                            No NVLink-capable GPU found for your requirements!
                          </div>
                        );
                      })()
                    )}
                  </>
                )}
              </div>

              {/* Right Column: Alternatives */}
              <div>
                <h3 className="text-xl font-semibold mb-2">Alternatives</h3>
                {rec && rec.alternatives?.length > 0 ? (
                  <ul className="list-disc pl-6 space-y-1">
                    {rec.alternatives.map((alt) => (
                      <li key={`${alt["GPU Type"]}-${alt.Config}`}>
                        <button
                          className="text-blue-500 underline"
                          onClick={() => swapAlt(alt)}
                        >
                          {alt["GPU Type"]} – {alt.Config} (
                          {getTokensPerSec(alt) ?? "—"} Tokens/s)
                        </button>
                        {getTokensPerSec(alt) &&
                          totalTokensPerSecond > getTokensPerSec(alt) && (
                            <div className="text-red-500 text-xs ml-2">
                              (Does not meet tokens/sec requirement)
                            </div>
                          )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-gray-500">No alternatives available.</div>
                )}
              </div>
            </div>

            {/* Reasoning below both columns */}
            {rec && rec.reasoning && (
              <>
                <h3 className="mt-6 font-medium">Reasoning</h3>
                <pre className="bg-gray-100 dark:bg-gray-700 p-2 rounded text-sm">
                  {rec.reasoning}
                </pre>
              </>
            )}
          </div>
          {/* --- END GPU Sizing Estimate --- */}
        </div>
      )}

      {/* MODELS TAB */}
      {activeTab === "Models" && (
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold">Model Repository</h2>
          <div className="h-80 bg-white dark:bg-gray-800 p-4 rounded shadow">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={models}
                margin={{ top: 16, right: 16, left: 16, bottom: 70 }}
              >
                <XAxis
                  dataKey="Model"
                  interval={0}
                  tick={<CustomXAxisTick />}
                />
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
          <div className="h-80 bg-white dark:bg-gray-800 p-4 rounded shadow">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={gpus}
                margin={{ top: 16, right: 16, left: 16, bottom: 70 }}
              >
                <XAxis
                  dataKey="GPU Type"
                  interval={0}
                  tick={<CustomXAxisTick />}
                />
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

      {/* Disclaimer Footer */}
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-8 text-center">
        <hr className="my-4" />
        Disclaimer: The GPU Sizer tool is provided for informational purposes only and does not guarantee the accuracy or suitability of its recommendations for your specific use case. 
        Always validate sizing decisions with hardware vendors and/or subject matter experts. 
        The author assumes no responsibility for any loss, damage, or consequences arising from the use of this tool.
      </div>
    </div>
  );
}