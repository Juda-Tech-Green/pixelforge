import { useState } from "react";
import * as pf from "@pixelforge/core";
import type { Edit } from "./Panels.js";
export interface GameView {
  edit: boolean;
  collision: boolean;
  hitbox: boolean;
  hurtbox: boolean;
}
export function GameData({
  project,
  animation,
  index,
  edit,
  view,
  setView,
}: {
  project: pf.Project;
  animation: string;
  index: number;
  edit: Edit;
  view: GameView;
  setView: (v: GameView) => void;
}) {
  const [chosenScope, setChosenScope] = useState<pf.GameScope | undefined>();
  const game = pf.getGameMetadata(project),
    scope: pf.GameScope = animation
      ? { type: "entry", animation, index }
      : { type: "project" };
  const numeric = (
    label: string,
    value: number,
    change: (v: number) => void,
    step = 1,
  ) => (
    <label key={label}>
      {label}
      <input
        aria-label={label}
        type="number"
        step={step}
        value={value}
        onChange={(e) => change(Number(e.target.value))}
      />
    </label>
  );
  function add(kind: "hitbox" | "hurtbox") {
    const id = prompt(`${kind} ID`);
    if (!id) return;
    edit(`Add ${kind}`, (p) =>
      pf.addGameBox(p, {
        id,
        name: id,
        kind,
        scope: chosenScope ?? scope,
        enabled: true,
        rect: {
          x: 0,
          y: 0,
          width: Math.min(8, p.width),
          height: Math.min(8, p.height),
        },
      }),
    );
  }
  return (
    <>
      <h2>Game Data</h2>
      <p className="hint">
        Integer canvas coordinates; origins are normalized 0–1. Default
        new-region scope:{" "}
        {animation ? `${animation}, entry ${index}` : "the project"}. Drag
        visible regions to move; use their corner to resize.
      </p>
      <div className="rgba-fields">
        {numeric(
          "Origin X",
          game.origin.x,
          (v) =>
            edit("Sprite origin", (p) =>
              pf.setSpriteOrigin(p, { ...game.origin, x: v }),
            ),
          0.05,
        )}
        {numeric(
          "Origin Y",
          game.origin.y,
          (v) =>
            edit("Sprite origin", (p) =>
              pf.setSpriteOrigin(p, { ...game.origin, y: v }),
            ),
          0.05,
        )}
      </div>
      <div className="panel-actions">
        <button
          onClick={() =>
            edit("Rectangle body", (p) =>
              pf.setCollisionBody(p, {
                type: "rectangle",
                x: 0,
                y: 0,
                width: p.width,
                height: p.height,
              }),
            )
          }
        >
          Rectangle body
        </button>
        <button
          onClick={() =>
            edit("Circle body", (p) =>
              pf.setCollisionBody(p, {
                type: "circle",
                x: 0,
                y: 0,
                radius: Math.max(
                  1,
                  Math.floor(Math.min(p.width, p.height) / 2),
                ),
              }),
            )
          }
        >
          Circle body
        </button>
        <button
          disabled={!game.body}
          onClick={() => edit("Clear body", pf.clearCollisionBody)}
        >
          Clear body
        </button>
      </div>
      {game.body && (
        <div className="rgba-fields">
          {Object.entries(game.body)
            .filter(([key]) => key !== "type")
            .map(([key, value]) =>
              numeric(`Body ${key}`, Number(value), (v) =>
                edit("Edit body", (p) =>
                  pf.setCollisionBody(p, {
                    ...game.body!,
                    [key]: v,
                  } as pf.CollisionBody),
                ),
              ),
            )}
        </div>
      )}
      <ScopeInput
        project={project}
        value={chosenScope ?? scope}
        label="New region scope"
        change={setChosenScope}
      />
      <div className="panel-actions">
        <button onClick={() => add("hitbox")}>Add hitbox</button>
        <button onClick={() => add("hurtbox")}>Add hurtbox</button>
      </div>
      {game.boxes.map((box) => (
        <details key={box.id}>
          <summary>
            {box.kind}: {box.name} ({box.scope.type})
          </summary>
          <ScopeInput
            project={project}
            value={box.scope}
            label={`${box.id} scope`}
            change={(scope) =>
              edit("Region scope", (p) =>
                pf.updateGameBox(p, box.id, { ...box, scope }),
              )
            }
          />
          <label>
            Name
            <input
              value={box.name}
              onChange={(e) =>
                edit("Rename region", (p) =>
                  pf.updateGameBox(p, box.id, { ...box, name: e.target.value }),
                )
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={box.enabled}
              onChange={(e) =>
                edit("Enable region", (p) =>
                  pf.updateGameBox(p, box.id, {
                    ...box,
                    enabled: e.target.checked,
                  }),
                )
              }
            />
            Enabled
          </label>
          <div className="rgba-fields">
            {Object.entries(box.rect).map(([key, value]) =>
              numeric(`${box.id} ${key}`, value, (v) =>
                edit("Edit region", (p) =>
                  pf.updateGameBox(p, box.id, {
                    ...box,
                    rect: { ...box.rect, [key]: v },
                  }),
                ),
              ),
            )}
          </div>
          <button
            onClick={() =>
              edit("Remove region", (p) => pf.removeGameBox(p, box.id))
            }
          >
            Remove {box.id}
          </button>
        </details>
      ))}
      <h2>Overlays</h2>
      <label>
        <input
          type="checkbox"
          checked={view.edit}
          onChange={(e) => setView({ ...view, edit: e.target.checked })}
        />
        Edit geometry on canvas
      </label>
      {(["collision", "hitbox", "hurtbox"] as const).map((kind) => (
        <label key={kind}>
          <input
            type="checkbox"
            checked={view[kind]}
            onChange={(e) => setView({ ...view, [kind]: e.target.checked })}
          />
          {kind} overlay
        </label>
      ))}
      <h2>Entry events</h2>
      <button
        disabled={!animation}
        onClick={() => {
          const id = prompt("Event ID"),
            name = id && prompt("Event name", id);
          if (id && name)
            edit("Set event", (p) =>
              pf.setAnimationEvent(p, { id, name, animation, index }),
            );
        }}
      >
        Add event marker
      </button>
      {game.events.map((event) => (
        <div key={event.id}>
          {event.name} · {event.animation}[{event.index}]
          <label>
            Event name
            <input
              aria-label={`${event.id} name`}
              value={event.name}
              onChange={(e) =>
                edit("Event name", (p) =>
                  pf.setAnimationEvent(p, { ...event, name: e.target.value }),
                )
              }
            />
          </label>
          <label>
            Animation
            <select
              value={event.animation}
              onChange={(e) =>
                edit("Event animation", (p) =>
                  pf.setAnimationEvent(p, {
                    ...event,
                    animation: e.target.value,
                    index: 0,
                  }),
                )
              }
            >
              {project.animations.map((a) => (
                <option key={a.name}>{a.name}</option>
              ))}
            </select>
          </label>
          {numeric(`${event.id} entry`, event.index, (v) =>
            edit("Event entry", (p) =>
              pf.setAnimationEvent(p, { ...event, index: v }),
            ),
          )}
          <button
            onClick={() =>
              edit("Remove event", (p) => pf.removeAnimationEvent(p, event.id))
            }
          >
            Remove {event.id}
          </button>
        </div>
      ))}
      <h2>Anchors</h2>
      <button
        onClick={() => {
          const id = prompt("Anchor ID");
          if (id)
            edit("Add anchor", (p) =>
              pf.setAnchor(p, { id, name: id, x: 0, y: 0, scope }),
            );
        }}
      >
        Add anchor
      </button>
      {game.anchors.map((anchor) => (
        <details key={anchor.id}>
          <summary>{anchor.name}</summary>
          {numeric(`${anchor.id} X`, anchor.x, (v) =>
            edit("Anchor X", (p) => pf.setAnchor(p, { ...anchor, x: v })),
          )}
          {numeric(`${anchor.id} Y`, anchor.y, (v) =>
            edit("Anchor Y", (p) => pf.setAnchor(p, { ...anchor, y: v })),
          )}
          <button
            onClick={() =>
              edit("Remove anchor", (p) => pf.removeAnchor(p, anchor.id))
            }
          >
            Remove anchor
          </button>
        </details>
      ))}
    </>
  );
}

function ScopeInput({
  project,
  value,
  label,
  change,
}: {
  project: pf.Project;
  value: pf.GameScope;
  label: string;
  change: (s: pf.GameScope) => void;
}) {
  const scopes: pf.GameScope[] = [
    { type: "project" },
    ...project.frames.map((f) => ({ type: "frame" as const, frameId: f.id })),
    ...project.animations.flatMap((a) => [
      { type: "animation" as const, animation: a.name },
      ...a.frames.map((_, index) => ({
        type: "entry" as const,
        animation: a.name,
        index,
      })),
    ]),
  ];
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={JSON.stringify(value)}
        onChange={(e) =>
          change(pf.gameScopeSchema.parse(JSON.parse(e.target.value)))
        }
      >
        {scopes.map((s) => (
          <option key={JSON.stringify(s)} value={JSON.stringify(s)}>
            {s.type === "project"
              ? "Project"
              : s.type === "frame"
                ? "Source " + s.frameId
                : s.type === "animation"
                  ? "Animation " + s.animation
                  : s.animation + " entry " + s.index}
          </option>
        ))}
      </select>
    </label>
  );
}
