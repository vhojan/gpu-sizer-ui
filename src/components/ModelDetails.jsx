import React, { useState, useEffect } from "react";

export default function ModelDetails({ details, onKvCacheOverride }) {
  const [kvOverride, setKvOverride] = useState("");

  useEffect(() => {
    setKvOverride(""); // Reset when details change
  }, [details]);

  if (!details) return null;

  return (
    <div className="bg-gray-800 p-4 rounded-lg mb-6">
      <h3 className="font-bold text-lg mb-2">Model Requirements</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p>
            <strong>Model Size:</strong>{" "}
            {details.model_id || "Unknown"}
          </p>
          <p>
            <strong>Minimal GPU memory:</strong>{" "}
            {details.kv_cache_fp16_gb
              ? `${details.kv_cache_fp16_gb} GB`
              : "Unknown"}
          </p>
        </div>
        <div>
          <p>
            <strong>First Time to Token Latency:</strong>{" "}
            {details.base_latency_s
              ? `${details.base_latency_s} s`
              : "Unknown"}
          </p>
          <p>
            <strong>Suggested KVCache with FP16 Precision:</strong>{" "}
            {details.kv_cache_fp16_gb
              ? `${details.kv_cache_fp16_gb} GB/user`
              : (
                <span className="text-yellow-300">
                  Unknown (KVCache info missing)
                </span>
              )
            }
          </p>
        </div>
      </div>
      {details.missing_kv_cache && (
        <div className="mt-4 p-3 bg-yellow-900 rounded-lg text-yellow-200">
          <span>
            <strong>Notice:</strong> KVCache size could not be determined for this model.
            <br />
            Please enter a custom KVCache (GB/user) value to continue.
          </span>
          <div className="mt-2 flex items-center">
            <input
              type="number"
              className="px-2 py-1 rounded bg-gray-100 text-black"
              placeholder="KVCache (GB)"
              min={1}
              step={0.1}
              value={kvOverride}
              onChange={e => setKvOverride(e.target.value)}
            />
            <button
              className="ml-2 px-3 py-1 rounded bg-blue-600 text-white font-bold"
              disabled={!kvOverride}
              onClick={() => onKvCacheOverride(Number(kvOverride))}
            >
              Use Value
            </button>
          </div>
        </div>
      )}
    </div>
  );
}