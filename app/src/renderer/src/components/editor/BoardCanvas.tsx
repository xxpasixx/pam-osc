import { useLayoutEffect, useRef, useState } from "react";
import type { Control, DeviceDefinition } from "../../../../core/format/index.js";

/**
 * The 2D board (design → Board canvas): plain DOM, controls absolutely
 * positioned from grid units, zoom-to-fit. Click selects (AC-1); board mode
 * adds drag-to-move and a resize handle with 0.5-unit snapping (AC-3).
 */

const SNAP = 0.5;
const MIN_SIZE = 0.5;

const snap = (value: number) => Math.round(value / SNAP) * SNAP;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

interface DragState {
  controlId: string;
  kind: "move" | "resize";
  startX: number;
  startY: number;
  origin: { x: number; y: number; width: number; height: number };
}

export function BoardCanvas({
  device,
  mode,
  selectedId,
  summaries,
  invalidIds,
  onSelect,
  onGeometry,
}: {
  device: DeviceDefinition;
  mode: "mapping" | "board";
  selectedId: string | undefined;
  /** Mapping mode: one line per assigned control; unassigned render dimmed (AC-1). */
  summaries: Map<string, string> | undefined;
  /** Controls with validation errors get the error outline (AC-7). */
  invalidIds: Set<string>;
  onSelect: (controlId: string | undefined) => void;
  /** Board mode only — commits a move/resize (already snapped and clamped). */
  onGeometry?: (controlId: string, position: { x: number; y: number; width: number; height: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(48);
  const [drag, setDrag] = useState<DragState | undefined>();

  // Zoom-to-fit: the scale follows the container width (design → Board canvas).
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const fit = () => setScale(clamp(Math.floor((container.clientWidth - 2) / device.layout.width), 20, 96));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [device.layout.width]);

  const startDrag = (event: React.PointerEvent, control: Control, kind: DragState["kind"]) => {
    if (mode !== "board" || !onGeometry) return;
    event.stopPropagation();
    onSelect(control.id);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDrag({ controlId: control.id, kind, startX: event.clientX, startY: event.clientY, origin: control.position });
  };

  const moveDrag = (event: React.PointerEvent, control: Control) => {
    if (!drag || drag.controlId !== control.id || !onGeometry) return;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    const { origin } = drag;
    if (drag.kind === "move") {
      onGeometry(control.id, {
        x: clamp(snap(origin.x + dx), 0, device.layout.width - origin.width),
        y: clamp(snap(origin.y + dy), 0, device.layout.height - origin.height),
        width: origin.width,
        height: origin.height,
      });
    } else {
      onGeometry(control.id, {
        x: origin.x,
        y: origin.y,
        width: clamp(snap(origin.width + dx), MIN_SIZE, device.layout.width - origin.x),
        height: clamp(snap(origin.height + dy), MIN_SIZE, device.layout.height - origin.y),
      });
    }
  };

  const endDrag = () => setDrag(undefined);

  return (
    <div className="board-scroll" ref={containerRef}>
      <div
        className="board"
        role="listbox"
        aria-label="Board layout"
        style={{ width: device.layout.width * scale, height: device.layout.height * scale }}
        onPointerDown={() => onSelect(undefined)}
      >
        {device.controls.map((control) => {
          const summary = summaries?.get(control.id);
          const dimmed = summaries !== undefined && summary === undefined;
          const classes = [
            "board-control",
            control.type,
            control.position.shape === "circle" ? "circle" : "",
            control.id === selectedId ? "selected" : "",
            invalidIds.has(control.id) ? "invalid" : "",
            dimmed ? "dimmed" : "",
            drag?.controlId === control.id ? "dragging" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={control.id}
              role="option"
              aria-selected={control.id === selectedId}
              className={classes}
              style={{
                left: control.position.x * scale,
                top: control.position.y * scale,
                width: control.position.width * scale,
                height: control.position.height * scale,
              }}
              title={control.label ?? control.id}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (mode === "board") startDrag(event, control, "move");
                else onSelect(control.id);
              }}
              onPointerMove={(event) => moveDrag(event, control)}
              onPointerUp={endDrag}
            >
              <span className="control-label">{control.label ?? control.id}</span>
              {summary && <span className="control-summary">{summary}</span>}
              {mode === "board" && control.id === selectedId && (
                <span
                  className="resize-handle"
                  aria-label="Resize"
                  onPointerDown={(event) => startDrag(event, control, "resize")}
                  onPointerMove={(event) => moveDrag(event, control)}
                  onPointerUp={endDrag}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
