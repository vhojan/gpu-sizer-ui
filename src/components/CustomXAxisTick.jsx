// Reusable for both charts!
export default function CustomXAxisTick({ x, y, payload }) {
    const text = payload.value;
    const wrapText = (txt, maxLen = 10) => {
      const words = txt.split(" ");
      let lines = [], curr = "";
      words.forEach(word => {
        if ((curr + " " + word).trim().length > maxLen) {
          if (curr) lines.push(curr);
          curr = word;
        } else curr = (curr + " " + word).trim();
      });
      if (curr) lines.push(curr);
      return lines;
    };
    const lines = wrapText(text, 10);
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={16} textAnchor="end" fill="#ccc" fontSize={12} transform="rotate(-35)">
          {lines.map((line, i) => (
            <tspan key={i} x={0} dy={i === 0 ? 0 : 14}>{line}</tspan>
          ))}
        </text>
      </g>
    );
  }