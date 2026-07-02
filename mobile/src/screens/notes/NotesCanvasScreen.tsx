import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  Alert,
  LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Canvas as SkiaCanvas,
  Circle as SkiaCircle,
  DashPathEffect,
  Group as SkiaGroup,
  Line as SkiaLine,
  Path as SkiaPath,
  RoundedRect as SkiaRoundedRect,
  vec,
} from '@shopify/react-native-skia';
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import HapticTouchable from '../../components/HapticTouchable';
import { NOTE_FONT_OPTIONS, normalizeNoteFont, resolveNoteFont } from '../../constants/noteFonts';
import { rgbaFromHex } from '../../utils/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import {
  buildNoteContentFromBlocks,
  type CanvasDrawElement,
  type CanvasElement,
  type CanvasLineElement,
  type CanvasPolygonKind,
  type CanvasPoint,
  type CanvasStrokePattern,
  createCanvasBlock,
  createCanvasPreviewDataUrl,
  distance,
  getClosedPathFromPoints,
  getDrawStylePaths,
  getPolygonPoints,
  getStrokeDashArray,
  getStrokeDashIntervals,
  parseCanvasElements,
  serializeCanvasElements,
  simplifyStrokePoints,
} from '../../utils/noteCanvas';
import { createNote } from '../../services/api';
import { useAppTheme } from '../../contexts/ThemeContext';
import type { NotesRootProps } from './NotesShared';

type ThemeColors = {
  bgPrimary: string;
  panel: string;
  panelAlt: string;
  accent: string;
  accentHover: string;
  borderStrong: string;
  textSecondary: string;
  danger: string;
  isLight: boolean;
};

type Props = NotesRootProps & {
  onBack: () => void;
  onSaved: (payload?: { canvasData: string; previewData: string }) => void;
  initialData?: string;
  mode?: 'note' | 'attachment';
};

type ToolMode =
  | 'select'
  | 'pencil'
  | 'pen'
  | 'fountain'
  | 'brush'
  | 'crayon'
  | 'marker'
  | 'highlighter'
  | 'charcoal'
  | 'calligraphy'
  | 'spray'
  | 'chalk'
  | 'eraser'
  | 'rectangle'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'triangle'
  | 'diamond'
  | 'star'
  | 'text'
  | 'sticky';

type DrawStyle = 'pen' | 'pencil' | 'fountain' | 'brush' | 'crayon' | 'marker' | 'highlighter' | 'charcoal' | 'calligraphy' | 'spray' | 'chalk';
type DrawToolMode = Extract<ToolMode, 'pencil' | 'pen' | 'fountain' | 'brush' | 'crayon' | 'marker' | 'highlighter' | 'charcoal' | 'calligraphy' | 'spray' | 'chalk'>;
type ShapeToolMode = Extract<ToolMode, 'rectangle' | 'circle' | 'line' | 'arrow' | 'triangle' | 'diamond' | 'star'>;
type BackgroundPattern = 'none' | 'dots' | 'lines' | 'graph';
type ActivePanel = 'style' | 'page' | null;
type EraserMode = 'all' | 'ink' | 'objects';

type DragState =
  | {
      mode: 'move';
      start: CanvasPoint;
      selectedId: string | number;
      originElement: CanvasElement;
    }
  | {
      mode: 'shape';
      start: CanvasPoint;
      tool: ShapeToolMode;
    }
  | {
      mode: 'erase';
    }
  | null;

const COLORS = [
  '#171717',
  '#475569',
  '#64748b',
  '#0f172a',
  '#334155',
  '#1e40af',
  '#1d4ed8',
  '#0284c7',
  '#0ea5e9',
  '#0f766e',
  '#15803d',
  '#22c55e',
  '#ca8a04',
  '#f59e0b',
  '#ea580c',
  '#dc2626',
  '#ef4444',
  '#9333ea',
  '#db2777',
] as const;

const STICKY_COLORS = ['#fff3a8', '#ffe1a8', '#ffd1bd', '#ffd8e6', '#eadbff', '#dbeafe', '#ccfbf1'] as const;
const STROKE_WIDTHS = [1, 2, 4, 6, 10, 16, 24];
const FONT_SIZES = [16, 20, 26, 34];
const FILL_COLORS = ['transparent', '#171717', '#475569', '#1d4ed8', '#0284c7', '#0f766e', '#22c55e', '#f59e0b', '#dc2626', '#9333ea'] as const;
const OPACITY_LEVELS = [0.2, 0.35, 0.5, 0.7, 0.9, 1] as const;
const STROKE_PATTERNS: CanvasStrokePattern[] = ['solid', 'dashed', 'dotted'];

const DRAW_PRESETS: Array<{ value: DrawToolMode; label: string; icon: ComponentProps<typeof Ionicons>['name'] }> = [
  { value: 'pencil', label: 'pencil', icon: 'pencil-outline' },
  { value: 'pen', label: 'pen', icon: 'create-outline' },
  { value: 'fountain', label: 'fountain', icon: 'color-fill-outline' },
  { value: 'brush', label: 'brush', icon: 'brush-outline' },
  { value: 'crayon', label: 'crayon', icon: 'color-palette-outline' },
  { value: 'marker', label: 'marker', icon: 'duplicate-outline' },
  { value: 'highlighter', label: 'highlight', icon: 'color-wand-outline' },
  { value: 'charcoal', label: 'charcoal', icon: 'flame-outline' },
  { value: 'calligraphy', label: 'calligraphy', icon: 'leaf-outline' },
  { value: 'spray', label: 'spray', icon: 'sparkles-outline' },
  { value: 'chalk', label: 'chalk', icon: 'apps-outline' },
];

const TOOLS: Array<{ value: ToolMode; label: string; icon: ComponentProps<typeof Ionicons>['name'] }> = [
  { value: 'select', label: 'select', icon: 'scan-outline' },
  { value: 'pencil', label: 'pencil', icon: 'pencil-outline' },
  { value: 'pen', label: 'pen', icon: 'create-outline' },
  { value: 'fountain', label: 'fountain', icon: 'color-fill-outline' },
  { value: 'brush', label: 'brush', icon: 'brush-outline' },
  { value: 'crayon', label: 'crayon', icon: 'color-palette-outline' },
  { value: 'marker', label: 'marker', icon: 'brush-outline' },
  { value: 'highlighter', label: 'highlight', icon: 'color-wand-outline' },
  { value: 'charcoal', label: 'charcoal', icon: 'flame-outline' },
  { value: 'calligraphy', label: 'calligraphy', icon: 'leaf-outline' },
  { value: 'spray', label: 'spray', icon: 'sparkles-outline' },
  { value: 'chalk', label: 'chalk', icon: 'apps-outline' },
  { value: 'eraser', label: 'erase', icon: 'remove-outline' },
  { value: 'rectangle', label: 'rect', icon: 'square-outline' },
  { value: 'circle', label: 'circle', icon: 'ellipse-outline' },
  { value: 'line', label: 'line', icon: 'remove-outline' },
  { value: 'arrow', label: 'arrow', icon: 'arrow-forward-outline' },
  { value: 'triangle', label: 'triangle', icon: 'triangle-outline' },
  { value: 'diamond', label: 'diamond', icon: 'diamond-outline' },
  { value: 'star', label: 'star', icon: 'star-outline' },
  { value: 'text', label: 'text', icon: 'text-outline' },
  { value: 'sticky', label: 'sticky', icon: 'document-text-outline' },
];

function isDrawTool(tool: ToolMode): tool is DrawToolMode {
  return DRAW_PRESETS.some((preset) => preset.value === tool);
}

function isPolygonTool(tool: ToolMode): tool is Extract<ToolMode, 'triangle' | 'diamond' | 'star'> {
  return tool === 'triangle' || tool === 'diamond' || tool === 'star';
}

function shapeToolToPolygonKind(tool: Extract<ToolMode, 'triangle' | 'diamond' | 'star'>): CanvasPolygonKind {
  if (tool === 'diamond') return 'diamond';
  if (tool === 'star') return 'star';
  return 'triangle';
}

function cloneElements(elements: CanvasElement[]) {
  return elements.map((element) => {
    if (element.type === 'draw') {
      return { ...element, points: element.points.map((point) => ({ ...point })) };
    }
    return { ...element };
  });
}

function toolToDrawStyle(tool: ToolMode): DrawStyle {
  if (tool === 'pencil') return 'pencil';
  if (tool === 'marker') return 'marker';
  if (tool === 'highlighter') return 'highlighter';
  if (tool === 'fountain') return 'fountain';
  if (tool === 'brush') return 'brush';
  if (tool === 'crayon') return 'crayon';
  if (tool === 'charcoal') return 'charcoal';
  if (tool === 'calligraphy') return 'calligraphy';
  if (tool === 'spray') return 'spray';
  if (tool === 'chalk') return 'chalk';
  return 'pen';
}

function normalizeOpacity(drawStyle: DrawStyle, opacity: number) {
  if (drawStyle === 'pencil') return Math.min(opacity, 0.7);
  if (drawStyle === 'fountain') return Math.min(opacity, 0.94);
  if (drawStyle === 'brush') return Math.min(opacity, 0.88);
  if (drawStyle === 'crayon') return Math.min(opacity, 0.62);
  if (drawStyle === 'marker') return Math.min(opacity, 0.72);
  if (drawStyle === 'highlighter') return Math.min(opacity, 0.26);
  if (drawStyle === 'charcoal') return Math.min(opacity, 0.76);
  if (drawStyle === 'calligraphy') return Math.min(opacity, 0.94);
  if (drawStyle === 'spray') return Math.min(opacity, 0.42);
  if (drawStyle === 'chalk') return Math.min(opacity, 0.84);
  return opacity;
}

function effectiveStrokeWidth(drawStyle: DrawStyle, strokeWidth: number) {
  if (drawStyle === 'pencil') return Math.max(1, strokeWidth * 0.7);
  if (drawStyle === 'fountain') return Math.max(strokeWidth, 3);
  if (drawStyle === 'brush') return Math.max(strokeWidth, 10);
  if (drawStyle === 'crayon') return Math.max(strokeWidth, 6);
  if (drawStyle === 'marker') return Math.max(strokeWidth, 8);
  if (drawStyle === 'highlighter') return Math.max(strokeWidth, 16);
  if (drawStyle === 'charcoal') return Math.max(strokeWidth, 8);
  if (drawStyle === 'calligraphy') return Math.max(strokeWidth, 7);
  if (drawStyle === 'spray') return Math.max(1, strokeWidth * 0.9);
  if (drawStyle === 'chalk') return Math.max(strokeWidth, 7);
  return strokeWidth;
}

function smoothPath(points: CanvasPoint[]) {
  if (points.length < 4) return points;
  const smoothed = [points[0]];

  for (let i = 0; i < points.length - 3; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const p2 = points[i + 2];
    const p3 = points[i + 3];

    for (let t = 0; t < 1; t += 0.25) {
      const t2 = t * t;
      const t3 = t2 * t;
      smoothed.push({
        x:
          0.5 *
          ((2 * p1.x) +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          ((2 * p1.y) +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }

  smoothed.push(points[points.length - 1]);
  return smoothed;
}

function pathLength(points: CanvasPoint[]) {
  return points.reduce((sum, point, index) => {
    if (index === 0) return 0;
    return sum + distance(point, points[index - 1]);
  }, 0);
}

function pointToLineDistance(point: CanvasPoint, start: CanvasPoint, end: CanvasPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!length) return distance(point, start);
  const numerator = Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x);
  return numerator / length;
}

function isPointInPolygon(point: CanvasPoint, vertices: CanvasPoint[]) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;
    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-6) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function getArrowHeadPoints(element: CanvasLineElement) {
  const angle = Math.atan2(element.y2 - element.y1, element.x2 - element.x1);
  const arrowLength = 16;
  const p1 = {
    x: element.x2 - arrowLength * Math.cos(angle - Math.PI / 6),
    y: element.y2 - arrowLength * Math.sin(angle - Math.PI / 6),
  };
  const p2 = {
    x: element.x2 - arrowLength * Math.cos(angle + Math.PI / 6),
    y: element.y2 - arrowLength * Math.sin(angle + Math.PI / 6),
  };

  return [p1, { x: element.x2, y: element.y2 }, p2];
}

function renderSkiaDashEffect(pattern: CanvasStrokePattern | undefined, strokeWidth: number) {
  const intervals = getStrokeDashIntervals(pattern || 'solid', strokeWidth);
  return intervals ? <DashPathEffect intervals={intervals} /> : null;
}

function getBounds(element: CanvasElement) {
  if (element.type === 'draw') {
    const xs = element.points.map((point) => point.x);
    const ys = element.points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }

  if (element.type === 'rectangle' || element.type === 'sticky' || element.type === 'polygon') {
    return { x: element.x, y: element.y, width: element.width, height: element.height };
  }

  if (element.type === 'circle') {
    return {
      x: element.x - element.radius,
      y: element.y - element.radius,
      width: element.radius * 2,
      height: element.radius * 2,
    };
  }

  if (element.type === 'line' || element.type === 'arrow') {
    return {
      x: Math.min(element.x1, element.x2),
      y: Math.min(element.y1, element.y2),
      width: Math.max(1, Math.abs(element.x2 - element.x1)),
      height: Math.max(1, Math.abs(element.y2 - element.y1)),
    };
  }

  if (element.type === 'text') {
    const lines = element.text.split('\n');
    const widest = lines.reduce((max: number, line: string) => Math.max(max, line.length), 0);
    return {
      x: element.x,
      y: element.y - element.fontSize,
      width: Math.max(120, widest * element.fontSize * 0.55),
      height: Math.max(element.fontSize * 1.5, lines.length * element.fontSize * 1.22),
    };
  }

  return { x: 0, y: 0, width: 0, height: 0 };
}

function isPointInsideElement(point: CanvasPoint, element: CanvasElement) {
  if (element.type === 'draw') {
    return element.points.some((strokePoint) => distance(strokePoint, point) <= Math.max(10, element.strokeWidth + 6));
  }

  if (element.type === 'rectangle' || element.type === 'sticky') {
    return point.x >= element.x && point.x <= element.x + element.width && point.y >= element.y && point.y <= element.y + element.height;
  }

  if (element.type === 'polygon') {
    const polygonPoints = getPolygonPoints(element.polygonKind, element.x, element.y, element.width, element.height);
    return isPointInPolygon(point, polygonPoints);
  }

  if (element.type === 'circle') {
    return distance(point, { x: element.x, y: element.y }) <= element.radius;
  }

  if (element.type === 'line' || element.type === 'arrow') {
    const dx = element.x2 - element.x1;
    const dy = element.y2 - element.y1;
    const lengthSq = dx * dx + dy * dy;
    if (!lengthSq) return false;
    const t = ((point.x - element.x1) * dx + (point.y - element.y1) * dy) / lengthSq;
    if (t < 0 || t > 1) return false;
    const projected = {
      x: element.x1 + t * dx,
      y: element.y1 + t * dy,
    };
    return distance(point, projected) <= 14;
  }

  const bounds = getBounds(element);
  return point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
}

function matchesEraserMode(element: CanvasElement, eraserMode: EraserMode) {
  if (eraserMode === 'all') return true;
  if (eraserMode === 'ink') return element.type === 'draw';
  return element.type !== 'draw';
}

function moveElement(element: CanvasElement, dx: number, dy: number): CanvasElement {
  if (element.type === 'draw') {
    return { ...element, points: element.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
  }

  if (element.type === 'rectangle' || element.type === 'circle' || element.type === 'text' || element.type === 'sticky' || element.type === 'polygon') {
    return { ...element, x: element.x + dx, y: element.y + dy } as CanvasElement;
  }

  return {
    ...element,
    x1: element.x1 + dx,
    y1: element.y1 + dy,
    x2: element.x2 + dx,
    y2: element.y2 + dy,
  };
}

function createShapePreview(
  tool: ShapeToolMode,
  start: CanvasPoint,
  end: CanvasPoint,
  color: string,
  strokeWidth: number,
  strokePattern: CanvasStrokePattern,
  fillColor: string,
  opacity: number
): CanvasElement | null {
  if (tool === 'rectangle') {
    return {
      id: 'preview',
      type: 'rectangle',
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
      color,
      strokeWidth,
      strokePattern,
      fillColor,
      opacity,
    };
  }

  if (tool === 'circle') {
    const center = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    };
    return {
      id: 'preview',
      type: 'circle',
      x: center.x,
      y: center.y,
      radius: Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)) / 2,
      color,
      strokeWidth,
      strokePattern,
      fillColor,
      opacity,
    };
  }

  if (isPolygonTool(tool)) {
    return {
      id: 'preview',
      type: 'polygon',
      polygonKind: shapeToolToPolygonKind(tool),
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
      color,
      strokeWidth,
      strokePattern,
      fillColor,
      opacity,
    };
  }

  return {
    id: 'preview',
    type: tool,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    color,
    strokeWidth,
    strokePattern,
    opacity,
  };
}

function recognizeShape(points: CanvasPoint[]) {
  if (points.length < 8) return null;

  const totalDistance = pathLength(points);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const size = Math.max(width, height);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const directDistance = distance(firstPoint, lastPoint);
  const straightness = directDistance / totalDistance;
  const maxDeviation = points.reduce((max, point) => Math.max(max, pointToLineDistance(point, firstPoint, lastPoint)), 0);

  if (straightness > 0.92 && maxDeviation < Math.max(4, size * 0.03)) {
    return {
      type: 'line' as const,
      x1: firstPoint.x,
      y1: firstPoint.y,
      x2: lastPoint.x,
      y2: lastPoint.y,
    };
  }

  const closingDistance = distance(firstPoint, lastPoint);
  const isClosed = closingDistance < Math.max(12, size * 0.1);
  if (!isClosed || size < 24) return null;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const aspectRatio = Math.min(width, height) / Math.max(width, height);
  const radii = points.map((point) => Math.hypot(point.x - centerX, point.y - centerY));
  const avgRadius = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
  const radiusVariance = radii.reduce((sum, radius) => sum + Math.abs(radius - avgRadius), 0) / radii.length;
  const circularityScore = 1 - radiusVariance / (avgRadius || 1);

  if (circularityScore > 0.82 && aspectRatio > 0.78) {
    return {
      type: 'circle' as const,
      x: centerX,
      y: centerY,
      radius: avgRadius,
    };
  }

  return {
    type: 'rectangle' as const,
    x: minX,
    y: minY,
    width,
    height,
  };
}

function renderSvgArrowHead(element: CanvasLineElement) {
  return getArrowHeadPoints(element).map((point) => `${point.x},${point.y}`).join(' ');
}

function renderPattern(pattern: BackgroundPattern, width: number, height: number, color: string) {
  if (pattern === 'none') return null;

  if (pattern === 'dots') {
    return Array.from({ length: Math.ceil(width / 26) }).flatMap((_, xIndex) =>
      Array.from({ length: Math.ceil(height / 26) }).map((__, yIndex) => (
        <Circle key={`dot-${xIndex}-${yIndex}`} cx={xIndex * 26 + 13} cy={yIndex * 26 + 13} r={1.1} fill={color} />
      ))
    );
  }

  if (pattern === 'graph') {
    return (
      <>
        {Array.from({ length: Math.ceil(width / 28) }).map((_, index) => (
          <Line key={`graph-v-${index}`} x1={index * 28} y1={0} x2={index * 28} y2={height} stroke={color} strokeWidth={1} />
        ))}
        {Array.from({ length: Math.ceil(height / 28) }).map((_, index) => (
          <Line key={`graph-h-${index}`} x1={0} y1={index * 28} x2={width} y2={index * 28} stroke={color} strokeWidth={1} />
        ))}
      </>
    );
  }

  return Array.from({ length: Math.ceil(height / 30) }).map((_, index) => (
    <Line key={`line-${index}`} x1={0} y1={index * 30} x2={width} y2={index * 30} stroke={color} strokeWidth={1} />
  ));
}

function renderTextElement(
  text: string,
  x: number,
  y: number,
  color: string,
  fontSize: number,
  fontFamily?: string,
  opacity = 1
) {
  const family = resolveNoteFont(fontFamily, 'body');
  return text.split('\n').map((line, index) => (
    <SvgText
      key={`${x}-${y}-${index}`}
      x={x}
      y={y + index * fontSize * 1.22}
      fill={color}
      fontSize={fontSize}
      fontFamily={family}
      fontWeight="600"
      opacity={opacity}
    >
      {line || ' '}
    </SvgText>
  ));
}

function renderSvgElement(element: CanvasElement, selected = false) {
  const selectionColor = '#f0b465';

  if (element.type === 'draw') {
    const layers = getDrawStylePaths(element.points, element.drawStyle || 'pen', element.strokeWidth, element.opacity ?? 1);
    return (
      <G key={String(element.id)}>
        {layers.map((layer, index) => (
          <Path
            key={`${String(element.id)}-${index}`}
            d={layer.path}
            fill={selected ? selectionColor : element.color}
            opacity={layer.opacity}
          />
        ))}
      </G>
    );
  }

  if (element.type === 'rectangle') {
    const dashArray = getStrokeDashArray(element.strokePattern || 'solid', element.strokeWidth);
    return (
      <Rect
        key={String(element.id)}
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        rx={18}
        fill={element.fillColor && element.fillColor !== 'transparent' ? element.fillColor : 'transparent'}
        stroke={selected ? selectionColor : element.color}
        strokeWidth={selected ? element.strokeWidth + 1 : element.strokeWidth}
        strokeDasharray={dashArray}
        opacity={element.opacity ?? 1}
      />
    );
  }

  if (element.type === 'circle') {
    const dashArray = getStrokeDashArray(element.strokePattern || 'solid', element.strokeWidth);
    return (
      <Circle
        key={String(element.id)}
        cx={element.x}
        cy={element.y}
        r={element.radius}
        fill={element.fillColor && element.fillColor !== 'transparent' ? element.fillColor : 'transparent'}
        stroke={selected ? selectionColor : element.color}
        strokeWidth={selected ? element.strokeWidth + 1 : element.strokeWidth}
        strokeDasharray={dashArray}
        opacity={element.opacity ?? 1}
      />
    );
  }

  if (element.type === 'line') {
    const dashArray = getStrokeDashArray(element.strokePattern || 'solid', element.strokeWidth);
    return (
      <Line
        key={String(element.id)}
        x1={element.x1}
        y1={element.y1}
        x2={element.x2}
        y2={element.y2}
        stroke={selected ? selectionColor : element.color}
        strokeWidth={selected ? element.strokeWidth + 1 : element.strokeWidth}
        strokeLinecap="round"
        strokeDasharray={dashArray}
        opacity={element.opacity ?? 1}
      />
    );
  }

  if (element.type === 'arrow') {
    const dashArray = getStrokeDashArray(element.strokePattern || 'solid', element.strokeWidth);
    return (
      <G key={String(element.id)} opacity={element.opacity ?? 1}>
        <Line
          x1={element.x1}
          y1={element.y1}
          x2={element.x2}
          y2={element.y2}
          stroke={selected ? selectionColor : element.color}
          strokeWidth={selected ? element.strokeWidth + 1 : element.strokeWidth}
          strokeLinecap="round"
          strokeDasharray={dashArray}
        />
        <Polygon points={renderSvgArrowHead(element)} fill={selected ? selectionColor : element.color} />
      </G>
    );
  }

  if (element.type === 'polygon') {
    const dashArray = getStrokeDashArray(element.strokePattern || 'solid', element.strokeWidth);
    const points = getPolygonPoints(element.polygonKind, element.x, element.y, element.width, element.height)
      .map((point) => `${point.x},${point.y}`)
      .join(' ');
    return (
      <Polygon
        key={String(element.id)}
        points={points}
        fill={element.fillColor && element.fillColor !== 'transparent' ? element.fillColor : 'transparent'}
        stroke={selected ? selectionColor : element.color}
        strokeWidth={selected ? element.strokeWidth + 1 : element.strokeWidth}
        strokeDasharray={dashArray}
        opacity={element.opacity ?? 1}
      />
    );
  }

  if (element.type === 'text') {
    return (
      <G key={String(element.id)}>
        {renderTextElement(
          element.text,
          element.x,
          element.y,
          selected ? selectionColor : element.color,
          element.fontSize,
          element.fontFamily,
          element.opacity ?? 1
        )}
      </G>
    );
  }

  return element.type === 'sticky' ? (
    <G key={String(element.id)} opacity={element.opacity ?? 1}>
      <Rect
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        rx={18}
        fill={element.color}
        stroke={selected ? selectionColor : rgbaFromHex('#171717', 0.12)}
        strokeWidth={selected ? 2 : 1}
      />
      {renderTextElement(element.text || 'Sticky note', element.x + 16, element.y + 28, '#2d2d2d', 14, element.fontFamily, 1)}
    </G>
  ) : null;
}

function renderSkiaPattern(pattern: BackgroundPattern, width: number, height: number, color: string) {
  if (pattern === 'none') return null;

  if (pattern === 'dots') {
    return Array.from({ length: Math.ceil(width / 26) }).flatMap((_, xIndex) =>
      Array.from({ length: Math.ceil(height / 26) }).map((__, yIndex) => (
        <SkiaCircle key={`dot-${xIndex}-${yIndex}`} cx={xIndex * 26 + 13} cy={yIndex * 26 + 13} r={1.1} color={color} />
      ))
    );
  }

  if (pattern === 'graph') {
    return renderSkiaGrid(width, height, color);
  }

  return Array.from({ length: Math.ceil(height / 30) }).map((_, index) => (
    <SkiaLine key={`line-${index}`} p1={vec(0, index * 30)} p2={vec(width, index * 30)} color={color} strokeWidth={1} />
  ));
}

function renderSkiaGrid(width: number, height: number, color: string) {
  return (
    <>
      {Array.from({ length: Math.ceil(width / 30) }).map((_, index) => (
        <SkiaLine key={`grid-v-${index}`} p1={vec(index * 30, 0)} p2={vec(index * 30, height)} color={color} strokeWidth={1} />
      ))}
      {Array.from({ length: Math.ceil(height / 30) }).map((_, index) => (
        <SkiaLine key={`grid-h-${index}`} p1={vec(0, index * 30)} p2={vec(width, index * 30)} color={color} strokeWidth={1} />
      ))}
    </>
  );
}

function renderSkiaArrowHead(element: CanvasLineElement, color: string, opacity = 1) {
  const [p1, tip, p2] = getArrowHeadPoints(element);

  return (
    <SkiaPath
      path={`M ${tip.x} ${tip.y} L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} Z`}
      color={color}
      opacity={opacity}
    />
  );
}

function renderSkiaElement(element: CanvasElement) {
  if (element.type === 'draw') {
    const layers = getDrawStylePaths(element.points, element.drawStyle || 'pen', element.strokeWidth, element.opacity ?? 1);
    return (
      <SkiaGroup key={String(element.id)}>
        {layers.map((layer, index) => (
          <SkiaPath
            key={`${String(element.id)}-${index}`}
            path={layer.path}
            color={element.color}
            style="fill"
            opacity={layer.opacity}
          />
        ))}
      </SkiaGroup>
    );
  }

  if (element.type === 'rectangle') {
    return (
      <SkiaGroup key={String(element.id)} opacity={element.opacity ?? 1}>
        {element.fillColor && element.fillColor !== 'transparent' ? (
          <SkiaRoundedRect x={element.x} y={element.y} width={element.width} height={element.height} r={18} color={element.fillColor} />
        ) : null}
        <SkiaRoundedRect x={element.x} y={element.y} width={element.width} height={element.height} r={18} color={element.color} style="stroke" strokeWidth={element.strokeWidth}>
          {renderSkiaDashEffect(element.strokePattern, element.strokeWidth)}
        </SkiaRoundedRect>
      </SkiaGroup>
    );
  }

  if (element.type === 'circle') {
    return (
      <SkiaGroup key={String(element.id)} opacity={element.opacity ?? 1}>
        {element.fillColor && element.fillColor !== 'transparent' ? (
          <SkiaCircle cx={element.x} cy={element.y} r={element.radius} color={element.fillColor} />
        ) : null}
        <SkiaCircle cx={element.x} cy={element.y} r={element.radius} color={element.color} style="stroke" strokeWidth={element.strokeWidth}>
          {renderSkiaDashEffect(element.strokePattern, element.strokeWidth)}
        </SkiaCircle>
      </SkiaGroup>
    );
  }

  if (element.type === 'line') {
    return (
      <SkiaLine
        key={String(element.id)}
        p1={vec(element.x1, element.y1)}
        p2={vec(element.x2, element.y2)}
        color={element.color}
        strokeWidth={element.strokeWidth}
        opacity={element.opacity ?? 1}
      >
        {renderSkiaDashEffect(element.strokePattern, element.strokeWidth)}
      </SkiaLine>
    );
  }

  if (element.type === 'arrow') {
    return (
      <SkiaGroup key={String(element.id)} opacity={element.opacity ?? 1}>
        <SkiaLine p1={vec(element.x1, element.y1)} p2={vec(element.x2, element.y2)} color={element.color} strokeWidth={element.strokeWidth}>
          {renderSkiaDashEffect(element.strokePattern, element.strokeWidth)}
        </SkiaLine>
        {renderSkiaArrowHead(element, element.color, element.opacity ?? 1)}
      </SkiaGroup>
    );
  }

  if (element.type === 'polygon') {
    const path = getClosedPathFromPoints(getPolygonPoints(element.polygonKind, element.x, element.y, element.width, element.height));
    return (
      <SkiaGroup key={String(element.id)} opacity={element.opacity ?? 1}>
        {element.fillColor && element.fillColor !== 'transparent' ? (
          <SkiaPath path={path} color={element.fillColor} style="fill" />
        ) : null}
        <SkiaPath path={path} color={element.color} style="stroke" strokeWidth={element.strokeWidth}>
          {renderSkiaDashEffect(element.strokePattern, element.strokeWidth)}
        </SkiaPath>
      </SkiaGroup>
    );
  }

  return null;
}

export function CanvasPreview({
  canvasData,
  height = 190,
  theme,
}: {
  canvasData?: string;
  height?: number;
  theme: ThemeColors;
}) {
  const width = 320;
  const elements = parseCanvasElements(canvasData);
  const lineColor = rgbaFromHex(theme.textSecondary, theme.isLight ? 0.12 : 0.18);

  return (
    <View
      style={[
        previewStyles.wrap,
        {
          height,
          borderColor: rgbaFromHex(theme.borderStrong, 0.88),
          backgroundColor: '#fffdf8',
        },
      ]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
        {renderPattern('lines', width, height, lineColor)}
        {elements.map((element) => renderSvgElement(element))}
      </Svg>
      {elements.length === 0 ? (
        <View style={previewStyles.empty}>
          <Ionicons name="brush-outline" size={18} color={theme.textSecondary} />
          <Text style={[previewStyles.emptyText, { color: theme.textSecondary }]}>no canvas content yet</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function NotesCanvasScreen({ user, initialData, onBack, onSaved, mode = 'note' }: Props) {
  const { selectedTheme } = useAppTheme();
  const theme: ThemeColors = selectedTheme;
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [tool, setTool] = useState<ToolMode>('pen');
  const [color, setColor] = useState<string>(COLORS[0]);
  const [fillColor, setFillColor] = useState<string>('transparent');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [fontSize, setFontSize] = useState(20);
  const [fontFamily, setFontFamily] = useState('Inter');
  const [opacity, setOpacity] = useState(1);
  const [strokePattern, setStrokePattern] = useState<CanvasStrokePattern>('solid');
  const [backgroundPattern, setBackgroundPattern] = useState<BackgroundPattern>('lines');
  const [showGrid, setShowGrid] = useState(false);
  const [smoothDrawing, setSmoothDrawing] = useState(true);
  const [shapeRecognition, setShapeRecognition] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 360, height: 520 });
  const [currentStroke, setCurrentStroke] = useState<CanvasDrawElement | null>(null);
  const [previewShape, setPreviewShape] = useState<CanvasElement | null>(null);
  const [history, setHistory] = useState<CanvasElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [showTextModal, setShowTextModal] = useState(false);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [eraserMode, setEraserMode] = useState<EraserMode>('all');
  const [saving, setSaving] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [textTarget, setTextTarget] = useState<{
    mode: 'create' | 'edit';
    tool: 'text' | 'sticky';
    point?: CanvasPoint;
    id?: string | number;
  } | null>(null);

  const elementsRef = useRef<CanvasElement[]>([]);
  const draftElementsRef = useRef<CanvasElement[] | null>(null);
  const strokeRef = useRef<CanvasDrawElement | null>(null);
  const previewShapeRef = useRef<CanvasElement | null>(null);
  const dragRef = useRef<DragState>(null);
  const historyRef = useRef<CanvasElement[][]>([[]]);
  const historyIndexRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const canvasSizeRef = useRef({ width: 360, height: 520 });
  const viewportHeightRef = useRef(520);

  const selectedElement = selectedId != null ? elements.find((element) => element.id === selectedId) ?? null : null;
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const selectedIsShape =
    selectedElement?.type === 'rectangle' || selectedElement?.type === 'circle' || selectedElement?.type === 'polygon';
  const selectedIsLinear = selectedElement?.type === 'line' || selectedElement?.type === 'arrow';
  const selectedIsText = selectedElement?.type === 'text';
  const selectedIsSticky = selectedElement?.type === 'sticky';
  const selectedIsDraw = selectedElement?.type === 'draw';
  const isDrawingTool = isDrawTool(tool);
  const activeDrawStyle = selectedElement?.type === 'draw' ? selectedElement.drawStyle || 'pen' : toolToDrawStyle(tool);
  const toolbarBorder = rgbaFromHex(theme.borderStrong, theme.isLight ? 0.88 : 0.84);
  const softAccent = rgbaFromHex(theme.accent, theme.isLight ? 0.1 : 0.16);
  const paperInk = rgbaFromHex(theme.textSecondary, theme.isLight ? 0.1 : 0.16);
  const navTop = insets.top + (layout.isLandscape ? 8 : 12);
  const navHeight = layout.isLandscape ? 58 : 64;
  const hudTop = navTop + navHeight + 10;
  const dockBottom = Math.max(insets.bottom, layout.isLandscape ? 10 : 12);
  const dockHeight = layout.isLandscape ? 74 : 82;
  const trayHeight = activePanel ? (layout.isLandscape ? 132 : 184) : 0;
  const stageBottomInset = dockBottom + dockHeight + trayHeight + 10;
  const stageMinHeight = layout.isTablet
    ? Math.max(560, layout.height - (activePanel ? 250 : 164))
    : Math.max(320, layout.height - (activePanel ? 330 : 208));

  useEffect(() => {
    canvasSizeRef.current = canvasSize;
  }, [canvasSize]);

  useEffect(() => {
    const nextElements = cloneElements(parseCanvasElements(initialData));
    const nextHistory = [cloneElements(nextElements)];
    setElements(nextElements);
    elementsRef.current = nextElements;
    draftElementsRef.current = null;
    strokeRef.current = null;
    previewShapeRef.current = null;
    dragRef.current = null;
    setSelectedId(null);
    setTool('pen');
    setColor(COLORS[0]);
    setFillColor('transparent');
    setStrokeWidth(4);
    setFontSize(20);
    setFontFamily('Inter');
    setOpacity(1);
    setStrokePattern('solid');
    setBackgroundPattern('lines');
    setShowGrid(false);
    setSmoothDrawing(true);
    setShapeRecognition(true);
    setEraserMode('all');
    setCanvasSize((current) => ({ width: current.width, height: stageMinHeight }));
    canvasSizeRef.current = { width: canvasSizeRef.current.width, height: stageMinHeight };
    viewportHeightRef.current = stageMinHeight;
    setActivePanel(null);
    setCurrentStroke(null);
    setPreviewShape(null);
    historyRef.current = nextHistory;
    historyIndexRef.current = 0;
    setHistory(nextHistory);
    setHistoryIndex(0);
  }, [initialData]);

  useEffect(() => {
    viewportHeightRef.current = Math.max(viewportHeightRef.current, stageMinHeight);
    setCanvasSize((current) => {
      if (current.height >= stageMinHeight) return current;
      const next = { width: current.width, height: stageMinHeight };
      canvasSizeRef.current = next;
      return next;
    });
  }, [stageMinHeight]);

  useEffect(() => {
    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedElement) return;
    if ('color' in selectedElement) setColor(selectedElement.color);
    if ('opacity' in selectedElement && typeof selectedElement.opacity === 'number') setOpacity(selectedElement.opacity);
    if (
      selectedElement.type === 'rectangle' ||
      selectedElement.type === 'circle' ||
      selectedElement.type === 'line' ||
      selectedElement.type === 'arrow' ||
      selectedElement.type === 'polygon' ||
      selectedElement.type === 'draw'
    ) {
      setStrokeWidth(selectedElement.strokeWidth);
    }
    if (selectedElement.type === 'rectangle' || selectedElement.type === 'circle' || selectedElement.type === 'polygon') {
      setFillColor(selectedElement.fillColor || 'transparent');
    }
    if (
      selectedElement.type === 'rectangle' ||
      selectedElement.type === 'circle' ||
      selectedElement.type === 'line' ||
      selectedElement.type === 'arrow' ||
      selectedElement.type === 'polygon'
    ) {
      setStrokePattern(selectedElement.strokePattern || 'solid');
    }
    if (selectedElement.type === 'text') {
      setFontSize(selectedElement.fontSize);
      setFontFamily(normalizeNoteFont(selectedElement.fontFamily));
    }
    if (selectedElement.type === 'sticky') {
      setFontFamily(normalizeNoteFont(selectedElement.fontFamily));
      setColor(selectedElement.color);
    }
  }, [selectedElement]);

  const commitElements = (nextElements: CanvasElement[], addHistory = true) => {
    const cloned = cloneElements(nextElements);
    setElements(cloned);
    elementsRef.current = cloned;
    draftElementsRef.current = null;
    previewShapeRef.current = null;
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (!addHistory) return;
    const nextHistory = [...historyRef.current.slice(0, historyIndexRef.current + 1), cloneElements(cloned)];
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    setHistory(nextHistory);
    setHistoryIndex(historyIndexRef.current);
  };

  const patchSelected = (updater: (element: CanvasElement) => CanvasElement) => {
    if (selectedId == null) return;
    commitElements(elementsRef.current.map((element) => (element.id === selectedId ? updater(element) : element)));
  };

  const scheduleVisualSync = () => {
    if (frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setElements(cloneElements(draftElementsRef.current ?? elementsRef.current));
      setCurrentStroke(strokeRef.current ? { ...strokeRef.current, points: [...strokeRef.current.points] } : null);
      setPreviewShape(previewShapeRef.current ? ({ ...previewShapeRef.current } as CanvasElement) : null);
    });
  };

  const ensureCanvasHeight = (bottomY: number) => {
    const current = canvasSizeRef.current;
    const viewportHeight = viewportHeightRef.current;
    const targetHeight = Math.max(stageMinHeight, viewportHeight, Math.ceil((bottomY + 220) / 240) * 240);
    if (targetHeight <= current.height) return;
    const next = { width: current.width, height: targetHeight };
    canvasSizeRef.current = next;
    setCanvasSize(next);
  };

  const maybeExtendCanvasNear = (point: CanvasPoint) => {
    if (point.y > canvasSizeRef.current.height - 140) {
      ensureCanvasHeight(point.y);
      scrollRef.current?.scrollTo({
        y: Math.max(0, point.y - viewportHeightRef.current * 0.55),
        animated: false,
      });
    }
  };

  const onCanvasLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      viewportHeightRef.current = height;
      const next = { width, height: Math.max(canvasSizeRef.current.height, height, stageMinHeight) };
      canvasSizeRef.current = next;
      setCanvasSize(next);
    }
  };

  const handleUndo = () => {
    if (!canUndo) return;
    const nextIndex = historyIndexRef.current - 1;
    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    const nextElements = cloneElements(historyRef.current[nextIndex]);
    setElements(nextElements);
    elementsRef.current = nextElements;
    setSelectedId(null);
  };

  const handleRedo = () => {
    if (!canRedo) return;
    const nextIndex = historyIndexRef.current + 1;
    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    const nextElements = cloneElements(historyRef.current[nextIndex]);
    setElements(nextElements);
    elementsRef.current = nextElements;
    setSelectedId(null);
  };

  const handleDelete = () => {
    if (selectedId == null) return;
    commitElements(elementsRef.current.filter((element) => element.id !== selectedId));
    setSelectedId(null);
  };

  const handleDuplicate = () => {
    if (!selectedElement) return;
    const duplicate = moveElement({ ...selectedElement, id: `${selectedElement.type}-${Date.now()}` } as CanvasElement, 24, 24);
    commitElements([...elementsRef.current, duplicate]);
    setSelectedId(duplicate.id);
  };

  const handleClear = () => {
    if (!elementsRef.current.length) return;
    commitElements([]);
    setSelectedId(null);
  };

  const handleBringToFront = () => {
    if (selectedId == null) return;
    const target = elementsRef.current.find((element) => element.id === selectedId);
    if (!target) return;
    commitElements([...elementsRef.current.filter((element) => element.id !== selectedId), target]);
  };

  const handleSendToBack = () => {
    if (selectedId == null) return;
    const target = elementsRef.current.find((element) => element.id === selectedId);
    if (!target) return;
    commitElements([target, ...elementsRef.current.filter((element) => element.id !== selectedId)]);
  };

  const openTextEditor = (
    toolType: 'text' | 'sticky',
    mode: 'create' | 'edit',
    point?: CanvasPoint,
    id?: string | number,
    initialText = ''
  ) => {
    setTextTarget({ tool: toolType, mode, point, id });
    setTextDraft(initialText);
    setShowTextModal(true);
  };

  const closeTextModal = () => {
    setShowTextModal(false);
    setTextDraft('');
    setTextTarget(null);
  };

  const saveTextEditor = () => {
    if (!textTarget) return;

    if (textTarget.mode === 'edit' && textTarget.id != null) {
      commitElements(elementsRef.current.map((element) => {
        if (element.id !== textTarget.id) return element;
        if (element.type === 'text' || element.type === 'sticky') {
          return { ...element, text: textDraft || (element.type === 'text' ? 'Text' : 'Sticky note'), fontFamily: normalizeNoteFont(fontFamily) };
        }
        return element;
      }));
    } else if (textTarget.point) {
      ensureCanvasHeight(textTarget.point.y + (textTarget.tool === 'sticky' ? 220 : 120));
      const nextElement: CanvasElement =
        textTarget.tool === 'text'
          ? {
              id: `text-${Date.now()}`,
              type: 'text',
              x: textTarget.point.x,
              y: textTarget.point.y,
              text: textDraft || 'Text',
              color,
              fontSize,
              fontFamily: normalizeNoteFont(fontFamily),
              opacity,
            }
          : {
              id: `sticky-${Date.now()}`,
              type: 'sticky',
              x: textTarget.point.x,
              y: textTarget.point.y,
              width: layout.isTablet ? 240 : 200,
              height: layout.isTablet ? 180 : 150,
              text: textDraft || 'Sticky note',
              color: STICKY_COLORS.includes(color as (typeof STICKY_COLORS)[number]) ? color : STICKY_COLORS[0],
              fontFamily: normalizeNoteFont(fontFamily),
              opacity,
              priority: 'normal',
              timestamp: new Date().toISOString(),
            };
      commitElements([...elementsRef.current, nextElement]);
      setSelectedId(nextElement.id);
    }

    closeTextModal();
  };

  const saveCanvas = async () => {
    const canvasData = serializeCanvasElements(elementsRef.current);
    const previewData = createCanvasPreviewDataUrl(canvasData, Math.max(320, canvasSize.width), Math.max(220, canvasSize.height));

    if (mode === 'attachment') {
      onSaved({ canvasData, previewData });
      return;
    }

    const content = buildNoteContentFromBlocks([
      createCanvasBlock(canvasData, previewData || undefined),
    ]);

    try {
      setSaving(true);
      await createNote({
        userId: user.username,
        title: 'Canvas sketch',
        content,
      });
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save canvas note';
      Alert.alert('Save failed', message);
    } finally {
      setSaving(false);
    }
  };

  const handleGestureStart = (x: number, y: number) => {
    const point = { x, y };
    maybeExtendCanvasNear(point);
    const hit = [...elementsRef.current].reverse().find((element) => isPointInsideElement(point, element));

    if (tool === 'select') {
      if (hit) {
        setSelectedId(hit.id);
        dragRef.current = {
          mode: 'move',
          start: point,
          selectedId: hit.id,
          originElement: hit,
        };
      } else {
        setSelectedId(null);
        dragRef.current = null;
      }
      return;
    }

    if (tool === 'eraser') {
      dragRef.current = { mode: 'erase' };
      const remaining = elementsRef.current.filter((element) => !(matchesEraserMode(element, eraserMode) && isPointInsideElement(point, element)));
      if (remaining.length !== elementsRef.current.length) {
        draftElementsRef.current = remaining;
        setSelectedId(null);
        scheduleVisualSync();
      }
      return;
    }

    if (tool === 'text' || tool === 'sticky') {
      openTextEditor(tool, 'create', point);
      return;
    }

    if (isDrawTool(tool)) {
      const drawStyle = toolToDrawStyle(tool);
      strokeRef.current = {
        id: `draw-${Date.now()}`,
        type: 'draw',
        points: [point],
        color,
        strokeWidth: effectiveStrokeWidth(drawStyle, strokeWidth),
        opacity: normalizeOpacity(drawStyle, opacity),
        drawStyle,
      };
      scheduleVisualSync();
      return;
    }

    dragRef.current = { mode: 'shape', start: point, tool };
    previewShapeRef.current = createShapePreview(tool, point, point, color, strokeWidth, strokePattern, fillColor, opacity);
    scheduleVisualSync();
  };

  const handleGestureMove = (x: number, y: number) => {
    const point = { x, y };
    maybeExtendCanvasNear(point);
    const active = dragRef.current;

    if (isDrawTool(tool) && strokeRef.current && !active) {
      const current = strokeRef.current;
      if (distance(current.points[current.points.length - 1], point) >= 1) {
        current.points.push(point);
        scheduleVisualSync();
      }
      return;
    }

    if (!active) return;

    if (active.mode === 'move') {
      const dx = point.x - active.start.x;
      const dy = point.y - active.start.y;
      draftElementsRef.current = elementsRef.current.map((element) => (
        element.id === active.selectedId ? moveElement(active.originElement, dx, dy) : element
      ));
      scheduleVisualSync();
      return;
    }

    if (active.mode === 'erase') {
      const source = draftElementsRef.current ?? elementsRef.current;
      const remaining = source.filter((element) => !(matchesEraserMode(element, eraserMode) && isPointInsideElement(point, element)));
      if (remaining.length !== source.length) {
        draftElementsRef.current = remaining;
        scheduleVisualSync();
      }
      return;
    }

    previewShapeRef.current = createShapePreview(active.tool, active.start, point, color, strokeWidth, strokePattern, fillColor, opacity);
    scheduleVisualSync();
  };

  const handleGestureEnd = (x: number, y: number) => {
    const point = { x, y };
    maybeExtendCanvasNear(point);
    const active = dragRef.current;

    if (isDrawTool(tool) && strokeRef.current) {
      const drawStyle = strokeRef.current.drawStyle || 'pen';
      let points = simplifyStrokePoints(strokeRef.current.points, 1.6);
      if (smoothDrawing) points = smoothPath(points);

      if (points.length > 1) {
        if (shapeRecognition && drawStyle === 'pen') {
          const recognized = recognizeShape(points);
          if (recognized) {
            const recognizedElement: CanvasElement =
              recognized.type === 'line'
                ? {
                    id: `line-${Date.now()}`,
                    type: 'line',
                    x1: recognized.x1,
                    y1: recognized.y1,
                    x2: recognized.x2,
                    y2: recognized.y2,
                    color,
                    strokeWidth,
                    strokePattern,
                    opacity,
                  }
                : recognized.type === 'circle'
                  ? {
                      id: `circle-${Date.now()}`,
                      type: 'circle',
                      x: recognized.x,
                      y: recognized.y,
                      radius: recognized.radius,
                      color,
                      strokeWidth,
                      strokePattern,
                      fillColor,
                      opacity,
                    }
                  : {
                      id: `rectangle-${Date.now()}`,
                      type: 'rectangle',
                      x: recognized.x,
                      y: recognized.y,
                      width: recognized.width,
                      height: recognized.height,
                      color,
                      strokeWidth,
                      strokePattern,
                      fillColor,
                      opacity,
                    };
            commitElements([...elementsRef.current, recognizedElement]);
            setSelectedId(recognizedElement.id);
          } else {
            const nextStroke = { ...strokeRef.current, points };
            commitElements([...elementsRef.current, nextStroke]);
            setSelectedId(nextStroke.id);
          }
        } else {
          const nextStroke = { ...strokeRef.current, points };
          commitElements([...elementsRef.current, nextStroke]);
          setSelectedId(nextStroke.id);
        }
      }

      strokeRef.current = null;
      setCurrentStroke(null);
    } else if (active?.mode === 'move') {
      commitElements(draftElementsRef.current ?? elementsRef.current);
    } else if (active?.mode === 'erase') {
      commitElements(draftElementsRef.current ?? elementsRef.current);
    } else if (active?.mode === 'shape' && previewShapeRef.current) {
      const nextPreview = previewShapeRef.current;
      const valid =
        (nextPreview.type === 'rectangle' && nextPreview.width > 4 && nextPreview.height > 4) ||
        (nextPreview.type === 'circle' && nextPreview.radius > 4) ||
        (nextPreview.type === 'polygon' && nextPreview.width > 8 && nextPreview.height > 8) ||
        ((nextPreview.type === 'line' || nextPreview.type === 'arrow') &&
          (Math.abs(nextPreview.x2 - nextPreview.x1) > 4 || Math.abs(nextPreview.y2 - nextPreview.y1) > 4));
      if (valid) {
        const nextElement = { ...nextPreview, id: `${nextPreview.type}-${Date.now()}` } as CanvasElement;
        commitElements([...elementsRef.current, nextElement]);
        setSelectedId(nextElement.id);
      }
      previewShapeRef.current = null;
      setPreviewShape(null);
    }

    draftElementsRef.current = null;
    dragRef.current = null;
  };

  const handleGestureCancel = () => {
    draftElementsRef.current = null;
    strokeRef.current = null;
    previewShapeRef.current = null;
    dragRef.current = null;
    setCurrentStroke(null);
    setPreviewShape(null);
  };

  const stageGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .onBegin((event) => {
          handleGestureStart(event.x, event.y);
        })
        .onUpdate((event) => {
          handleGestureMove(event.x, event.y);
        })
        .onFinalize((event) => {
          handleGestureEnd(event.x, event.y);
        })
        .onTouchesCancelled(() => {
          handleGestureCancel();
        }),
    [tool, color, fillColor, strokeWidth, strokePattern, opacity, smoothDrawing, shapeRecognition, eraserMode]
  );

  const currentToolLabel = TOOLS.find((item) => item.value === tool)?.label ?? 'canvas';
  const showFillControls = tool === 'rectangle' || tool === 'circle' || isPolygonTool(tool) || selectedIsShape;
  const showFontControls = tool === 'text' || tool === 'sticky' || selectedIsText || selectedIsSticky;
  const showStrokeWidthControls =
    isDrawingTool || selectedIsDraw || selectedIsShape || selectedIsLinear || tool === 'line' || tool === 'arrow' || isPolygonTool(tool);
  const showOpacityControls =
    isDrawingTool ||
    selectedIsDraw ||
    selectedIsShape ||
    selectedIsLinear ||
    tool === 'rectangle' ||
    tool === 'circle' ||
    tool === 'line' ||
    tool === 'arrow' ||
    isPolygonTool(tool) ||
    tool === 'text' ||
    tool === 'sticky' ||
    selectedIsText ||
    selectedIsSticky;
  const showStrokePatternControls =
    tool === 'rectangle' ||
    tool === 'circle' ||
    tool === 'line' ||
    tool === 'arrow' ||
    isPolygonTool(tool) ||
    selectedIsShape ||
    selectedIsLinear;
  const colorOptions = tool === 'sticky' || selectedIsSticky ? STICKY_COLORS : COLORS;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bgPrimary }]} edges={[]}>
        <View style={[styles.stageArea, { paddingBottom: stageBottomInset }]}>
          <View style={[styles.stageShell, { borderColor: toolbarBorder, backgroundColor: '#fffdf8' }]}>
            <ScrollView
              ref={scrollRef}
              style={styles.stageScroll}
              contentContainerStyle={styles.stageScrollContent}
              onLayout={onCanvasLayout}
              scrollEnabled={tool === 'select'}
              showsVerticalScrollIndicator={false}
              bounces
            >
              <GestureDetector gesture={stageGesture}>
                <View style={[styles.stageViewport, { minHeight: stageMinHeight, height: canvasSize.height }]}>
                  <SkiaCanvas style={StyleSheet.absoluteFill}>
                    <SkiaRoundedRect x={0} y={0} width={canvasSize.width} height={canvasSize.height} r={30} color="#fffdf8" />
                    {renderSkiaPattern(backgroundPattern, canvasSize.width, canvasSize.height, paperInk)}
                    {showGrid ? renderSkiaGrid(canvasSize.width, canvasSize.height, rgbaFromHex(theme.textSecondary, 0.08)) : null}
                    {elements.map((element) => renderSkiaElement(element))}
                    {previewShape ? renderSkiaElement(previewShape) : null}
                    {currentStroke ? renderSkiaElement(currentStroke) : null}
                  </SkiaCanvas>

                  <View pointerEvents="none" style={styles.overlay}>
                    {elements.map((element) => {
                      if (element.type === 'text') {
                        const bounds = getBounds(element);
                        return (
                          <View
                            key={`text-${String(element.id)}`}
                            style={[
                              styles.textOverlay,
                              {
                                left: bounds.x,
                                top: bounds.y,
                                width: bounds.width,
                                opacity: element.opacity ?? 1,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                color: element.color,
                                fontSize: element.fontSize,
                                lineHeight: element.fontSize * 1.22,
                                fontFamily: resolveNoteFont(element.fontFamily, 'body'),
                                fontWeight: '600',
                              }}
                            >
                              {element.text}
                            </Text>
                          </View>
                        );
                      }

                      if (element.type === 'sticky') {
                        return (
                          <View
                            key={`sticky-${String(element.id)}`}
                            style={[
                              styles.stickyOverlay,
                              {
                                left: element.x,
                                top: element.y,
                                width: element.width,
                                height: element.height,
                                backgroundColor: element.color,
                                opacity: element.opacity ?? 1,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                color: '#2d2d2d',
                                fontSize: 14,
                                lineHeight: 18,
                                fontFamily: resolveNoteFont(element.fontFamily, 'body'),
                                fontWeight: '600',
                              }}
                            >
                              {element.text || 'Sticky note'}
                            </Text>
                          </View>
                        );
                      }

                      return null;
                    })}

                    {selectedElement ? (() => {
                      const bounds = getBounds(selectedElement);
                      return (
                        <View
                          style={[
                            styles.selectionFrame,
                            {
                              left: bounds.x - 8,
                              top: bounds.y - 8,
                              width: Math.max(20, bounds.width + 16),
                              height: Math.max(20, bounds.height + 16),
                            },
                          ]}
                        />
                      );
                    })() : null}
                  </View>
                </View>
              </GestureDetector>
            </ScrollView>

            <View pointerEvents="box-none" style={[styles.stageTopRow, { top: hudTop }]}>
              <View style={[styles.stageBadge, { borderColor: toolbarBorder, backgroundColor: rgbaFromHex(theme.panel, 0.9) }]}>
                <Text style={[styles.stageBadgeText, { color: theme.accentHover }]}>
                  {elements.length} item{elements.length === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={styles.stageActions}>
                <HapticTouchable style={[styles.iconChip, { borderColor: toolbarBorder }]} onPress={handleUndo} disabled={!canUndo} haptic="selection">
                  <Ionicons name="arrow-undo-outline" size={17} color={canUndo ? theme.accentHover : theme.textSecondary} />
                </HapticTouchable>
                <HapticTouchable style={[styles.iconChip, { borderColor: toolbarBorder }]} onPress={handleRedo} disabled={!canRedo} haptic="selection">
                  <Ionicons name="arrow-redo-outline" size={17} color={canRedo ? theme.accentHover : theme.textSecondary} />
                </HapticTouchable>
                <HapticTouchable style={[styles.iconChip, { borderColor: toolbarBorder }]} onPress={handleDuplicate} disabled={!selectedElement} haptic="selection">
                  <Ionicons name="duplicate-outline" size={17} color={selectedElement ? theme.accentHover : theme.textSecondary} />
                </HapticTouchable>
                <HapticTouchable style={[styles.iconChip, { borderColor: toolbarBorder }]} onPress={handleDelete} disabled={!selectedElement} haptic="warning">
                  <Ionicons name="trash-outline" size={17} color={selectedElement ? theme.danger : theme.textSecondary} />
                </HapticTouchable>
              </View>
            </View>
          </View>
        </View>

        <View pointerEvents="box-none" style={styles.navOverlay}>
          <View
            style={[
              styles.navShell,
              {
                top: navTop,
                left: layout.isTablet ? 18 : 12,
                right: layout.isTablet ? 18 : 12,
                borderColor: toolbarBorder,
                backgroundColor: rgbaFromHex(theme.panel, 0.9),
              },
            ]}
          >
            <HapticTouchable onPress={onBack} style={[styles.navBtn, { borderColor: toolbarBorder, backgroundColor: rgbaFromHex(theme.panelAlt, 0.9) }]} haptic="selection">
              <Ionicons name="chevron-back" size={20} color={theme.accentHover} />
            </HapticTouchable>

            <View style={[styles.navCenterCard, { borderColor: toolbarBorder, backgroundColor: rgbaFromHex(theme.bgPrimary, 0.74) }]}>
              <Text style={[styles.navTitle, { color: theme.accentHover }]}>canvas studio</Text>
              <Text style={[styles.navSubtitle, { color: theme.textSecondary }]}>
                {selectedElement ? `${selectedElement.type} selected` : currentToolLabel}
              </Text>
            </View>

            <HapticTouchable style={[styles.navPrimaryBtn, { backgroundColor: theme.accent, opacity: saving ? 0.7 : 1 }]} onPress={saveCanvas} haptic="success" disabled={saving}>
              <Text style={[styles.navPrimaryBtnText, { color: theme.bgPrimary }]}>{saving ? 'saving' : layout.isLandscape ? 'save' : 'done'}</Text>
            </HapticTouchable>
          </View>
        </View>

        <View
          style={[
            styles.bottomPanel,
            {
              left: layout.isTablet ? 16 : 10,
              right: layout.isTablet ? 16 : 10,
              bottom: dockBottom,
            },
          ]}
        >
          {activePanel ? (
            <View style={[styles.traySurface, { borderColor: toolbarBorder, backgroundColor: rgbaFromHex(theme.panel, 0.98) }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.inspectorRow}
                keyboardShouldPersistTaps="handled"
                directionalLockEnabled
              >
                {activePanel === 'style' ? (
                  <>
                    {tool === 'eraser' ? (
                      <View style={styles.inspectorGroup}>
                        <Text style={[styles.inspectorLabel, { color: theme.textSecondary }]}>erase</Text>
                        <View style={styles.toggleRow}>
                          {([
                            ['all', 'all layers'],
                            ['ink', 'ink only'],
                            ['objects', 'objects'],
                          ] as const).map(([mode, label]) => (
                            <HapticTouchable
                              key={mode}
                              style={[
                                styles.toggleChip,
                                {
                                  borderColor: eraserMode === mode ? theme.accent : toolbarBorder,
                                  backgroundColor: eraserMode === mode ? softAccent : rgbaFromHex(theme.panelAlt, 0.96),
                                },
                              ]}
                              onPress={() => setEraserMode(mode)}
                              haptic="selection"
                            >
                              <Text style={[styles.toggleChipText, { color: theme.accentHover }]}>{label}</Text>
                            </HapticTouchable>
                          ))}
                        </View>
                      </View>
                    ) : null}

                    <View style={styles.inspectorGroup}>
                      <Text style={[styles.inspectorLabel, { color: theme.textSecondary }]}>color</Text>
                      <View style={styles.swatchRow}>
                        {colorOptions.map((preset) => {
                          const active = color === preset;
                          return (
                            <HapticTouchable
                              key={preset}
                              style={[styles.colorDot, { backgroundColor: preset, borderColor: active ? theme.accentHover : toolbarBorder }]}
                              onPress={() => {
                                setColor(preset);
                                if (selectedId != null) {
                                  patchSelected((element) => ('color' in element ? { ...element, color: preset } : element));
                                }
                              }}
                              haptic="selection"
                            >
                              {active ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                            </HapticTouchable>
                          );
                        })}
                      </View>
                    </View>

                    {showStrokeWidthControls ? (
                      <View style={styles.inspectorGroup}>
                        <Text style={[styles.inspectorLabel, { color: theme.textSecondary }]}>width</Text>
                        <View style={styles.widthRow}>
                          {STROKE_WIDTHS.map((width) => (
                            <HapticTouchable
                              key={width}
                              style={[
                                styles.widthChip,
                                {
                                  borderColor: strokeWidth === width ? theme.accent : toolbarBorder,
                                  backgroundColor: strokeWidth === width ? softAccent : rgbaFromHex(theme.panelAlt, 0.96),
                                },
                              ]}
                              onPress={() => {
                                setStrokeWidth(width);
                                if (selectedId != null) {
                                  patchSelected((element) => {
                                    if (element.type === 'draw') {
                                      return { ...element, strokeWidth: effectiveStrokeWidth(element.drawStyle || 'pen', width) };
                                    }
                                    if (
                                      element.type === 'rectangle' ||
                                      element.type === 'circle' ||
                                      element.type === 'line' ||
                                      element.type === 'arrow' ||
                                      element.type === 'polygon'
                                    ) {
                                      return { ...element, strokeWidth: width };
                                    }
                                    return element;
                                  });
                                }
                              }}
                              haptic="selection"
                            >
                              <View style={{ width: 26, height: Math.max(2, width), borderRadius: width / 2, backgroundColor: theme.accentHover }} />
                            </HapticTouchable>
                          ))}
                        </View>
                      </View>
                    ) : null}

                    {showStrokePatternControls ? (
                      <View style={styles.inspectorGroup}>
                        <Text style={[styles.inspectorLabel, { color: theme.textSecondary }]}>pattern</Text>
                        <View style={styles.toggleRow}>
                          {STROKE_PATTERNS.map((pattern) => (
                            <HapticTouchable
                              key={pattern}
                              style={[
                                styles.toggleChip,
                                {
                                  borderColor: strokePattern === pattern ? theme.accent : toolbarBorder,
                                  backgroundColor: strokePattern === pattern ? softAccent : rgbaFromHex(theme.panelAlt, 0.96),
                                },
                              ]}
                              onPress={() => {
                                setStrokePattern(pattern);
                                if (selectedId != null) {
                                  patchSelected((element) => (
                                    element.type === 'rectangle' ||
                                    element.type === 'circle' ||
                                    element.type === 'line' ||
                                    element.type === 'arrow' ||
                                    element.type === 'polygon'
                                      ? { ...element, strokePattern: pattern }
                                      : element
                                  ));
                                }
                              }}
                              haptic="selection"
                            >
                              <Text style={[styles.toggleChipText, { color: theme.accentHover }]}>{pattern}</Text>
                            </HapticTouchable>
                          ))}
                        </View>
                      </View>
                    ) : null}

                    {showFillControls ? (
                      <View style={styles.inspectorGroup}>
                        <Text style={[styles.inspectorLabel, { color: theme.textSecondary }]}>fill</Text>
                        <View style={styles.swatchRow}>
                          {FILL_COLORS.map((preset) => {
                            const active = fillColor === preset;
                            return (
                              <HapticTouchable
                                key={preset}
                                style={[
                                  styles.colorDot,
                                  {
                                    backgroundColor: preset === 'transparent' ? '#ffffff' : preset,
                                    borderColor: active ? theme.accentHover : toolbarBorder,
                                  },
                                ]}
                                onPress={() => {
                                  setFillColor(preset);
                                  if (selectedId != null) {
                                    patchSelected((element) => (
                                      element.type === 'rectangle' || element.type === 'circle' || element.type === 'polygon'
                                        ? { ...element, fillColor: preset }
                                        : element
                                    ));
                                  }
                                }}
                                haptic="selection"
                              >
                                {preset === 'transparent' ? <Ionicons name="close" size={13} color={theme.danger} /> : active ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                              </HapticTouchable>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}

                    {showOpacityControls ? (
                      <View style={styles.inspectorGroup}>
                        <Text style={[styles.inspectorLabel, { color: theme.textSecondary }]}>opacity</Text>
                        <View style={styles.widthRow}>
                          {OPACITY_LEVELS.map((level) => {
                            const resolvedLevel = selectedElement?.type === 'draw' ? normalizeOpacity(activeDrawStyle, level) : level;
                            const active = Math.abs(opacity - resolvedLevel) < 0.05;
                            return (
                              <HapticTouchable
                                key={String(level)}
                                style={[
                                  styles.sizeChip,
                                  {
                                    borderColor: active ? theme.accent : toolbarBorder,
                                    backgroundColor: active ? softAccent : rgbaFromHex(theme.panelAlt, 0.96),
                                  },
                                ]}
                                onPress={() => {
                                  const nextOpacity = selectedElement?.type === 'draw' || isDrawingTool
                                    ? normalizeOpacity(activeDrawStyle, level)
                                    : level;
                                  setOpacity(nextOpacity);
                                  if (selectedId != null) {
                                    patchSelected((element) => {
                                      if ('opacity' in element) {
                                        return {
                                          ...element,
                                          opacity: element.type === 'draw'
                                            ? normalizeOpacity(element.drawStyle || activeDrawStyle, level)
                                            : level,
                                        };
                                      }
                                      return element;
                                    });
                                  }
                                }}
                                haptic="selection"
                              >
                                <Text style={[styles.sizeChipText, { color: theme.accentHover }]}>{Math.round(level * 100)}%</Text>
                              </HapticTouchable>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}

                    {showFontControls ? (
                      <>
                        <View style={styles.inspectorGroup}>
                          <Text style={[styles.inspectorLabel, { color: theme.textSecondary }]}>font</Text>
                          <View style={styles.fontRow}>
                            {NOTE_FONT_OPTIONS.map((font) => (
                              <HapticTouchable
                                key={font}
                                style={[
                                  styles.fontChip,
                                  {
                                    borderColor: fontFamily === font ? theme.accent : toolbarBorder,
                                    backgroundColor: fontFamily === font ? softAccent : rgbaFromHex(theme.panelAlt, 0.96),
                                  },
                                ]}
                                onPress={() => {
                                  setFontFamily(font);
                                  if (selectedId != null) {
                                    patchSelected((element) => (
                                      element.type === 'text' || element.type === 'sticky'
                                        ? { ...element, fontFamily: font }
                                        : element
                                    ));
                                  }
                                }}
                                haptic="selection"
                              >
                                <Text style={[styles.fontChipText, { color: theme.accentHover, fontFamily: resolveNoteFont(font, 'body') }]}>{font}</Text>
                              </HapticTouchable>
                            ))}
                          </View>
                        </View>

                        {tool === 'text' || selectedIsText ? (
                          <View style={styles.inspectorGroup}>
                            <Text style={[styles.inspectorLabel, { color: theme.textSecondary }]}>size</Text>
                            <View style={styles.widthRow}>
                              {FONT_SIZES.map((size) => (
                                <HapticTouchable
                                  key={size}
                                  style={[
                                    styles.sizeChip,
                                    {
                                      borderColor: fontSize === size ? theme.accent : toolbarBorder,
                                      backgroundColor: fontSize === size ? softAccent : rgbaFromHex(theme.panelAlt, 0.96),
                                    },
                                  ]}
                                  onPress={() => {
                                    setFontSize(size);
                                    if (selectedId != null) {
                                      patchSelected((element) => (element.type === 'text' ? { ...element, fontSize: size } : element));
                                    }
                                  }}
                                  haptic="selection"
                                >
                                  <Text style={[styles.sizeChipText, { color: theme.accentHover }]}>{size}</Text>
                                </HapticTouchable>
                              ))}
                            </View>
                          </View>
                        ) : null}
                      </>
                    ) : null}

                    {selectedElement ? (
                      <View style={styles.inspectorGroup}>
                        <Text style={[styles.inspectorLabel, { color: theme.textSecondary }]}>layer</Text>
                        <View style={styles.toggleRow}>
                          <HapticTouchable
                            style={[styles.toggleChip, { borderColor: toolbarBorder, backgroundColor: rgbaFromHex(theme.panelAlt, 0.96) }]}
                            onPress={handleSendToBack}
                            haptic="selection"
                          >
                            <Text style={[styles.toggleChipText, { color: theme.accentHover }]}>send back</Text>
                          </HapticTouchable>
                          <HapticTouchable
                            style={[styles.toggleChip, { borderColor: toolbarBorder, backgroundColor: rgbaFromHex(theme.panelAlt, 0.96) }]}
                            onPress={handleBringToFront}
                            haptic="selection"
                          >
                            <Text style={[styles.toggleChipText, { color: theme.accentHover }]}>bring front</Text>
                          </HapticTouchable>
                        </View>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <>
                    <View style={styles.inspectorGroup}>
                      <Text style={[styles.inspectorLabel, { color: theme.textSecondary }]}>page</Text>
                      <View style={styles.toggleRow}>
                        {([
                          ['grid', showGrid, () => setShowGrid((value) => !value)],
                          ['smooth', smoothDrawing, () => setSmoothDrawing((value) => !value)],
                          ['recognize', shapeRecognition, () => setShapeRecognition((value) => !value)],
                        ] as const).map(([label, active, onPress]) => (
                          <HapticTouchable
                            key={label}
                            style={[
                              styles.toggleChip,
                              {
                                borderColor: active ? theme.accent : toolbarBorder,
                                backgroundColor: active ? softAccent : rgbaFromHex(theme.panelAlt, 0.96),
                              },
                            ]}
                            onPress={onPress}
                            haptic="selection"
                          >
                            <Text style={[styles.toggleChipText, { color: theme.accentHover }]}>{label}</Text>
                          </HapticTouchable>
                        ))}
                      </View>
                    </View>

                    <View style={styles.inspectorGroup}>
                      <Text style={[styles.inspectorLabel, { color: theme.textSecondary }]}>paper</Text>
                      <View style={styles.toggleRow}>
                        {(['lines', 'dots', 'graph', 'none'] as BackgroundPattern[]).map((pattern) => (
                          <HapticTouchable
                            key={pattern}
                            style={[
                              styles.toggleChip,
                              {
                                borderColor: backgroundPattern === pattern ? theme.accent : toolbarBorder,
                                backgroundColor: backgroundPattern === pattern ? softAccent : rgbaFromHex(theme.panelAlt, 0.96),
                              },
                            ]}
                            onPress={() => setBackgroundPattern(pattern)}
                            haptic="selection"
                          >
                            <Text style={[styles.toggleChipText, { color: theme.accentHover }]}>{pattern}</Text>
                          </HapticTouchable>
                        ))}
                      </View>
                    </View>

                    <View style={styles.inspectorGroup}>
                      <Text style={[styles.inspectorLabel, { color: theme.textSecondary }]}>actions</Text>
                      <View style={styles.toggleRow}>
                        <HapticTouchable
                          style={[styles.toggleChip, { borderColor: toolbarBorder, backgroundColor: rgbaFromHex(theme.panelAlt, 0.96), opacity: elements.length ? 1 : 0.6 }]}
                          onPress={handleClear}
                          disabled={!elements.length}
                          haptic="warning"
                        >
                          <Text style={[styles.toggleChipText, { color: elements.length ? theme.danger : theme.textSecondary }]}>clear canvas</Text>
                        </HapticTouchable>
                      </View>
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          ) : null}

          <View style={[styles.toolbarRail, { borderColor: toolbarBorder, backgroundColor: rgbaFromHex(theme.panel, 0.96) }]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.toolbarRow, layout.isTablet && styles.toolbarRowCentered]}
              keyboardShouldPersistTaps="handled"
              directionalLockEnabled
            >
              <HapticTouchable
                style={[
                  styles.utilityBtn,
                  {
                    borderColor: activePanel === 'style' ? theme.accent : toolbarBorder,
                    backgroundColor: activePanel === 'style' ? softAccent : rgbaFromHex(theme.panelAlt, 0.96),
                  },
                ]}
                onPress={() => setActivePanel((panel) => (panel === 'style' ? null : 'style'))}
                haptic="selection"
              >
                <Ionicons name="color-palette-outline" size={18} color={theme.accentHover} />
                <Text style={[styles.utilityBtnText, { color: theme.accentHover }]}>style</Text>
              </HapticTouchable>

              <HapticTouchable
                style={[
                  styles.utilityBtn,
                  {
                    borderColor: activePanel === 'page' ? theme.accent : toolbarBorder,
                    backgroundColor: activePanel === 'page' ? softAccent : rgbaFromHex(theme.panelAlt, 0.96),
                  },
                ]}
                onPress={() => setActivePanel((panel) => (panel === 'page' ? null : 'page'))}
                haptic="selection"
              >
                <Ionicons name="options-outline" size={18} color={theme.accentHover} />
                <Text style={[styles.utilityBtnText, { color: theme.accentHover }]}>page</Text>
              </HapticTouchable>

              {selectedElement?.type === 'text' || selectedElement?.type === 'sticky' ? (
                <HapticTouchable
                  style={[styles.utilityBtn, { borderColor: toolbarBorder, backgroundColor: softAccent }]}
                  onPress={() => openTextEditor(selectedElement.type, 'edit', undefined, selectedElement.id, selectedElement.text)}
                  haptic="selection"
                >
                  <Ionicons name="create-outline" size={18} color={theme.accentHover} />
                  <Text style={[styles.utilityBtnText, { color: theme.accentHover }]}>edit</Text>
                </HapticTouchable>
              ) : null}
              {TOOLS.map((item) => {
                const active = tool === item.value;
                return (
                  <HapticTouchable
                    key={item.value}
                    style={[
                      styles.toolBtn,
                      {
                        borderColor: active ? theme.accent : toolbarBorder,
                        backgroundColor: active ? theme.accent : rgbaFromHex(theme.panelAlt, 0.96),
                      },
                    ]}
                    onPress={() => setTool(item.value)}
                    haptic="selection"
                  >
                    <Ionicons name={item.icon} size={18} color={active ? theme.bgPrimary : theme.accentHover} />
                    <Text style={[styles.toolBtnText, { color: active ? theme.bgPrimary : theme.accentHover }]}>{item.label}</Text>
                  </HapticTouchable>
                );
              })}
            </ScrollView>
          </View>
        </View>

        <Modal transparent animationType="fade" visible={showTextModal} onRequestClose={closeTextModal}>
          <View style={styles.textModalRoot}>
            <Pressable style={styles.textModalBackdrop} onPress={closeTextModal} />
            <View style={[styles.textModalCard, { backgroundColor: theme.panel, borderColor: toolbarBorder }]}>
              <Text style={[styles.textModalTitle, { color: theme.accentHover }]}>
                {textTarget ? `${textTarget.mode === 'edit' ? 'Edit' : 'Add'} ${textTarget.tool === 'sticky' ? 'Sticky Note' : 'Text'}` : 'Edit'}
              </Text>
              <TextInput
                value={textDraft}
                onChangeText={setTextDraft}
                multiline
                autoFocus
                placeholder={textTarget?.tool === 'sticky' ? 'Write your sticky note...' : 'Write your canvas text...'}
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.textModalInput,
                  {
                    color: theme.accentHover,
                    borderColor: toolbarBorder,
                    backgroundColor: theme.panelAlt,
                    fontFamily: resolveNoteFont(fontFamily, 'body'),
                  },
                ]}
              />
              <View style={styles.textModalActions}>
                <HapticTouchable style={[styles.textModalBtnSecondary, { borderColor: toolbarBorder, backgroundColor: theme.panelAlt }]} onPress={closeTextModal} haptic="selection">
                  <Text style={[styles.textModalBtnSecondaryText, { color: theme.accentHover }]}>cancel</Text>
                </HapticTouchable>
                <HapticTouchable style={[styles.textModalBtnPrimary, { backgroundColor: theme.accent }]} onPress={saveTextEditor} haptic="success">
                  <Text style={[styles.textModalBtnPrimaryText, { color: theme.bgPrimary }]}>save</Text>
                </HapticTouchable>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
  );
}

const previewStyles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  empty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'lowercase',
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  navOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  navShell: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    zIndex: 31,
    elevation: 8,
  },
  navBtn: {
    width: 42,
    height: 42,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCenterCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
    textTransform: 'lowercase',
  },
  navSubtitle: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  navPrimaryBtn: {
    minWidth: 68,
    height: 42,
    borderRadius: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navPrimaryBtnText: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'lowercase',
  },
  stageArea: {
    flex: 1,
    paddingHorizontal: 6,
    paddingTop: 6,
  },
  stageShell: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  stageScroll: {
    flex: 1,
  },
  stageScrollContent: {
    flexGrow: 1,
  },
  stageTopRow: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 20,
    elevation: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stageBadge: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  stageBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'lowercase',
  },
  stageActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  stageViewport: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  textOverlay: {
    position: 'absolute',
  },
  stickyOverlay: {
    position: 'absolute',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(23,23,23,0.12)',
    justifyContent: 'flex-start',
  },
  selectionFrame: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#f0b465',
    borderStyle: 'dashed',
    borderRadius: 14,
  },
  bottomPanel: {
    position: 'absolute',
    gap: 10,
    zIndex: 25,
    elevation: 7,
  },
  traySurface: {
    borderWidth: 1,
    borderRadius: 20,
    paddingTop: 10,
    paddingBottom: 10,
    overflow: 'hidden',
  },
  inspectorRow: {
    paddingHorizontal: 12,
    gap: 12,
    alignItems: 'flex-start',
  },
  inspectorGroup: {
    gap: 8,
    minWidth: 120,
  },
  inspectorLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    maxWidth: 320,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  widthRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  widthChip: {
    width: 46,
    height: 38,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    maxWidth: 420,
  },
  fontChip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fontChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sizeChip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 50,
    alignItems: 'center',
  },
  sizeChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    maxWidth: 380,
  },
  toggleChip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toggleChipText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  toolbarRail: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    overflow: 'hidden',
  },
  toolbarRow: {
    gap: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  toolbarRowCentered: {
    minWidth: '100%',
    justifyContent: 'center',
  },
  toolBtn: {
    minWidth: 64,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  toolBtnText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'lowercase',
  },
  utilityBtn: {
    minWidth: 64,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  utilityBtnText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'lowercase',
  },
  textModalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(10, 12, 20, 0.45)',
  },
  textModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  textModalCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  textModalTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
    textTransform: 'lowercase',
  },
  textModalInput: {
    minHeight: 140,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  textModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  textModalBtnSecondary: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textModalBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'lowercase',
  },
  textModalBtnPrimary: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textModalBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'lowercase',
  },
});
