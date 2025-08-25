import React, { useMemo } from "react";

/* ---------------- helpers ---------------- */
function toNum(v, d = 0) {
  if (v == null) return d;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : d;
}
function pretty(n, digits = 1) {
  return toNum(n).toLocaleString(undefined, { maximumFractionDigits: digits });
}
function prettyTokens(n, digits = 1) {
  return `${pretty(n, digits)} Tokens/s`;
}
function getTokensPerSec(obj) {
  return obj?.["Tokens/s"] ?? obj?.tokens_per_second ?? obj?.tokensPerSecond ?? null;
}

/** Pull common fields and all the NVLink knobs from a GPU row. */
function normalizeGpu(raw) {
  if (!raw) return null;
  const vram = toNum(raw["VRAM (GB)"]) || toNum(raw.vram) || toNum(raw.vramGB) || 0;
  const tps  = toNum(getTokensPerSec(raw), 0);
  const name = raw["GPU Type"] || raw.name || raw.id || "Unknown GPU";

  // NVLink capability flag
  const nvlink = raw.NVLink === true || raw.nvlink === true;

  // NVLink max group size (support a bunch of possible column names)
  const nvMax =
    toNum(raw["NVLink Max"]) ||
    toNum(raw["NVLink Max GPUs"]) ||
    toNum(raw["NVLink GPUs"]) ||
    toNum(raw["Max NVLink"]) ||
    toNum(raw["Max NVLink GPUs"]) ||
    toNum(raw.nvlink_max) ||
    toNum(raw.nvlinkMax) ||
    0; // default 0 => no multi-GPU unless explicitly provided

  return { ...raw, __name: name, __vram: vram, __tps: tps, __nv: nvlink, __nvMax: nvMax };
}

function meetsSingleGpu(g, reqVram, reqTps) {
  return g.__vram >= reqVram && g.__tps >= reqTps;
}

/**
 * Build an NVLink plan respecting each GPU’s max NVLink group size.
 * - memory pools across GPUs
 * - throughput scales linearly (approx)
 * - count must be >= 2 and <= gpu.__nvMax
 */
function nvlinkPlan(gpu, reqVram, reqTps) {
  if (!gpu.__nv) return null;
  if (gpu.__nvMax < 2) return null;                 // cannot form a multi‑GPU group
  if (gpu.__tps <= 0 || gpu.__vram <= 0) return null;

  const needByVram = Math.ceil(reqVram / gpu.__vram);
  const needByTps  = Math.ceil(reqTps  / gpu.__tps);
  const count = Math.max(needByVram, needByTps, 2); // multi‑GPU ⇒ at least 2

  if (count > gpu.__nvMax) return null;             // exceeds supported group size

  const totalVram = count * gpu.__vram;
  const totalTps  = count * gpu.__tps;

  if (totalVram < reqVram || totalTps < reqTps) return null;

  return { gpu, count, totalVram, totalTps };
}

/* ---------------- component ---------------- */
export default function GpuSizingEstimate({
  error,
  model,
  rec,
  gpus = [],
  modelDetails,
  totalTokensPerSecond = 0,
}) {
  const requiredVram = useMemo(() => {
    return (
      toNum(modelDetails?.minimal_gpu_memory_gb, null) ??
      toNum(modelDetails?.base_vram_gb, null) ??
      toNum(modelDetails?.min_vram_gb, null) ??
      0
    );
  }, [modelDetails]);

  const reqTps = Math.max(0, toNum(totalTokensPerSecond, 0));
  const normalized = useMemo(() => gpus.map(normalizeGpu).filter(Boolean), [gpus]);

  // Single‑GPU candidates must meet BOTH VRAM and TPS.
  const singleCandidates = useMemo(() => {
    return normalized
      .filter((g) => meetsSingleGpu(g, requiredVram, reqTps))
      .sort((a, b) => {
        if (a.__vram !== b.__vram) return a.__vram - b.__vram;             // smallest VRAM first
        const aOver = a.__tps - reqTps, bOver = b.__tps - reqTps;
        return aOver - bOver;                                             // then minimal TPS over‑provision
      });
  }, [normalized, requiredVram, reqTps]);

  // NVLink / Multi‑GPU: only NVLink‑capable AND respect per‑GPU NVLink max size.
  const nvlinkCandidates = useMemo(() => {
    const plans = [];
    for (const g of normalized) {
      const p = nvlinkPlan(g, requiredVram, reqTps);
      if (p && p.count >= 2) plans.push(p);                               // multi only
    }
    return plans.sort((a, b) => {
      if (a.count !== b.count) return a.count - b.count;                  // fewest GPUs
      if (a.totalVram !== b.totalVram) return a.totalVram - b.totalVram;  // then smallest pooled VRAM
      return b.totalTps - a.totalTps;                                     // then highest TPS
    });
  }, [normalized, requiredVram, reqTps]);

  // Pick a recommendation: single first; else best NVLink; else none.
  const chosen = useMemo(() => {
    if (singleCandidates.length > 0) {
      const g = singleCandidates[0];
      return { type: "single", name: g.__name, vram: g.__vram, tokens: g.__tps, count: 1 };
    }
    if (nvlinkCandidates.length > 0) {
      const p = nvlinkCandidates[0];
      return {
        type: "nvlink",
        name: p.gpu.__name,
        vram: p.gpu.__vram,
        tokens: p.gpu.__tps,
        count: p.count,
        totalVram: p.totalVram,
        totalTokens: p.totalTps,
      };
    }
    return null;
  }, [singleCandidates, nvlinkCandidates]);

  /* ---- UI bits ---- */
  const SingleAlt = ({ g }) => (
    <li className="mb-1">
      <span className="text-gray-100">{g.__name}</span>
      {" — "}
      <span>{prettyTokens(g.__tps)}</span>
      {" • "}
      <span>{pretty(g.__vram)} GB</span>
    </li>
  );

  const NvlinkAlt = ({ p }) => (
    <li className="mb-1">
      <span className="text-gray-100">{p.gpu.__name} × {p.count}</span>
      {" — total "}
      <span>{prettyTokens(p.totalTps)}</span>
      {" • "}
      <span>{pretty(p.totalVram)} GB</span>
    </li>
  );

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">GPU Sizing Estimate</h3>

      {error && (
        <div className="p-3 rounded bg-red-900/40 text-red-200">
          {String(error)}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recommendation */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h4 className="font-semibold mb-3">Recommendation</h4>

          {!chosen ? (
            <div className="text-gray-300">
              No single‑GPU or NVLink configuration meets{" "}
              <strong>{pretty(requiredVram)} GB</strong> and{" "}
              <strong>{prettyTokens(reqTps)}</strong>.
            </div>
          ) : (
            <div className="text-gray-200">
              <div className="mb-1">
                <span className="font-semibold">GPU{chosen.count > 1 ? " (NVLink)" : ""}:</span>{" "}
                {chosen.name}
              </div>
              <div>
                <span className="font-semibold">Qty (NVLink):</span> {chosen.count}
              </div>
              <div>
                <span className="font-semibold">Total VRAM:</span>{" "}
                {chosen.count > 1 ? `${pretty(chosen.totalVram)} GB` : `${pretty(chosen.vram)} GB`}
              </div>
              <div>
                <span className="font-semibold">Tokens/s:</span>{" "}
                {chosen.count > 1 ? prettyTokens(chosen.totalTokens) : prettyTokens(chosen.tokens)}
              </div>
            </div>
          )}

          <div className="mt-3 text-xs text-gray-400">
            Chosen from GPUs that satisfy{" "}
            <strong>{pretty(requiredVram)} GB</strong> VRAM and{" "}
            <strong>{prettyTokens(reqTps)}</strong>.  
            Single‑GPU is preferred when available; otherwise the smallest valid NVLink group is used.
          </div>
        </div>

        {/* Alternatives */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h4 className="font-semibold mb-3">Alternatives</h4>

          {/* Single‑GPU */}
          <div className="mb-3">
            <div className="text-gray-400 text-sm mb-1">Single‑GPU</div>
            {singleCandidates.length === 0 ? (
              <div className="text-gray-300 text-sm">No single‑GPU meets the requirements.</div>
            ) : (
              <ul className="list-disc list-inside">
                {singleCandidates.map((g) => (
                  <SingleAlt key={`single-${g.__name}`} g={g} />
                ))}
              </ul>
            )}
          </div>

          {/* NVLink / Multi‑GPU */}
          <div className="mt-4">
            <div className="text-gray-400 text-sm mb-1">NVLink / Multi‑GPU</div>
            {nvlinkCandidates.length === 0 ? (
              <div className="text-gray-300 text-sm">No valid NVLink configurations.</div>
            ) : (
              <ul className="list-disc list-inside">
                {nvlinkCandidates.map((p) => (
                  <NvlinkAlt key={`nv-${p.gpu.__name}-${p.count}`} p={p} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}