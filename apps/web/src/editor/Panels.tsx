import { useEffect, useState } from "react";
import * as pf from "@pixelforge/core";
export type Edit = (label: string, action: (p: pf.Project) => void) => boolean;
export function uniqueId(ids: string[], prefix: string): string {
  let i = 1;
  while (ids.includes(`${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
}
export function reordered<T>(items: T[], index: number, delta: number): T[] {
  const copy = [...items],
    destination = index + delta;
  if (destination < 0 || destination >= items.length) return copy;
  [copy[index], copy[destination]] = [copy[destination]!, copy[index]!];
  return copy;
}
export function LayerPanel({
  project,
  layer,
  select,
  edit,
}: {
  project: pf.Project;
  layer: string;
  select: (id: string) => void;
  edit: Edit;
}) {
  const current = pf.getLayer(project, layer),
    index = project.layers.findIndex((l) => l.id === layer);
  return (
    <>
      <h2>Layers</h2>
      <p className="hint">Top layer first. Hidden layers cannot be painted.</p>
      {[...project.layers].reverse().map((l) => (
        <div className="layer-row" key={l.id}>
          <button aria-pressed={layer === l.id} onClick={() => select(l.id)}>
            {l.name}
          </button>
          <input
            type="checkbox"
            aria-label={`Show ${l.name}`}
            checked={l.visible}
            onChange={(e) =>
              edit("Layer visibility", (p) =>
                pf.setLayerVisibility(p, l.id, e.target.checked),
              )
            }
          />
        </div>
      ))}
      <div className="panel-actions">
        <button
          onClick={() => {
            const name = prompt("Layer name", "New layer");
            if (!name) return;
            const id = uniqueId(
              project.layers.map((l) => l.id),
              "layer",
            );
            if (edit("Add layer", (p) => pf.createLayer(p, id, name)))
              select(id);
          }}
        >
          Add layer
        </button>
        <button
          onClick={() => {
            const name = prompt("Rename layer", current.name);
            if (name)
              edit("Rename layer", (p) => pf.renameLayer(p, layer, name));
          }}
        >
          Rename layer
        </button>
        <button
          disabled={project.layers.length === 1}
          onClick={() => edit("Delete layer", (p) => pf.removeLayer(p, layer))}
        >
          Delete layer
        </button>
        <button
          disabled={index === project.layers.length - 1}
          onClick={() =>
            edit("Raise layer", (p) =>
              pf.reorderLayers(
                p,
                reordered(
                  p.layers.map((l) => l.id),
                  index,
                  1,
                ),
              ),
            )
          }
        >
          Raise layer
        </button>
        <button
          disabled={index === 0}
          onClick={() =>
            edit("Lower layer", (p) =>
              pf.reorderLayers(
                p,
                reordered(
                  p.layers.map((l) => l.id),
                  index,
                  -1,
                ),
              ),
            )
          }
        >
          Lower layer
        </button>
      </div>
    </>
  );
}
export function PalettePanel({
  project,
  color,
  select,
  edit,
}: {
  project: pf.Project;
  color: number;
  select: (index: number) => void;
  edit: Edit;
}) {
  const selected = project.palette[color]!;
  const [hex, setHex] = useState("");
  const [rgba, setRgba] = useState<pf.Color>([...selected]);
  useEffect(() => {
    setRgba([...selected]);
    setHex("#" + selected.map((v) => v.toString(16).padStart(2, "0")).join(""));
  }, [project, color]);
  return (
    <>
      <h2>Palette</h2>
      <div className="editor-palette">
        {project.palette.map((c, i) => (
          <button
            title={`Index ${i}: ${c.join(", ")}`}
            aria-label={`Color ${i}`}
            aria-pressed={color === i}
            key={i}
            onClick={() => select(i)}
            style={{
              backgroundColor: `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`,
            }}
          >
            {i}
          </button>
        ))}
      </div>
      <p>
        Index {color}
        {color === 0 ? " · Reserved transparent" : ""}
      </p>
      <div className="rgba-fields">
        {["R", "G", "B", "A"].map((label, i) => (
          <label key={label}>
            {label}
            <input
              aria-label={label}
              type="number"
              min="0"
              max="255"
              disabled={color === 0}
              value={rgba[i]}
              onChange={(e) => {
                const next = [...rgba] as pf.Color;
                next[i] = Number(e.target.value);
                setRgba(next);
              }}
            />
          </label>
        ))}
      </div>
      <button
        disabled={color === 0}
        onClick={() =>
          edit("Edit RGBA", (p) => pf.updatePaletteColor(p, color, rgba))
        }
      >
        Apply RGBA
      </button>
      <label>
        Hex RGBA
        <input
          aria-label="Hex RGBA"
          value={hex}
          disabled={color === 0}
          onChange={(e) => setHex(e.target.value)}
        />
      </label>
      <button
        disabled={color === 0}
        onClick={() =>
          edit("Edit hex color", (p) => {
            if (!/^#[\da-f]{6}([\da-f]{2})?$/i.test(hex))
              throw new Error("Use #RRGGBB or #RRGGBBAA");
            const value = hex.length === 7 ? hex + "ff" : hex;
            pf.updatePaletteColor(
              p,
              color,
              [1, 3, 5, 7].map((i) =>
                parseInt(value.slice(i, i + 2), 16),
              ) as pf.Color,
            );
          })
        }
      >
        Apply hex
      </button>
      <div className="panel-actions">
        <button
          disabled={project.palette.length === 256}
          onClick={() => {
            const index = project.palette.length;
            edit("Add color", (p) =>
              pf.addPaletteColor(p, [255, 128, 64, 255]),
            );
            select(index);
          }}
        >
          Add color
        </button>
        <button
          disabled={color === 0}
          onClick={() =>
            edit("Remove unused color", (p) => pf.removePaletteColor(p, color))
          }
        >
          Remove unused color
        </button>
      </div>
    </>
  );
}
