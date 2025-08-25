import React, { useEffect, useState, useRef } from "react";
import ModelSelector from "./components/ModelSelector";
import ModelDetails from "./components/ModelDetails";
import SessionTokenParams from "./components/SessionTokenParams";
import GpuSizingEstimate from "./components/GpuSizingEstimate";
import ModelsChart from "./components/ModelsChart";
import ModelsTable from "./components/ModelsTable";
import GpusChart from "./components/GpusChart";
import GpusTable from "./components/GpusTable";
import Footer from "./components/Footer";

/* -------------------- small helpers -------------------- */
function getTokensPerSec(obj) {
  return (
    obj?.["Tokens/s"] ??
    obj?.tokens_per_second ??
    obj?.tokensPerSecond ??
    null
  );
}
function findNvlinkSolution(gpus, modelDetails, totalTokensPerSecond) {
  const nvlinkGpus = gpus.filter((g) => g.NVLink === true || g.nvlink === true);
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

/* -------------------- constants -------------------- */
const API_BASE =
  "https://gpu-sizer-api-bqb6bnc8e0c8hfgm.northeurope-01.azurewebsites.net";
const DEFAULT_USERS = 1;
const DEFAULT_LATENCY_MS = 1000;
const DEFAULT_SESSION_TOKENS = 400;
const TOKEN_SIZE_BYTES = 2;

/* ======================== APP ======================== */
export default function App() {
  //const tabs = ["Inference Sizer", "Models", "GPUs"];
  const tabs = ["Inference Sizer", "GPUs"];

  const [activeTab, setActiveTab] = useState("Inference Sizer");

  const [models, setModels] = useState([]);
  const [gpus, setGpus] = useState([]);

  const [model, setModel] = useState("");
  const [modelDetails, setModelDetails] = useState(null);

  const [users, setUsers] = useState(DEFAULT_USERS);
  const [latency, setLatency] = useState(DEFAULT_LATENCY_MS);
  const [sessionTokens, setSessionTokens] = useState(DEFAULT_SESSION_TOKENS);

  const [rec, setRec] = useState(null);
  const [error, setError] = useState("");
  const [kvCacheOverride, setKvCacheOverride] = useState(null);

  const fetchAbortRef = useRef(null);

  /* ---------- bootstrap data ---------- */
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

  /* ---------- when model text changes: reset UI to defaults, then fetch ---------- */
  useEffect(() => {
    // Cancel any in-flight model fetch
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
    }

    // Hard reset to defaults while user is typing/searching a new model
    setModelDetails(null);
    setRec(null);
    setError("");
    setKvCacheOverride(null);
    setUsers(DEFAULT_USERS);
    setLatency(DEFAULT_LATENCY_MS);
    setSessionTokens(DEFAULT_SESSION_TOKENS);

    if (!model) return; // nothing to fetch

    const ctrl = new AbortController();
    fetchAbortRef.current = ctrl;

    const run = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/models/${encodeURIComponent(model)}`,
          { signal: ctrl.signal }
        );
        if (!res.ok) throw new Error("Model details not found");
        const details = await res.json();

        // Only apply if still current (not aborted/switched)
        if (ctrl.signal.aborted) return;

        setModelDetails(details);
        setKvCacheOverride(null);

        // If API ships a base latency in seconds, map it to ms once
        const baseLatency =
          details.base_latency_s ??
          details.first_token_latency_s ??
          null;
        if (baseLatency != null) {
          setLatency(Math.round(Number(baseLatency) * 1000));
        }

        // Initial recommendation once details exist
        fetchRecommendation(details, kvCacheOverride);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        // keep UI clean; no details -> sections stay hidden
        setModelDetails(null);
      }
    };

    run();

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  /* ---------- update recommendation when params change ---------- */
  useEffect(() => {
    if (activeTab !== "Inference Sizer") return;
    if (!model || !modelDetails) return;
    fetchRecommendation(modelDetails, kvCacheOverride);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, latency, kvCacheOverride]);

  /* ---------- switching away clears rec/error ---------- */
  useEffect(() => {
    if (activeTab !== "Inference Sizer") {
      setRec(null);
      setError("");
    }
  }, [activeTab]);

  async function fetchRecommendation(detailsOverride, kvOverride) {
    try {
      setError("");
      setRec(null);
      const url = new URL(`${API_BASE}/recommendation`);
      url.searchParams.set("model", model);
      url.searchParams.set("users", String(users));
      url.searchParams.set("latency", String(latency));
      if (kvOverride != null) {
        url.searchParams.set("kv_cache_override", String(kvOverride));
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      setRec(await res.json());
    } catch (e) {
      setError(e.message || "Failed to fetch recommendation");
    }
  }

  function handleKvCacheOverride(value) {
    setKvCacheOverride(value);
  }

  function swapAlt(alt) {
    setRec((prev) => {
      if (!prev) return prev;
      const oldRec = prev.recommended;
      const newAlts = prev.alternatives
        .filter((a) => a["GPU Type"] !== alt["GPU Type"])
        .concat(oldRec);
      return { ...prev, recommended: alt, alternatives: newAlts };
    });
  }

  const totalTokensPerSecond = users * sessionTokens;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-6">
      <h1 className="text-4xl font-bold mb-6">Model to GPU Sizing Toolkit</h1>
      <p className="text-sm text-gray-400 mb-6">Public Beta v0.7.1 — results are indicative only</p>
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

      {/* Inference Sizer */}
      {activeTab === "Inference Sizer" && (
        <div className="space-y-6">
          <ModelSelector value={model} onSelect={setModel} />

          {/* Render sections ONLY once modelDetails exists */}
          {modelDetails && (
            <>
              <ModelDetails
                details={modelDetails}
                onKvCacheOverride={handleKvCacheOverride}
                latencyMs={latency}
                contextLen={sessionTokens}
                tokenSizeBytes={TOKEN_SIZE_BYTES}
              />

              <SessionTokenParams
                users={users}
                setUsers={setUsers}
                latency={latency}
                setLatency={setLatency}
                sessionTokens={sessionTokens}
                setSessionTokens={setSessionTokens}
                modelDetails={modelDetails}
                TOKEN_SIZE={TOKEN_SIZE_BYTES}
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
            </>
          )}
        </div>
      )}

      {/* Models tab */}
      {activeTab === "Models" && (
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold">Model Repository</h2>
          <ModelsChart models={models} apiBase={API_BASE} />
          <ModelsTable models={models} apiBase={API_BASE} />
        </div>
      )}

      {/* GPUs tab */}
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