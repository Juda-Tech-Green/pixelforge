import { useRef, useState, type PointerEvent } from "react";
import * as pf from "@pixelforge/core";
import type { Edit } from "./Panels.js";
import type { GameView } from "./GameData.js";
type Rect = { x: number; y: number; width: number; height: number };
export function GameOverlay({
  project,
  frame,
  animation,
  index,
  zoom,
  view,
  edit,
  disabled,
}: {
  project: pf.Project;
  frame: string;
  animation: string;
  index: number;
  zoom: number;
  view: GameView;
  edit: Edit;
  disabled: boolean;
}) {
  const game = pf.getGameMetadata(project),
    regions = pf.resolveGameBoxes(game, frame, animation, index);
  const body = game.body;
  return (
    <div
      className="game-overlay"
      style={{ pointerEvents: "none", position: "absolute", inset: 0 }}
    >
      {view.collision && body && (
        <Region
          key={JSON.stringify(body)}
          id="collision"
          kind="collision"
          rect={
            body.type === "rectangle"
              ? body
              : {
                  x: body.x,
                  y: body.y,
                  width: body.radius * 2,
                  height: body.radius * 2,
                }
          }
          circle={body.type === "circle"}
          zoom={zoom}
          project={project}
          interactive={view.edit && !disabled}
          commit={(rect) =>
            edit("Move/resize collision", (p) =>
              pf.setCollisionBody(
                p,
                body.type === "rectangle"
                  ? { type: "rectangle", ...rect }
                  : {
                      type: "circle",
                      x: rect.x,
                      y: rect.y,
                      radius: rect.width / 2,
                    },
              ),
            )
          }
        />
      )}
      {regions
        .filter((b) => view[b.kind])
        .map((box) => (
          <Region
            key={JSON.stringify(box)}
            id={box.id}
            kind={box.kind}
            rect={box.rect}
            zoom={zoom}
            project={project}
            interactive={view.edit && !disabled}
            commit={(rect) =>
              edit("Move/resize region", (p) =>
                pf.updateGameBox(p, box.id, { ...box, rect }),
              )
            }
          />
        ))}
      {game.anchors
        .filter(
          (a) =>
            a.scope.type === "project" ||
            (a.scope.type === "frame" && a.scope.frameId === frame) ||
            (a.scope.type === "animation" && a.scope.animation === animation) ||
            (a.scope.type === "entry" &&
              a.scope.animation === animation &&
              a.scope.index === index),
        )
        .map((a) => (
          <span
            key={a.id}
            title={a.name}
            style={{
              position: "absolute",
              left: a.x * zoom - 4,
              top: a.y * zoom - 4,
              width: 8,
              height: 8,
              border: "1px solid #ffd166",
              borderRadius: "50%",
            }}
          />
        ))}
    </div>
  );
}
function Region({
  id,
  kind,
  rect,
  circle = false,
  zoom,
  project,
  interactive,
  commit,
}: {
  id: string;
  kind: string;
  rect: Rect;
  circle?: boolean;
  zoom: number;
  project: pf.Project;
  interactive: boolean;
  commit: (r: Rect) => void;
}) {
  const [draft, setDraft] = useState(rect),
    gesture = useRef<{
      x: number;
      y: number;
      resize: boolean;
      pointer: number;
    } | null>(null),
    current = useRef(rect);
  function cancel() {
    gesture.current = null;
    current.current = rect;
    setDraft(rect);
  }
  function move(e: PointerEvent) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    e.stopPropagation();
    const dx = Math.round((e.clientX - g.x) / zoom),
      dy = Math.round((e.clientY - g.y) / zoom);
    let next: Rect;
    if (g.resize) {
      let width = Math.max(
          circle ? 2 : 1,
          Math.min(project.width - rect.x, rect.width + dx),
        ),
        height = Math.max(
          1,
          Math.min(project.height - rect.y, rect.height + dy),
        );
      if (circle) {
        width = Math.max(
          2,
          Math.floor(Math.min(width, project.height - rect.y) / 2) * 2,
        );
        height = width;
      }
      next = { ...rect, width, height };
    } else
      next = {
        ...rect,
        x: Math.max(0, Math.min(project.width - rect.width, rect.x + dx)),
        y: Math.max(0, Math.min(project.height - rect.height, rect.y + dy)),
      };
    current.current = next;
    setDraft(next);
  }
  return (
    <div
      data-region={id}
      tabIndex={interactive ? 0 : undefined}
      role="img"
      aria-label={`${kind} ${id}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          cancel();
        }
      }}
      onPointerDown={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        e.preventDefault();
        e.currentTarget.focus();
        e.currentTarget.setPointerCapture(e.pointerId);
        gesture.current = {
          x: e.clientX,
          y: e.clientY,
          pointer: e.pointerId,
          resize: (e.target as HTMLElement).dataset.resize === "true",
        };
      }}
      onPointerMove={move}
      onPointerUp={(e) => {
        if (!gesture.current) return;
        e.stopPropagation();
        move(e);
        gesture.current = null;
        commit(current.current);
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={() => {
        if (gesture.current) cancel();
      }}
      style={{
        position: "absolute",
        pointerEvents: interactive ? "auto" : "none",
        left: draft.x * zoom,
        top: draft.y * zoom,
        width: draft.width * zoom,
        height: draft.height * zoom,
        border: `2px solid ${kind === "collision" ? "#77dd88" : kind === "hitbox" ? "#ff6677" : "#66bbff"}`,
        borderRadius: circle ? "50%" : 0,
        cursor: interactive ? "move" : "default",
        background: "transparent",
        touchAction: "none",
      }}
    >
      {interactive && (
        <span
          data-resize="true"
          title={`Resize ${id}`}
          style={{
            position: "absolute",
            right: -4,
            bottom: -4,
            width: 9,
            height: 9,
            background: "#fff",
            border: "1px solid #000",
            cursor: "nwse-resize",
          }}
        />
      )}
    </div>
  );
}
