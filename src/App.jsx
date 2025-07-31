import React, { useEffect, useState } from "react";
import ModelSelector from "./components/ModelSelector";
import ModelDetails from "./components/ModelDetails";
import SessionTokenParams from "./components/SessionTokenParams";
import GpuSizingEstimate from "./components/GpuSizingEstimate";
import ModelsChart from "./components/ModelsChart";
import ModelsTable from "./components/ModelsTable";
import GpusChart from "./components/GpusChart";
import GpusTable from "./components/GpusTable";
import Footer from "./components/Footer";

// --- Utility for NVLink logic ---
function getTokensPerSec(obj) {
  return (
    obj?.["Tokens/s"] ??
    obj?.tokens_per_second ??
    obj?.tokensPerSecond ??
    null
  );
}
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

export default function App() {
  const API_BASE = "https://gpu-sizer-api-bqb6bnc8e0c8hfgm.northeurope-01.azurewebsites.net";
  const tabs = ["Inference Sizer", "Models", "GPUs"];
  const [activeTab, setActiveTab] = useState("Inference Sizer");
  const [models, setModels] = useState([]);
  const [gpus, setGpus] = useState([]);
  const [model, setModel] = useState("");
  const [modelDetails, setModelDetails] = useState(null);
  const [users, setUsers] = useState(1);
  const [latency, setLatency] = useState(1000);
  const [sessionTokens, setSessionTokens] = useState(400);
  const [rec, setRec] = useState(null);
  const [error, setError] = useState("");
  const [kvCacheOverride, setKvCacheOverride] = useState(null);

  // Fetch models and GPUs on mount
  useEffect(() => {
    fetch(`${API_BASE}/models`)
      .then((r) => r.json())
      .then(setModels)
      .catch(() => setError("Failed to load models"));

    fetch(`${API_BASE}/gpus`)
      .then((r) => r.json())
      .then(setGpus)
      .catch(() => setError("Failed to load GPUs"));
  }, []);

  // When a model is selected, fetch details from backend and recalculate latency
  useEffect(() => {
    if (!model) {
      setModelDetails(null);
      setRec(null);
      setKvCacheOverride(null);
      return;
    }
    fetch(`${API_BASE}/models/${encodeURIComponent(model)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Model details not found");
        return r.json();
      })
      .then((details) => {
        setModelDetails(details);
        setKvCacheOverride(null); // Reset override on model change
        // Flexible: accept either API or DB field names
        const baseLatency =
          details.base_latency_s ??
          details["Base Latency (s)"] ??
          details.base_latency ??
          details.baseLatency ??
          null;
        if (baseLatency) setLatency(Math.round(baseLatency * 1000));
        fetchRecommendation(null, details, null); // trigger with initial details
      })
      .catch(() => setModelDetails(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // Update recommendation if users, latency, or kvCacheOverride changes
  useEffect(() => {
    if (activeTab === "Inference Sizer" && model && modelDetails) {
      fetchRecommendation(null, modelDetails, kvCacheOverride);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, latency, kvCacheOverride]);

  // If user changes tab, clear error/rec if leaving Inference Sizer
  useEffect(() => {
    if (activeTab !== "Inference Sizer") {
      setRec(null);
      setError("");
    }
  }, [activeTab]);

  const fetchRecommendation = async (overrideGpu, detailsOverride, kvOverride) => {
    if (!model) return;
    setError("");
    setRec(null);
    try {
      const url = new URL(`${API_BASE}/recommendation`);
      url.searchParams.set("model", model);
      url.searchParams.set("users", users);
      url.searchParams.set("latency", latency);
      if (overrideGpu) url.searchParams.set("gpu", overrideGpu);
      if (kvOverride) url.searchParams.set("kv_cache_override", kvOverride);
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      setRec(await res.json());
    } catch (e) {
      setError(e.message);
    }
  };

  const handleKvCacheOverride = (value) => {
    setKvCacheOverride(value);
  };

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

  const totalTokensPerSecond = users * sessionTokens;
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

      {/* --- INFERENCE SIZER TAB --- */}
      {activeTab === "Inference Sizer" && (
        <div className="space-y-6">
          <ModelSelector value={model} onSelect={setModel} />
          <ModelDetails
            details={modelDetails}
            onKvCacheOverride={handleKvCacheOverride}
          />
          <SessionTokenParams
            users={users}
            setUsers={setUsers}
            latency={latency}
            setLatency={setLatency}
            sessionTokens={sessionTokens}
            setSessionTokens={setSessionTokens}
            modelDetails={modelDetails}
            TOKEN_SIZE={TOKEN_SIZE}
          />
          <GpuSizingEstimate
            error={error}
            model={model}
            rec={rec}
            gpus={gpus}
            modelDetails={modelDetails}
            totalTokensPerSecond={totalTokensPerSecond}
            getTokensPerSec={getTokensPerSec}
            findNvlinkSolution={findNvlinkSolution}
            swapAlt={swapAlt}
          />
        </div>
      )}

      {/* --- MODELS TAB --- */}
      {activeTab === "Models" && (
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold">Model Repository</h2>
          <ModelsChart models={models} />
          <ModelsTable models={models} />
        </div>
      )}

      {/* --- GPUS TAB --- */}
      {activeTab === "GPUs" && (
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold">GPU List & Performance</h2>
          <GpusChart gpus={gpus} />
          <GpusTable gpus={gpus} />
        </div>
      )}

      <Footer />
    </div>
  );
}