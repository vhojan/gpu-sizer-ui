import React, { useEffect, useMemo, useState } from "react";

/**
 * ModelsTable
 * - Accepts `models` as IDs or objects
 * - Hydrates IDs into details via `apiBase`
 * - Renders a resilient table with Model, VRAM, and Latency
 */
export default function ModelsTable({ models, apiBase }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const { ids, preResolved } = useMemo(() => {
    if (!Array.isArray(models)) return { ids: [], preResolved: [] };
    const stringIds = models.filter((m) => typeof m === "string");
    const objects = models.filter((m) => m && typeof m === "object");
    const uniqueIds = [...new Set(stringIds)];
    return { ids: uniqueIds, preResolved: objects };
  }, [models]);

  useEffect(() => {
    let cancelled = false;
    const seed = normalize(preResolved);
    setRows(seed);

    if (!ids.length) return;

    const fetchOne = async (id) => {
      try {
        const r = await fetch(`${apiBase}/models/${encodeURIComponent(id)}`);
        if (!r.ok) throw new Error("bad status");
        return await r.json();
      } catch {
        return { model_id: id };
      }
    };

    (async () => {
      setLoading(true);
      const pool = 8;
      const queue = [...ids];
      const out = [...seed];

      const runners = new Array(pool).fill(0).map(async () => {
        while (queue.length && !cancelled) {
          const id = queue.shift();
          const d = await fetchOne(id);
          if (cancelled) return;
          out.push(...normalize([d]));
          setRows([...out]); // progressive
        }
      });

      await Promise.all(runners);
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [ids, preResolved, apiBase]);

  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold">Models</h4>
        {loading && <span className="text-sm text-gray-300">Loading…</span>}
      </div>

      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-gray-300">
            <tr>
              <th className="py-2 pr-4">Model</th>
              <th className="py-2 pr-4">VRAM (GB)</th>
              <th className="py-2 pr-4">Latency (s)</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-6 text-gray-300">
                  No data.
                </td>
              </tr>
            ) : (
              rows.slice(0, 100).map((r) => (
                <tr key={r.id} className="border-t border-gray-700">
                  <td className="py-2 pr-4">{r.id}</td>
                  <td className="py-2 pr-4">{r.vram ?? "—"}</td>
                  <td className="py-2 pr-4">{r.latency ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {rows.length > 100 && (
          <div className="text-xs text-gray-400 mt-2">
            Showing 100 of {rows.length} models…
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------- helpers ----------- */
function normalize(objs) {
  return (objs || []).map((d) => {
    const vram =
      num(d?.minimal_gpu_memory_gb) ??
      num(d?.base_vram_gb) ??
      num(d?.min_vram_gb) ??
      null;

    const latency =
      num(d?.base_latency_s) ??
      num(d?.first_token_latency_s) ??
      null;

    return {
      id: d?.model_id ?? "(unknown)",
      vram: vram != null
        ? Number(vram).toLocaleString(undefined, { maximumFractionDigits: 2 })
        : null,
      latency: latency != null
        ? Number(latency).toLocaleString(undefined, { maximumFractionDigits: 3 })
        : null,
    };
  });
}
function num(v) {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}