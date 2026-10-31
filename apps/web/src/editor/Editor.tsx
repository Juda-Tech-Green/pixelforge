import { GameOverlay } from "./GameOverlay.js";
import { PhaserExport } from "./PhaserExport.js";
import { GameData, type GameView } from "./GameData.js";
import coin from "../../public/examples/coin.sprite.json" with { type: "json" };
import {
  Pencil,
  Eraser,
  PaintBucket,
  Slash,
  RectangleHorizontal,
  Circle,
  Pipette,
  Hand,
} from "lucide-react";
import { LayerPanel, PalettePanel } from "./Panels.js";
import { Timeline } from "./Timeline.js";
import { useEffect, useRef, useState } from "react";
import * as pf from "@pixelforge/core";
import { EditorCanvas } from "./Canvas.js";
import { EditorHistory } from "./history.js";
import { saveProject, saveFrame, saveSheet } from "./export.js";
import type { Tool } from "./gesture.js";
import "./editor.css";
export function Editor() {
  const [project, setProject] = useState(() => pf.fromDocument(coin));
  const [history] = useState(() => ({ current: new EditorHistory(project) }));
  const [frame, setFrame] = useState("frame-0"),
    [layer, setLayer] = useState("base"),
    [color, setColor] = useState(1),
    [tool, setTool] = useState<Tool>("pencil"),
    [filled, setFilled] = useState(false),
    [zoom, setZoom] = useState(12),
    [grid, setGrid] = useState(false),
    [error, setError] = useState("");
  const [animation, setAnimation] = useState("spin"),
    [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [previous, setPrevious] = useState(false),
    [next, setNext] = useState(false),
    [opacity, setOpacity] = useState(0.25);
  const active = project.animations.find((a) => a.name === animation);
  const entries =
    active?.frames ??
    project.frames.map((f) => ({ frameId: f.id, durationMs: 100 }));
  const selectedIndex = Math.min(index, entries.length - 1),
    selectedFrame = entries[selectedIndex]!.frameId;
  function select(i: number) {
    setPlaying(false);
    setIndex(i);
  }
  function edit(label: string, action: (p: pf.Project) => void) {
    try {
      const p = pf.cloneProject(project);
      action(p);
      return commit(p, label);
    } catch (e) {
      setError(String(e));
      return false;
    }
  }
  function neighbor(delta: number): string | undefined {
    if (!active) return;
    const i = selectedIndex + delta;
    return active.frames[
      active.loop ? (i + entries.length) % entries.length : i
    ]?.frameId;
  }
  useEffect(() => {
    setFrame(selectedFrame);
  }, [selectedFrame]);
  useEffect(() => {
    if (!playing || !active) return;
    let request = 0;
    const start = performance.now(),
      offset = entries
        .slice(0, selectedIndex)
        .reduce((s, f) => s + f.durationMs, 0),
      total = entries.reduce((s, f) => s + f.durationMs, 0);
    const tick = (now: number) => {
      const elapsed = offset + Math.max(0, now - start) * speed;
      setIndex(pf.animationFrameIndexAt(project, active.name, elapsed));
      if (!active.loop && elapsed >= total) {
        setPlaying(false);
        return;
      }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    const hide = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      cancelAnimationFrame(request);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [playing, project, animation, speed]);
  const [gameView, setGameView] = useState<GameView>({
    edit: false,
    collision: true,
    hitbox: true,
    hurtbox: true,
  });
  const file = useRef<HTMLInputElement>(null);
  function commit(p: pf.Project, label: string) {
    try {
      if (history.current.commit(p, label)) restore(history.current.project());
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }
  function restore(p: pf.Project) {
    setPlaying(false);
    setAnimation((a) => (p.animations.some((x) => x.name === a) ? a : ""));
    setIndex((i) =>
      Math.min(
        i,
        (p.animations.find((a) => a.name === animation)?.frames.length ??
          p.frames.length) - 1,
      ),
    );
    setProject(p);
    setFrame((f) => (p.frames.some((x) => x.id === f) ? f : p.frames[0]!.id));
    setLayer((l) => (p.layers.some((x) => x.id === l) ? l : p.layers[0]!.id));
    setColor((c) => Math.min(c, p.palette.length - 1));
  }
  function replace(p: pf.Project) {
    if (history.current.dirty && !confirm("Discard unsaved changes?")) return;
    restore(history.current.replace(p));
    setIndex(0);
    setFrame(p.frames[0]!.id);
    setLayer(p.layers[0]!.id);
    setZoom(
      Math.max(1, Math.min(12, Math.floor(384 / Math.max(p.width, p.height)))),
    );
    setAnimation(p.animations[0]?.name ?? "");
    setError("");
  }
  function save() {
    saveProject(project);
    history.current.markSaved();
    setProject({ ...project });
  }
  async function open(f: File) {
    try {
      replace(pf.fromDocument(JSON.parse(await f.text())));
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (history.current.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      const k = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (k === "s") {
          e.preventDefault();
          save();
        }
        if (k === "z") {
          e.preventDefault();
          restore(e.shiftKey ? history.current.redo() : history.current.undo());
        }
        return;
      }
      const keys: Record<string, Tool> = {
        b: "pencil",
        e: "eraser",
        g: "fill",
        l: "line",
        r: "rectangle",
        o: "ellipse",
        i: "picker",
      };
      if (keys[k]) setTool(keys[k]!);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  return (
    <div
      className="editor"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) void open(f);
      }}
    >
      <header>
        <strong>
          PixelForge <small>Editor</small>
        </strong>
        <span>
          {project.name}
          {history.current.dirty ? " • Unsaved" : ""}
        </span>
        <nav>
          <button
            onClick={() => {
              const name = prompt("Project name", "Untitled");
              if (!name) return;
              const width = Number(prompt("Width in pixels", "32")),
                height = Number(prompt("Height in pixels", "32"));
              try {
                replace(pf.createProject({ name, width, height }));
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            New
          </button>
          <button onClick={() => file.current?.click()}>Open</button>
          <button onClick={save}>Save project</button>
          <button
            disabled={!history.current.canUndo}
            title={history.current.undoLabel}
            onClick={() => restore(history.current.undo())}
          >
            Undo
          </button>
          <button
            disabled={!history.current.canRedo}
            title={history.current.redoLabel}
            onClick={() => restore(history.current.redo())}
          >
            Redo
          </button>
          <button
            onClick={() =>
              void saveFrame(project, frame).catch((e) => setError(String(e)))
            }
          >
            Export frame PNG
          </button>
          <button
            onClick={() => {
              const columns = Number(
                  prompt("Columns", String(project.frames.length)),
                ),
                padding = Number(prompt("Padding in pixels", "0"));
              void saveSheet(project, { columns, padding }).catch((e) =>
                setError(String(e)),
              );
            }}
          >
            Export sheet
          </button>
        </nav>
        <input
          hidden
          ref={file}
          type="file"
          accept=".json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void open(f);
            e.target.value = "";
          }}
        />
      </header>
      {error && (
        <div role="alert" className="editor-error">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      <div className="editor-body">
        <aside className="tool-panel">
          <h2>Tools</h2>
          {(
            [
              "pencil",
              "eraser",
              "fill",
              "line",
              "rectangle",
              "ellipse",
              "picker",
              "pan",
            ] as Tool[]
          ).map((t) => (
            <button
              key={t}
              aria-pressed={tool === t}
              title={
                t === "picker"
                  ? "Sample selected layer palette index"
                  : t === "pan"
                    ? "Pan (Space + drag)"
                    : t
              }
              onClick={() => setTool(t)}
            >
              {(() => {
                const Icon = {
                  pencil: Pencil,
                  eraser: Eraser,
                  fill: PaintBucket,
                  line: Slash,
                  rectangle: RectangleHorizontal,
                  ellipse: Circle,
                  picker: Pipette,
                  pan: Hand,
                }[t];
                return <Icon size={15} aria-hidden="true" />;
              })()}{" "}
              {t}
            </button>
          ))}
          <label>
            <input
              type="checkbox"
              checked={filled}
              onChange={(e) => setFilled(e.target.checked)}
            />
            Filled shapes
          </label>
          <label>
            <input
              type="checkbox"
              checked={grid}
              onChange={(e) => setGrid(e.target.checked)}
            />
            Pixel grid
          </label>
          <label>
            Zoom{" "}
            <input
              aria-label="Zoom"
              type="number"
              min="1"
              max="32"
              value={zoom}
              onChange={(e) =>
                setZoom(Math.max(1, Math.min(32, Number(e.target.value) || 1)))
              }
            />
          </label>
          <button
            onClick={() =>
              void fetch(`${import.meta.env.BASE_URL}examples/coin.sprite.json`)
                .then((r) => r.json())
                .then((d) => replace(pf.fromDocument(d)))
                .catch((e) => setError(String(e)))
            }
          >
            Reset to coin example
          </button>
        </aside>
        <EditorCanvas
          overlay={
            <GameOverlay
              project={project}
              frame={selectedFrame}
              animation={active?.name ?? ""}
              index={selectedIndex}
              zoom={zoom}
              view={gameView}
              edit={edit}
              disabled={playing}
            />
          }
          project={project}
          frame={selectedFrame}
          layer={layer}
          color={color}
          tool={tool}
          filled={filled}
          zoom={zoom}
          grid={grid}
          opacity={opacity}
          previous={previous ? neighbor(-1) : undefined}
          next={next ? neighbor(1) : undefined}
          disabled={playing}
          commit={commit}
          pick={setColor}
          error={setError}
        />
        <aside className="properties">
          <PhaserExport project={project} error={setError} />
          <GameData
            project={project}
            animation={active?.name ?? ""}
            index={selectedIndex}
            edit={edit}
            view={gameView}
            setView={setGameView}
          />
          <LayerPanel
            project={project}
            layer={layer}
            select={setLayer}
            edit={edit}
          />
          <PalettePanel
            project={project}
            color={color}
            select={setColor}
            edit={edit}
          />
          <p>
            {project.width} × {project.height} pixels
          </p>
        </aside>
      </div>
      <Timeline
        project={project}
        animation={active?.name ?? ""}
        index={selectedIndex}
        setAnimation={(name) => {
          setAnimation(name);
          select(0);
        }}
        select={select}
        edit={edit}
        playing={playing}
        play={() => setPlaying((v) => !v)}
        speed={speed}
        setSpeed={setSpeed}
        previous={previous}
        next={next}
        opacity={opacity}
        setPrevious={setPrevious}
        setNext={setNext}
        setOpacity={setOpacity}
        exportFrames={() => {
          if (active)
            void (async () => {
              for (const [i, f] of active.frames.entries())
                await saveFrame(project, f.frameId, active.name + "-" + i);
            })().catch((e) => setError(String(e)));
        }}
      />
    </div>
  );
}
