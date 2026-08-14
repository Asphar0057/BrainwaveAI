import { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import './GraphRenderer.css';

const MERMAID_LANGS = new Set(['mermaid', 'diagram', 'mindmap']);
const GRAPH_JSON_LANGS = new Set(['graphjson', 'chartjson', 'datachart']);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const GRAPH_TYPE_MAP = {
  regression: 'line',
  trend: 'line',
  trendline: 'line',
  timeseries: 'line',
  'time-series': 'line',
  column: 'bar',
  histogram: 'bar',
  dot: 'scatter',
  dotplot: 'scatter',
  bubblechart: 'bubble',
  piechart: 'pie',
  doughnut: 'donut',
};

const normalizeGraphType = (rawType = 'line') => {
  const normalized = String(rawType || 'line').toLowerCase().trim();
  const mapped = GRAPH_TYPE_MAP[normalized] || normalized;
  const allowed = new Set(['line', 'bar', 'area', 'scatter', 'bubble', 'pie', 'donut']);
  return allowed.has(mapped) ? mapped : 'line';
};

export const isGraphLanguage = (language = '') => {
  const lang = String(language || '').trim().toLowerCase();
  return MERMAID_LANGS.has(lang) || GRAPH_JSON_LANGS.has(lang);
};

const LIKELY_MERMAID_STARTS = [
  'graph ',
  'flowchart ',
  'sequencediagram',
  'classdiagram',
  'statediagram',
  'erdiagram',
  'journey',
  'gantt',
  'pie',
  'mindmap',
  'timeline',
  'gitgraph',
  'quadrantchart',
  'xychart-beta',
  'sankey-beta',
  'requirementdiagram',
  'c4context',
  'c4container',
  'c4component',
  'c4dynamic',
  'c4deployment',
];

const looksLikeMermaid = (content = '') => {
  const trimmed = String(content || '').trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (LIKELY_MERMAID_STARTS.some((prefix) => lower.startsWith(prefix))) return true;
  return /-->|==>|-.->|:::|subgraph\b|end\b/i.test(trimmed);
};

const normalizePoint = (point, index) => {
  if (Array.isArray(point)) {
    return { x: point[0] ?? index + 1, y: Number(point[1]), r: Number(point[2]) };
  }
  if (typeof point === 'number') {
    return { x: index + 1, y: Number(point), r: Number.NaN };
  }
  if (point && typeof point === 'object') {
    return {
      x: point.x ?? point.label ?? index + 1,
      y: Number(point.y ?? point.value),
      r: Number(point.r ?? point.radius ?? point.size ?? point.z),
    };
  }
  return { x: index + 1, y: Number.NaN, r: Number.NaN };
};

const normalizeSeries = (series = [], fallbackName = 'Series') =>
  (Array.isArray(series) ? series : [])
    .map((entry, index) => {
      const base = entry && typeof entry === 'object' ? entry : {};
      const rawPoints = Array.isArray(base.points)
        ? base.points
        : Array.isArray(base.data)
          ? base.data
          : [];
      const points = rawPoints
        .map((point, i) => normalizePoint(point, i))
        .filter((point) => Number.isFinite(point.y));
      if (!points.length) return null;
      return {
        name: base.name || `${fallbackName} ${index + 1}`,
        color: base.color || ['#3b82f6', '#f97316', '#22c55e', '#a855f7'][index % 4],
        points,
      };
    })
    .filter(Boolean);

const parseGraphJson = (source = '') => {
  try {
    const parsed = JSON.parse(source);
    const type = normalizeGraphType(parsed?.type || parsed?.chartType || 'line');
    const series = normalizeSeries(parsed?.series, parsed?.title || 'Series');
    if (!series.length) return null;
    return {
      type,
      title: parsed?.title || 'Graph',
      subtitle: parsed?.subtitle || '',
      xLabel: parsed?.xLabel || parsed?.x_axis || 'X',
      yLabel: parsed?.yLabel || parsed?.y_axis || 'Y',
      series,
    };
  } catch {
    return null;
  }
};

const looksLikeGraphJson = (content = '') => Boolean(parseGraphJson(content));

const repairMermaidSyntax = (source = '') => {
  let fixed = String(source || '').trim();
  if (!fixed) return fixed;

  
  fixed = fixed.replace(/\|([^|\n]+)\|\s*>\s*/g, '|$1| ');

  
  fixed = fixed.replace(/->\s*\|/g, '-->|');

  
  fixed = fixed.replace(/-{3,}>\s*/g, '--> ');
  fixed = fixed.replace(/={3,}>\s*/g, '==> ');

  
  fixed = fixed.replace(/-&gt;/g, '->').replace(/--&gt;/g, '-->');

  
  
  const lines = fixed.split('\n');
  let fallbackCounter = 1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/(-->|==>|-.->)\|[^|\n]+\|\s*$/.test(line)) continue;

    let inferredTarget = '';
    for (let j = i + 1; j < lines.length; j += 1) {
      const probe = lines[j].trim();
      if (!probe) continue;
      if (/^(graph|flowchart|subgraph|end)\b/i.test(probe)) continue;
      const match = probe.match(/^([A-Za-z][A-Za-z0-9_]*)\b/);
      if (match?.[1]) {
        inferredTarget = match[1];
      }
      break;
    }

    if (!inferredTarget) {
      inferredTarget = `AUTO_NODE_${fallbackCounter}`;
      fallbackCounter += 1;
      lines.splice(i + 1, 0, `${inferredTarget}[Auto target]`);
    }

    lines[i] = `${line} ${inferredTarget}`;
  }

  fixed = lines.join('\n');

  return fixed;
};

const isMermaidErrorSvg = (svg = '') => {
  const raw = String(svg || '');
  if (!raw) return true;
  return /class=["']error-text["']|syntax error in text|parse error|lexical error|mermaid version/i.test(raw);
};

export const detectGraphLanguage = (language = '', content = '') => {
  const lang = String(language || '').trim().toLowerCase();
  if (isGraphLanguage(lang)) return lang;

  if (looksLikeMermaid(content)) return 'mermaid';
  if (looksLikeGraphJson(content)) return 'graphjson';
  return null;
};

const MermaidGraph = ({ source, compact = false }) => {
  const containerRef = useRef(null);
  const [mermaidApi, setMermaidApi] = useState(null);
  const [renderError, setRenderError] = useState('');
  const [isRendering, setIsRendering] = useState(true);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let mounted = true;
    import('mermaid')
      .then((m) => {
        if (!mounted) return;
        setMermaidApi(m.default);
      })
      .catch(() => {
        if (mounted) setRenderError('Graph engine failed to load.');
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!mermaidApi || !containerRef.current || !source?.trim()) return undefined;

    let cancelled = false;
    const themeMode = document.documentElement.getAttribute('data-theme-mode');
    mermaidApi.initialize({
      startOnLoad: false,
      theme: themeMode === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose',
    });

    const render = async () => {
      try {
        document
          .querySelectorAll('body > [id^="chat_graph_"], body > [id^="dchat_graph_"]')
          .forEach((node) => node.remove());
        setIsRendering(true);
        setRenderError('');
        setZoom(1);
        containerRef.current.innerHTML = '';
        const sanitizeSvg = (svg) => DOMPurify.sanitize(svg, {
          USE_PROFILES: { html: true, svg: true, svgFilters: true },
          FORBID_TAGS: ['script', 'foreignObject'],
        });

        const renderAttempt = async (attemptSource) => {
          const id = `chat_graph_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
          try {
            return await mermaidApi.render(id, attemptSource);
          } finally {
            // Mermaid can leave an off-screen error SVG attached to <body> after
            // a rejected render. Besides leaking DOM, screen readers announce
            // its raw "Syntax error" text long after the chat has moved on.
            document.getElementById(id)?.remove();
            document.getElementById(`d${id}`)?.remove();
          }
        };

        try {
          const { svg } = await renderAttempt(source);
          if (isMermaidErrorSvg(svg)) {
            throw new Error('Invalid Mermaid syntax.');
          }
          if (cancelled) return;
          containerRef.current.innerHTML = sanitizeSvg(svg);
        } catch {
          const repaired = repairMermaidSyntax(source);
          const { svg } = await renderAttempt(repaired);
          if (isMermaidErrorSvg(svg)) {
            throw new Error('Invalid Mermaid syntax.');
          }
          if (cancelled) return;
          containerRef.current.innerHTML = sanitizeSvg(svg);
        }
      } catch (error) {
        if (!cancelled) {
          const errText = error?.message || 'Invalid Mermaid syntax.';
          setRenderError(`${errText} Try using "A -->|label| B" arrow format.`);
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [mermaidApi, source]);

  return (
    <div className={`agr-card ${compact ? 'agr-compact' : ''}`}>
      <div className="agr-header">
        <span className="agr-tag">Interactive Graph</span>
        <div className="agr-actions">
          <button type="button" onClick={() => setZoom((z) => clamp(Number((z - 0.1).toFixed(2)), 0.6, 2.4))}>-</button>
          <button type="button" onClick={() => setZoom(1)}>Reset</button>
          <button type="button" onClick={() => setZoom((z) => clamp(Number((z + 0.1).toFixed(2)), 0.6, 2.4))}>+</button>
        </div>
      </div>
      <div className="agr-canvas">
        {renderError ? (
          <div className="agr-error">{renderError}</div>
        ) : isRendering ? (
          <div className="agr-empty">Rendering graph...</div>
        ) : null}
        <div className="agr-svg-scroll">
          <div
            ref={containerRef}
            className="agr-svg"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          />
        </div>
      </div>
    </div>
  );
};

const DataGraph = ({ source, compact = false }) => {
  const graph = useMemo(() => parseGraphJson(source), [source]);
  const [hovered, setHovered] = useState(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setZoom(1);
    setHovered(null);
  }, [source]);

  if (!graph) {
    return (
      <div className={`agr-card ${compact ? 'agr-compact' : ''}`}>
        <div className="agr-error">
          Invalid `graphjson` block. Use JSON with `type` and `series` arrays.
        </div>
      </div>
    );
  }

  const width = 760;
  const height = 360;
  const margin = { top: 28, right: 24, bottom: 52, left: 56 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const allY = graph.series.flatMap((series) => series.points.map((p) => p.y));
  const minYBase = Math.min(...allY);
  const maxYBase = Math.max(...allY);
  const yPad = Math.max((maxYBase - minYBase) * 0.1, 1);
  const minY = minYBase - yPad;
  const maxY = maxYBase + yPad;

  const allX = graph.series.flatMap((series) => series.points.map((p) => p.x));
  const numericXValues = allX.map((x) => Number(x));
  const usesNumericX = numericXValues.length > 0 && numericXValues.every((x) => Number.isFinite(x));

  const categories = usesNumericX
    ? []
    : Array.from(new Set(graph.series.flatMap((s) => s.points.map((p) => String(p.x)))));
  const xIndex = new Map(categories.map((value, index) => [value, index]));

  const minX = usesNumericX ? Math.min(...numericXValues) : 0;
  const maxX = usesNumericX ? Math.max(...numericXValues) : Math.max(categories.length - 1, 1);
  const numericSpan = Math.max(maxX - minX, 1);
  const xStep = categories.length > 1 ? plotWidth / (categories.length - 1) : plotWidth;

  const getX = (xValue) => {
    if (usesNumericX) {
      const n = Number(xValue);
      return margin.left + ((n - minX) / numericSpan) * plotWidth;
    }
    const index = xIndex.get(String(xValue)) ?? 0;
    if (graph.type === 'bar') {
      const slot = plotWidth / Math.max(categories.length, 1);
      return margin.left + slot * index + slot / 2;
    }
    return margin.left + xStep * index;
  };

  const getY = (yValue) => margin.top + ((maxY - yValue) / (maxY - minY || 1)) * plotHeight;
  const ticks = 5;
  const tickValues = Array.from({ length: ticks + 1 }, (_, index) => minY + ((maxY - minY) * index) / ticks);

  if (graph.type === 'pie' || graph.type === 'donut') {
    const piePoints = graph.series.flatMap((series) => (
      series.points.map((point) => ({
        label: graph.series.length > 1 ? `${series.name}: ${point.x}` : String(point.x),
        value: Math.abs(point.y),
        color: series.color,
      }))
    ));
    const total = piePoints.reduce((sum, point) => sum + point.value, 0);
    if (!total) {
      return (
        <div className={`agr-card ${compact ? 'agr-compact' : ''}`}>
          <div className="agr-error">Pie/Donut charts need non-zero values.</div>
        </div>
      );
    }

    const cx = width / 2;
    const cy = height / 2;
    const outerRadius = Math.min(plotWidth, plotHeight) * 0.36;
    const innerRadius = graph.type === 'donut' ? outerRadius * 0.56 : 0;
    let startAngle = -90;

    const polarPoint = (radius, angleDeg) => {
      const rad = (angleDeg * Math.PI) / 180;
      return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
    };

    const slicePath = (start, end) => {
      const largeArcFlag = end - start > 180 ? 1 : 0;
      const p1 = polarPoint(outerRadius, start);
      const p2 = polarPoint(outerRadius, end);
      if (!innerRadius) {
        return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${p2.x} ${p2.y} Z`;
      }
      const p3 = polarPoint(innerRadius, end);
      const p4 = polarPoint(innerRadius, start);
      return `M ${p1.x} ${p1.y} A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${p4.x} ${p4.y} Z`;
    };

    return (
      <div className={`agr-card ${compact ? 'agr-compact' : ''}`}>
        <div className="agr-header">
          <span className="agr-tag">Interactive Graph</span>
          <div className="agr-actions">
            <button type="button" onClick={() => setZoom((z) => clamp(Number((z - 0.1).toFixed(2)), 0.6, 2.4))}>-</button>
            <button type="button" onClick={() => setZoom(1)}>Reset</button>
            <button type="button" onClick={() => setZoom((z) => clamp(Number((z + 0.1).toFixed(2)), 0.6, 2.4))}>+</button>
          </div>
        </div>
        <div className="agr-title-wrap">
          <strong>{graph.title}</strong>
          {graph.subtitle ? <span>{graph.subtitle}</span> : null}
        </div>
        <div className="agr-canvas">
          <div className="agr-svg-scroll">
            <svg
              className="agr-data-svg"
              viewBox={`0 0 ${width} ${height}`}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
            >
              {piePoints.map((slice, index) => {
                const angle = (slice.value / total) * 360;
                const endAngle = startAngle + angle;
                const path = slicePath(startAngle, endAngle);
                startAngle = endAngle;
                return (
                  <path
                    key={`${slice.label}_${index}`}
                    d={path}
                    fill={slice.color}
                    opacity="0.9"
                    stroke="var(--panel)"
                    strokeWidth="1.6"
                    onMouseEnter={() => setHovered({ series: slice.label, x: 'share', y: `${((slice.value / total) * 100).toFixed(1)}%` })}
                    onMouseLeave={() => setHovered(null)}
                  />
                );
              })}
            </svg>
          </div>
        </div>
        <div className="agr-meta">
          <div className="agr-legend">
            {piePoints.map((slice, index) => (
              <span key={`legend_${slice.label}_${index}`}>
                <i style={{ background: slice.color }} />
                {slice.label}
              </span>
            ))}
          </div>
          <div className="agr-readout">
            {hovered ? `${hovered.series}: ${hovered.y}` : 'Hover a slice to inspect percentage'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`agr-card ${compact ? 'agr-compact' : ''}`}>
      <div className="agr-header">
        <span className="agr-tag">Interactive Graph</span>
        <div className="agr-actions">
          <button type="button" onClick={() => setZoom((z) => clamp(Number((z - 0.1).toFixed(2)), 0.6, 2.4))}>-</button>
          <button type="button" onClick={() => setZoom(1)}>Reset</button>
          <button type="button" onClick={() => setZoom((z) => clamp(Number((z + 0.1).toFixed(2)), 0.6, 2.4))}>+</button>
        </div>
      </div>

      <div className="agr-title-wrap">
        <strong>{graph.title}</strong>
        {graph.subtitle ? <span>{graph.subtitle}</span> : null}
      </div>

      <div className="agr-canvas">
        <div className="agr-svg-scroll">
          <svg
            className="agr-data-svg"
            viewBox={`0 0 ${width} ${height}`}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          >
            {tickValues.map((value) => {
              const y = getY(value);
              return (
                <g key={`grid_${value}`}>
                  <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} className="agr-grid-line" />
                  <text x={margin.left - 8} y={y + 4} className="agr-axis-label agr-axis-number">
                    {Number(value.toFixed(2))}
                  </text>
                </g>
              );
            })}

            <line x1={margin.left} y1={margin.top + plotHeight} x2={width - margin.right} y2={margin.top + plotHeight} className="agr-axis-line" />
            <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + plotHeight} className="agr-axis-line" />

            {usesNumericX
              ? Array.from({ length: 6 }, (_, index) => minX + (numericSpan * index) / 5).map((tick) => (
                <text
                  key={`x_tick_${tick}`}
                  x={getX(tick)}
                  y={height - 20}
                  textAnchor="middle"
                  className="agr-axis-label"
                >
                  {Number.isInteger(tick) ? tick : Number(tick.toFixed(2))}
                </text>
              ))
              : categories.map((label) => (
                <text
                  key={`x_${label}`}
                  x={getX(label)}
                  y={height - 20}
                  textAnchor="middle"
                  className="agr-axis-label"
                >
                  {label}
                </text>
              ))}

            {graph.type === 'bar' ? graph.series.map((series, seriesIndex) => {
              const slotWidth = plotWidth / Math.max(categories.length, 1);
              const barGroupWidth = slotWidth * 0.72;
              const barWidth = barGroupWidth / Math.max(graph.series.length, 1);
              return series.points.map((point) => {
                const xCenter = getX(point.x);
                const x = xCenter - barGroupWidth / 2 + barWidth * seriesIndex;
                const y = getY(point.y);
                const h = margin.top + plotHeight - y;
                return (
                  <rect
                    key={`${series.name}_${point.x}`}
                    x={x}
                    y={y}
                    width={Math.max(barWidth - 3, 2)}
                    height={Math.max(h, 1)}
                    fill={series.color}
                    opacity="0.85"
                    rx="3"
                    onMouseEnter={() => setHovered({ series: series.name, x: point.x, y: point.y })}
                    onMouseLeave={() => setHovered(null)}
                  />
                );
              });
            }) : graph.type === 'scatter' || graph.type === 'bubble' ? graph.series.map((series) => (
              <g key={series.name}>
                {series.points.map((point) => (
                  <circle
                    key={`${series.name}_${point.x}`}
                    cx={getX(point.x)}
                    cy={getY(point.y)}
                    r={graph.type === 'bubble' && Number.isFinite(point.r) ? clamp(Number(point.r), 3, 16) : 5.2}
                    fill={series.color}
                    opacity="0.9"
                    stroke="var(--panel)"
                    strokeWidth="1.5"
                    onMouseEnter={() => setHovered({ series: series.name, x: point.x, y: point.y })}
                    onMouseLeave={() => setHovered(null)}
                  />
                ))}
              </g>
            )) : graph.series.map((series) => {
              const sortedPoints = usesNumericX
                ? [...series.points].sort((a, b) => Number(a.x) - Number(b.x))
                : series.points;
              const pathD = sortedPoints
                .map((point, index) => `${index === 0 ? 'M' : 'L'} ${getX(point.x)} ${getY(point.y)}`)
                .join(' ');
              const areaD = `${pathD} L ${getX(sortedPoints[sortedPoints.length - 1].x)} ${margin.top + plotHeight} L ${getX(sortedPoints[0].x)} ${margin.top + plotHeight} Z`;
              return (
                <g key={series.name}>
                  {graph.type === 'area' ? (
                    <path d={areaD} fill={series.color} opacity="0.18" />
                  ) : null}
                  <path d={pathD} stroke={series.color} strokeWidth="2.4" fill="none" />
                  {sortedPoints.map((point) => (
                    <circle
                      key={`${series.name}_${point.x}`}
                      cx={getX(point.x)}
                      cy={getY(point.y)}
                      r="4.8"
                      fill={series.color}
                      stroke="var(--panel)"
                      strokeWidth="1.5"
                      onMouseEnter={() => setHovered({ series: series.name, x: point.x, y: point.y })}
                      onMouseLeave={() => setHovered(null)}
                    />
                  ))}
                </g>
              );
            })}

            <text x={width / 2} y={height - 2} textAnchor="middle" className="agr-axis-label agr-axis-title">
              {graph.xLabel}
            </text>
            <text
              x="12"
              y={height / 2}
              textAnchor="middle"
              transform={`rotate(-90 12 ${height / 2})`}
              className="agr-axis-label agr-axis-title"
            >
              {graph.yLabel}
            </text>
          </svg>
        </div>
      </div>

      <div className="agr-meta">
        <div className="agr-legend">
          {graph.series.map((series) => (
            <span key={`legend_${series.name}`}>
              <i style={{ background: series.color }} />
              {series.name}
            </span>
          ))}
        </div>
        <div className="agr-readout">
          {hovered ? `${hovered.series}: ${hovered.x} -> ${hovered.y}` : 'Hover a point/bar to inspect values'}
        </div>
      </div>
    </div>
  );
};

const GraphRenderer = ({ language = 'mermaid', content = '', compact = false }) => {
  const lang = String(language || '').toLowerCase().trim();
  if (GRAPH_JSON_LANGS.has(lang)) {
    return <DataGraph source={content} compact={compact} />;
  }
  return <MermaidGraph source={content} compact={compact} />;
};

export default GraphRenderer;
