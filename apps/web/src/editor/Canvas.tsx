import { useEffect, useRef } from "react";
import { renderFrame, type Project } from "@pixelforge/core";
import {
  DrawingGesture,
  mapPointer,
  onCanvas,
  sampleLayer,
  type Tool,
} from "./gesture.js";
export interface CanvasProps {
  overlay?: import("react").ReactNode;
  project: Project;
  frame: string;
  layer: string;
  color: number;
  tool: Tool;
  filled: boolean;
  zoom: number;
  grid: boolean;
  previous?: string;
  next?: string;
  opacity: number;
  disabled: boolean;
  commit: (p: Project, label: string) => void;
  pick: (index: number) => void;
  error: (message: string) => void;
}
export function EditorCanvas(props: CanvasProps) {
  const viewport = useRef<HTMLDivElement>(null),
    board = useRef<HTMLDivElement>(null),
    main = useRef<HTMLCanvasElement>(null),
    cursor = useRef<HTMLDivElement>(null);
  const gesture = useRef<DrawingGesture | null>(null),
    pointer = useRef<number | null>(null),
    space = useRef(false),
    pan = useRef<{ x: number; y: number; left: number; top: number } | null>(
      null,
    );
  const latest = useRef(props);
  latest.current = props;
  function paint(p: Project) {
    const r = renderFrame(p, latest.current.frame),
      ctx = main.current?.getContext("2d");
    ctx?.putImageData(
      new ImageData(new Uint8ClampedArray(r.data), r.width, r.height),
      0,
      0,
    );
  }
  function cancel() {
    gesture.current = null;
    pan.current = null;
    pointer.current = null;
    paint(latest.current.project);
  }
  useEffect(() => {
    cancel();
  }, [
    props.project,
    props.frame,
    props.layer,
    props.tool,
    props.zoom,
    props.disabled,
  ]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      if (
        e.code === "Space" &&
        !(e.target as HTMLElement).closest("button,a,summary")
      ) {
        e.preventDefault();
        space.current = true;
      }
      if (e.key === "Escape") cancel();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
    };
    const blur = () => {
      space.current = false;
      cancel();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  function point(e: { clientX: number; clientY: number }) {
    return mapPointer(
      e.clientX,
      e.clientY,
      board.current!.getBoundingClientRect(),
      props.project.width,
      props.project.height,
    );
  }
  return (
    <div
      className="editor-viewport"
      tabIndex={0}
      aria-label="Drawing viewport"
      ref={viewport}
      onPointerDown={(e) => {
        if (pointer.current !== null || e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.focus({ preventScroll: true });
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        if (space.current || props.tool === "pan") {
          pan.current = {
            x: e.clientX,
            y: e.clientY,
            left: e.currentTarget.scrollLeft,
            top: e.currentTarget.scrollTop,
          };
          return;
        }
        if (props.disabled) return;
        const q = point(e);
        if (!onCanvas(props.project, q)) return;
        try {
          if (props.tool === "picker") {
            props.pick(sampleLayer(props.project, props.frame, props.layer, q));
            return;
          }
          gesture.current = new DrawingGesture(
            props.project,
            props.frame,
            props.layer,
            props.tool,
            props.color,
            q,
            props.filled,
          );
          paint(gesture.current.draft);
        } catch (error) {
          props.error(String(error));
          cancel();
        }
      }}
      onPointerMove={(e) => {
        const q = point(e);
        if (cursor.current) {
          cursor.current.style.display = onCanvas(props.project, q)
            ? "block"
            : "none";
          cursor.current.style.left = `${q.x * props.zoom}px`;
          cursor.current.style.top = `${q.y * props.zoom}px`;
        }
        if (e.pointerId !== pointer.current) return;
        if (pan.current) {
          e.currentTarget.scrollLeft =
            pan.current.left - (e.clientX - pan.current.x);
          e.currentTarget.scrollTop =
            pan.current.top - (e.clientY - pan.current.y);
          return;
        }
        if (gesture.current) {
          try {
            gesture.current.move(q);
            paint(gesture.current.draft);
          } catch (error) {
            props.error(String(error));
            cancel();
          }
        }
      }}
      onPointerUp={(e) => {
        if (e.pointerId !== pointer.current) return;
        const draft = gesture.current;
        gesture.current = null;
        pan.current = null;
        pointer.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
        if (draft) {
          try {
            draft.move(point(e));
            props.commit(draft.finish(), props.tool);
          } catch (error) {
            props.error(String(error));
            paint(props.project);
          }
        }
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={() => {
        if (pointer.current !== null) cancel();
      }}
      onPointerLeave={() => {
        if (cursor.current) cursor.current.style.display = "none";
      }}
    >
      <div
        className="editor-board"
        ref={board}
        style={{
          width: props.project.width * props.zoom,
          height: props.project.height * props.zoom,
        }}
      >
        {props.previous && (
          <Onion
            project={props.project}
            frame={props.previous}
            opacity={props.opacity}
            tint="previous"
          />
        )}
        {props.next && (
          <Onion
            project={props.project}
            frame={props.next}
            opacity={props.opacity}
            tint="next"
          />
        )}
        <canvas
          ref={main}
          width={props.project.width}
          height={props.project.height}
          aria-label="Editable pixel canvas"
        />
        {props.grid && props.zoom >= 4 && (
          <div
            className="pixel-grid"
            style={{ backgroundSize: `${props.zoom}px ${props.zoom}px` }}
          />
        )}
        <div
          ref={cursor}
          className="pixel-cursor"
          style={{ width: props.zoom, height: props.zoom }}
        />
        {props.overlay}
      </div>
    </div>
  );
}
function Onion({
  project,
  frame,
  opacity,
  tint,
}: {
  project: Project;
  frame: string;
  opacity: number;
  tint: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const r = renderFrame(project, frame),
      d = new Uint8ClampedArray(r.data);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = tint === "previous" ? 255 : 60;
      d[i + 1] = tint === "previous" ? 90 : 200;
      d[i + 2] = tint === "previous" ? 110 : 255;
    }
    ref.current
      ?.getContext("2d")
      ?.putImageData(new ImageData(d, r.width, r.height), 0, 0);
  }, [project, frame, tint]);
  return (
    <canvas
      className="onion"
      data-onion={tint}
      ref={ref}
      width={project.width}
      height={project.height}
      style={{ opacity }}
      aria-hidden="true"
    />
  );
}
