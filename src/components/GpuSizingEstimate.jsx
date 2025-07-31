export default function GpuSizingEstimate({
    error, model, rec, gpus, modelDetails,
    totalTokensPerSecond, getTokensPerSec, findNvlinkSolution, swapAlt
  }) {
    return (
      <>
        <h2 className="text-2xl font-semibold mb-4 mt-8">GPU Sizing Estimate</h2>
        <div className="bg-white dark:bg-gray-800 p-4 rounded shadow">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
                        gpus, modelDetails, totalTokensPerSecond
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
            {/* Alternatives */}
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
                            (Does not meet context length requirement)
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
          {rec && rec.reasoning && (
            <>
              <h3 className="mt-6 font-medium">Reasoning</h3>
              <pre className="bg-gray-100 dark:bg-gray-700 p-2 rounded text-sm">
                {rec.reasoning}
              </pre>
            </>
          )}
        </div>
      </>
    );
  }