import { useEffect, useMemo, useRef } from "react";
import * as pf from "@pixelforge/core";
import { reordered, uniqueId, type Edit } from "./Panels.js";
import { RasterCache } from "./raster-cache.js";
const thumbnails = new RasterCache();
interface Props {
  project: pf.Project;
  animation: string;
  index: number;
  setAnimation: (name: string) => void;
  select: (index: number) => void;
  edit: Edit;
  playing: boolean;
  play: () => void;
  speed: number;
  setSpeed: (v: number) => void;
  previous: boolean;
  next: boolean;
  opacity: number;
  setPrevious: (v: boolean) => void;
  setNext: (v: boolean) => void;
  setOpacity: (v: number) => void;
  exportFrames: () => void;
}
export function Timeline(p: Props) {
  const a = p.project.animations.find((a) => a.name === p.animation),
    entries =
      a?.frames ??
      p.project.frames.map((f) => ({ frameId: f.id, durationMs: 100 })),
    current = entries[p.index] ?? entries[0]!;
  function add(duplicate: boolean) {
    const id = uniqueId(
      p.project.frames.map((f) => f.id),
      "frame",
    );
    p.edit(duplicate ? "Duplicate frame" : "Blank frame", (project) => {
      if (duplicate) pf.copyFrame(project, current.frameId, id);
      else pf.createFrame(project, id);
      if (a)
        pf.addAnimationFrame(
          project,
          a.name,
          id,
          current.durationMs,
          p.index + 1,
        );
    });
    p.select(a ? p.index + 1 : p.project.frames.length);
  }
  return (
    <section className="editor-timeline" aria-label="Animation timeline">
      <div className="timeline-controls">
        <label>
          Animation
          <select
            aria-label="Animation"
            value={p.animation}
            onChange={(e) => p.setAnimation(e.target.value)}
          >
            <option value="">Source frames</option>
            {p.project.animations.map((a) => (
              <option key={a.name}>{a.name}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            const name = prompt("Animation name", "idle");
            if (name) {
              p.edit("Create animation", (project) =>
                pf.addAnimation(project, name, [
                  { frameId: current.frameId, durationMs: 100 },
                ]),
              );
              p.setAnimation(name);
            }
          }}
        >
          New animation
        </button>
        <button
          disabled={!a}
          onClick={() => {
            const name = prompt("Rename animation", a!.name);
            if (name) {
              p.edit("Rename animation", (project) =>
                pf.renameAnimation(project, a!.name, name),
              );
              p.setAnimation(name);
            }
          }}
        >
          Rename animation
        </button>
        <button
          disabled={!a}
          onClick={() => {
            p.edit("Delete animation", (project) =>
              pf.removeAnimation(project, a!.name),
            );
            p.setAnimation("");
          }}
        >
          Delete animation
        </button>
        <button disabled={!a} onClick={p.play}>
          {p.playing ? "Pause" : "Play"}
        </button>
        <label>
          Speed
          <select
            aria-label="Playback speed"
            value={p.speed}
            onChange={(e) => p.setSpeed(Number(e.target.value))}
          >
            {[0.25, 0.5, 1, 2, 4].map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </label>
        {a && (
          <>
            <label>
              <input
                type="checkbox"
                checked={a.loop}
                onChange={(e) =>
                  p.edit("Loop animation", (project) =>
                    pf.setAnimationLoop(project, a.name, e.target.checked),
                  )
                }
              />
              Loop
            </label>
            <label>
              Duration ms
              <input
                aria-label="Frame duration"
                type="number"
                min="1"
                max="3600000"
                value={current.durationMs}
                onChange={(e) =>
                  p.edit("Frame duration", (project) =>
                    pf.setFrameDuration(
                      project,
                      a.name,
                      p.index,
                      Number(e.target.value),
                    ),
                  )
                }
              />
            </label>
            <span>
              {a.frames.every((f) => f.durationMs === a.frames[0]!.durationMs)
                ? `${(1000 / current.durationMs).toFixed(1)} FPS`
                : "Variable timing"}
            </span>
          </>
        )}
        <span>
          {p.index + 1} / {entries.length}
        </span>
      </div>
      <div className="timeline-controls">
        <button onClick={() => add(false)}>Blank frame</button>
        <button onClick={() => add(true)}>Duplicate frame</button>
        <button
          disabled={!a || entries.length === 1}
          onClick={() => {
            p.edit("Remove animation entry", (project) =>
              pf.removeAnimationFrame(project, a!.name, p.index),
            );
            p.select(Math.max(0, p.index - 1));
          }}
        >
          Remove entry
        </button>
        <button
          disabled={p.project.frames.length === 1}
          title="Referenced source frames must be removed from animations first"
          onClick={() =>
            p.edit("Delete source frame", (project) =>
              pf.removeFrame(project, current.frameId),
            )
          }
        >
          Delete source frame
        </button>
        {[-1, 1].map((delta) => (
          <button
            key={delta}
            disabled={p.index + delta < 0 || p.index + delta >= entries.length}
            onClick={() => {
              p.edit("Reorder frames", (project) => {
                if (a)
                  pf.reorderAnimationFrames(
                    project,
                    a.name,
                    reordered(
                      entries.map((_, i) => i),
                      p.index,
                      delta,
                    ),
                  );
                else
                  pf.reorderFrames(
                    project,
                    reordered(
                      project.frames.map((f) => f.id),
                      p.index,
                      delta,
                    ),
                  );
              });
              p.select(p.index + delta);
            }}
          >
            {delta < 0 ? "Move earlier" : "Move later"}
          </button>
        ))}
        {a && (
          <label>
            Add existing
            <select
              aria-label="Add existing frame"
              value=""
              onChange={(e) => {
                if (e.target.value)
                  p.edit("Add existing frame", (project) =>
                    pf.addAnimationFrame(project, a.name, e.target.value, 100),
                  );
              }}
            >
              <option value="">Choose source frame…</option>
              {p.project.frames.map((f) => (
                <option key={f.id}>{f.id}</option>
              ))}
            </select>
          </label>
        )}
        <button disabled={!a} onClick={p.exportFrames}>
          Export animation PNGs
        </button>
      </div>
      <div className="timeline-controls">
        <label>
          <input
            type="checkbox"
            checked={p.previous}
            onChange={(e) => p.setPrevious(e.target.checked)}
          />
          Previous onion
        </label>
        <label>
          <input
            type="checkbox"
            checked={p.next}
            onChange={(e) => p.setNext(e.target.checked)}
          />
          Next onion
        </label>
        <label>
          Onion opacity
          <input
            aria-label="Onion opacity"
            type="range"
            min="0"
            max="1"
            step=".05"
            value={p.opacity}
            onChange={(e) => p.setOpacity(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="timeline-frames">
        {entries.map((f, i) => (
          <button
            key={`${f.frameId}-${i}`}
            aria-label={`Select frame ${i + 1}`}
            aria-pressed={p.index === i}
            onClick={() => p.select(i)}
          >
            <Thumbnail project={p.project} frame={f.frameId} />
            <span>
              {i + 1} · {f.frameId}
            </span>
            {a && <small>{f.durationMs} ms</small>}
          </button>
        ))}
      </div>
    </section>
  );
}
function Thumbnail({ project, frame }: { project: pf.Project; frame: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const raster = useMemo(
    () => thumbnails.get(project, frame),
    [project, frame],
  );
  useEffect(() => {
    canvas.current
      ?.getContext("2d")
      ?.putImageData(
        new ImageData(
          new Uint8ClampedArray(raster.data),
          raster.width,
          raster.height,
        ),
        0,
        0,
      );
  }, [raster]);
  return (
    <canvas
      ref={canvas}
      width={project.width}
      height={project.height}
      style={{
        width:
          project.width * Math.min(2, 64 / project.width, 64 / project.height),
        height:
          project.height * Math.min(2, 64 / project.width, 64 / project.height),
      }}
    />
  );
}
