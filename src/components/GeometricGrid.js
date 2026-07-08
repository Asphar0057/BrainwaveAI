export default function GeometricGrid({
  className = 'cb-bg-geo',
  linesClassName = 'cb-bg-geo-lines',
  numsClassName = 'cb-bg-geo-nums',
}) {
  const W = 1600, H = 1000, STEP = 80;
  const lines = [];
  const nums = [];
  let lineKey = 0;
  for (let x = 0; x <= W; x += STEP) {
    lines.push(<line key={`v${lineKey++}`} x1={x} y1={0} x2={x} y2={H} />);
  }
  for (let y = 0; y <= H; y += STEP) {
    lines.push(<line key={`h${lineKey++}`} x1={0} y1={y} x2={W} y2={y} />);
  }
  let n = 1;
  for (let r = 0; r <= H; r += STEP * 3) {
    for (let c = 0; c <= W; c += STEP * 3) {
      nums.push(<text key={`n${c}${r}`} x={c + 3} y={r + 11}>{String(n++ % 99 + 1).padStart(2, '0')}</text>);
    }
  }
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g className={linesClassName}>{lines}</g>
      <g className={numsClassName}>{nums}</g>
    </svg>
  );
}
