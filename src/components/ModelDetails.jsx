import React, { useEffect, useMemo, useState } from "react";

/* ---------------- helpers ---------------- */
function toNum(v) {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}
function prettyGB(v, digits = 2) {
  const n = toNum(v);
  if (n == null) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: digits })} GB`;
}
function safeParseConfig(details) {
  try {
    const raw = details?.config_json;
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}
/** KV per session (GiB) for context length S. Uses num_key_value_heads if present; else attention heads. */
function estimateKvGiB(cfg, S, fallbacks, bytesPerElt = 2) {
  const L =
    toNum(cfg?.num_hidden_layers) ??
    toNum(fallbacks?.num_hidden_layers) ??
    0;
  if (!L || !S) return null;

  const attnHeads =
    toNum(cfg?.num_attention_heads) ??
    toNum(fallbacks?.num_attention_heads) ??
    0;
  const kvHeads = toNum(cfg?.num_key_value_heads) ?? attnHeads ?? 0;
  if (!kvHeads) return null;

  const dModel =
    toNum(cfg?.hidden_size) ?? toNum(fallbacks?.hidden_size) ?? 0;
  const headDim =
    toNum(cfg?.head_dim) || (attnHeads ? Math.floor(dModel / attnHeads) : 0);
  if (!headDim) return null;

  const bytes = L * S * kvHeads * headDim * 2 /* K+V */ * bytesPerElt;
  return bytes / 1024 ** 3;
}

/* ================ component ================ */
/**
 * Props:
 *  - details: model details from API
 *  - onKvCacheOverride?: (gb:number)=>void
 *  - latencyMs?: number
 *  - contextLen?: number
 *  - tokenSizeBytes?: number (defaults to 2)
 */
export default function ModelDetails({
  details,
  onKvCacheOverride,
  latencyMs,
  contextLen,
  tokenSizeBytes = 2,
}) {
  // If no details yet, render nothing (keeps UI empty while searching)
  if (!details) return null;

  const [kvOverride, setKvOverride] = useState("");
  useEffect(() => setKvOverride(""), [details]);

  const cfg = useMemo(() => safeParseConfig(details), [details]);

  const latencyDisplayMs = useMemo(() => {
    const s = toNum(details?.base_latency_s);
    if (s != null) return Math.round(s * 1000);
    return (
      toNum(details?.first_token_latency_ms) ??
      toNum(details?.base_latency_ms) ??
      toNum(details?.first_time_to_token_latency_ms) ??
      toNum(latencyMs) ??
      null
    );
  }, [details, latencyMs]);

  const minimalVram = useMemo(() => {
    return (
      toNum(details?.minimal_gpu_memory_gb) ??
      toNum(details?.base_vram_gb) ??
      toNum(details?.min_vram_gb) ??
      null
    );
  }, [details]);

  const kvApiGb = useMemo(() => {
    return (
      toNum(details?.kv_cache_fp16_gb) ??
      toNum(details?.kv_cache_bf16_gb) ??
      toNum(details?.kv_cache_fp32_gb) ??
      null
    );
  }, [details]);

  const kvPerSessionGb = useMemo(() => {
    if (!cfg || !contextLen) return null;
    return estimateKvGiB(
      cfg,
      contextLen,
      {
        num_hidden_layers: details?.num_hidden_layers,
        hidden_size: details?.hidden_size,
        num_attention_heads: details?.num_attention_heads,
      },
      tokenSizeBytes || 2
    );
  }, [cfg, details, contextLen, tokenSizeBytes]);

  const modelId = details?.model_id || "Unknown";
  const showOverride = !!details?.missing_kv_cache;

  return (
    <div className="bg-gray-800 p-4 rounded-lg mb-6">
      <h3 className="font-bold text-lg mb-2">Model Requirements</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p>
            <strong>Model Size:</strong>{" "}
            {modelId}
          </p>
          <p>
            <strong>Minimal GPU memory:</strong>{" "}
            {minimalVram != null ? prettyGB(minimalVram) : "Unknown"}
          </p>
        </div>

        <div>
          <p>
            <strong>First Time to Token Latency:</strong>{" "}
            {latencyDisplayMs != null ? `${latencyDisplayMs} ms` : "Unknown"}
          </p>

          <p>
            <strong>KV cache per session (fp16):</strong>{" "}
            {kvPerSessionGb != null
              ? `${prettyGB(kvPerSessionGb)}/user`
              : "Unknown"}{" "}
            {kvPerSessionGb != null && (
              <span className="text-xs text-gray-300">
                (at your {contextLen ?? "—"} tokens)
              </span>
            )}
          </p>

          {/* Only show backend info if it differs (usually max-window) */}
          {kvApiGb != null &&
            (kvPerSessionGb == null ||
              Math.abs(kvApiGb - kvPerSessionGb) > 0.25) && (
              <div className="mt-1 text-xs text-gray-300">
                Backend KV (reported):{" "}
                <span className="text-gray-100">{prettyGB(kvApiGb)}</span>/user
              </div>
            )}
        </div>
      </div>

      {showOverride && (
        <div className="mt-4 p-3 bg-yellow-900 rounded-lg text-yellow-200">
          <span>
            <strong>Notice:</strong> KVCache size could not be determined for
            this model.
            <br />
            Please enter a custom KVCache (GB/user) value to continue.
          </span>
          <div className="mt-2 flex items-center">
            <input
              type="number"
              className="px-2 py-1 rounded bg-gray-100 text-black"
              placeholder="KVCache (GB)"
              min={0.1}
              step={0.1}
              value={kvOverride}
              onChange={(e) => setKvOverride(e.target.value)}
            />
            <button
              className="ml-2 px-3 py-1 rounded bg-blue-600 text-white font-bold disabled:opacity-50"
              disabled={!kvOverride}
              onClick={() => onKvCacheOverride?.(Number(kvOverride))}
            >
              Use Value
            </button>
          </div>
        </div>
      )}
    </div>
  );
}