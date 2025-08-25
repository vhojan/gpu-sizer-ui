import React, { useEffect, useMemo, useState } from "react";

/**
 * ModelsChart
 * - Accepts `models` as an array of IDs or detail objects
 * - Hydrates IDs into details using `apiBase`
 * - Renders a simple horizontal bar list (no external chart lib)
 */
export default function ModelsChart({ models, apiBase }) {
  const [details, setDetails] = useState([]);
  const [loading, setLoading] = useState(false);

  // normalize to unique IDs if models is array of strings, otherwise pass through
  const { ids, preResolved } = useMemo(() => {
    if (!Array.isArray(models)) return { ids: [], preResolved: [] };
    const stringIds = models.filter((m) => typeof m === "string");
    const objects = models.filter((m) => m && typeof m === "object");
    const uniqueIds = [...new Set(stringIds)];
    return { ids: uniqueIds, preResolved: objects };
  }, [models]);

  useEffect(() => {
    let cancelled = false;
    setDetails(preResolved); // show what we already have
    if (!ids.length) return;

    const fetchChunk = async (id) => {
      try {
        const r = await fetch(`${apiBase}/models/${encodeURIComponent(id)}`);
        if (!r.ok) throw new Error("bad status");
        return await r.json();
      } catch {
        return { model_id: id }; // minimal fallback
      }
    };

    (async () => {
      setLoading(true);
      // light concurrency to avoid hammering the API
      const pool = 8;
      const queue = [...ids];
      const out = [...preResolved];

      const runners = new Array(pool).fill(0).map(async () => {
        while (queue.length && !cancelled) {
          const id = queue.shift();
          const d = await fetchChunk(id);
          if (!cancelled) {
            out.push(d);
            setDetails([...out]); // progressive paint
          }
        }
      });

      await Promise.all(runners);
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [ids, preResolved, apiBase]);

  const data = useMemo(() => {
    // Map to compact rows for a tiny, dependency-free “bar chart”
    return (details || []).map((d) => {
      const vram =
        toNum(d?.minimal_gpu_memory_gb) ??
        toNum(d?.base_vram_gb) ??
        toNum(d?.min_vram_gb) ??
        null;

      const latencyS =
        toNum(d?.base_latency_s) ??
        toNum(d?.first_token_latency_s) ??
        null;

      return {
        id: d?.model_id ?? "(unknown)",
        vram,
        latencyS,
      };
    });
  }, [details]);

  // simple min/max for a “bar” width
  const maxVram =
    data.reduce((m, r) => (r.vram != null ? Math.max(m, r.vram) : m), 0) || 1;

  return (
    <div className="bg-gray-800 p-4 rounded-lg min-h-[220px]">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold">Model Repository</h3>
        {loading && <span className="text-sm text-gray-300">Loading…</span>}
      </div>

      {!data.length ? (
        <div className="text-sm text-gray-300">No models to show.</div>
      ) : (
        <div className="space-y-2">
          {data.slice(0, 20).map((r) => (
            <div key={r.id}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="truncate pr-2">{r.id}</span>
                <span className="text-gray-300">
                  {r.vram != null ? `${fmt(r.vram)} GB` : "—"} VRAM
                  {r.latencyS != null ? ` • ${fmt(r.latencyS)} s` : ""}
                </span>
              </div>
              <div className="h-2 bg-gray-700 rounded">
                <div
                  className="h-2 bg-blue-500 rounded"
                  style={{
                    width:
                      r.vram != null
                        ? `${Math.max(4, (r.vram / maxVram) * 100)}%`
                        : "4%",
                  }}
                />
              </div>
            </div>
          ))}
          {data.length > 20 && (
            <div className="text-xs text-gray-400 mt-2">
              Showing 20 of {data.length} models…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- utils ---------------- */
function toNum(v) {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}
function fmt(n) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}