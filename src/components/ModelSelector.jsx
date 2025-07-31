import React, { useState } from "react";

export default function ModelSelector({ value, onSelect }) {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState([]);
  const [dropdown, setDropdown] = useState(false);
  const [loading, setLoading] = useState(false);

  // Search as you type
  const searchModels = async (q) => {
    setLoading(true);
    setDropdown(true);
    try {
      const res = await fetch(
        `https://gpu-sizer-api-bqb6bnc8e0c8hfgm.northeurope-01.azurewebsites.net/models/search?q=${encodeURIComponent(q)}`
      );
      const list = await res.json();
      setResults(list);
    } catch {
      setResults([]);
    }
    setLoading(false);
  };

  return (
    <div className="relative">
      <input
        type="text"
        className="block w-full p-2 border rounded bg-white dark:bg-gray-800"
        placeholder="Search or paste model name…"
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          if (e.target.value.length > 1) searchModels(e.target.value);
          else setDropdown(false);
        }}
        onFocus={() => { if (query.length > 1) setDropdown(true); }}
      />
      {dropdown && results.length > 0 && (
        <ul className="absolute z-10 w-full bg-white dark:bg-gray-800 border rounded mt-1 max-h-48 overflow-auto shadow-lg">
          {results.map(r => {
            const label = typeof r === "string" ? r : r.label || r.value || r.model_id || r.id;
            const value = typeof r === "string" ? r : r.value || r.model_id || r.id;
            return (
              <li
                key={value}
                className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer"
                onClick={() => {
                  setQuery(label);
                  setDropdown(false);
                  if (onSelect) onSelect(value);
                }}
              >
                {label}
              </li>
            );
          })}
        </ul>
      )}
      {dropdown && loading && (
        <div className="absolute z-10 left-0 mt-1 p-2 text-xs text-gray-400">Loading…</div>
      )}
    </div>
  );
}