import { useMemo, useState } from "react";
import {
  assemblePhaserBundle,
  type Project,
  type BundleOptions,
} from "@pixelforge/core";
import { savePhaserBundle } from "./export.js";
export function PhaserExport({
  project,
  error,
}: {
  project: Project;
  error: (message: string) => void;
}) {
  const [options, setOptions] = useState<BundleOptions>({
      name: "character",
      layout: "atlas",
      padding: 1,
      maxWidth: 2048,
      maxHeight: 2048,
      columns: 4,
      powerOfTwo: false,
      includeGame: true,
      includeAnimations: true,
    }),
    [busy, setBusy] = useState(false);
  const preview = useMemo(() => {
    try {
      return { bundle: assemblePhaserBundle(project, options), error: "" };
    } catch (e) {
      return { bundle: undefined, error: String(e) };
    }
  }, [project, options]);
  return (
    <details>
      <summary>Phaser export</summary>
      <label>
        Filename
        <input
          aria-label="Phaser filename"
          value={options.name}
          onChange={(e) => setOptions({ ...options, name: e.target.value })}
        />
      </label>
      <label>
        Layout
        <select
          aria-label="Phaser layout"
          value={options.layout}
          onChange={(e) =>
            setOptions({
              ...options,
              layout: e.target.value as "atlas" | "spritesheet",
            })
          }
        >
          <option value="atlas">Texture atlas</option>
          <option value="spritesheet">Fixed spritesheet</option>
        </select>
      </label>
      {(["padding", "maxWidth", "maxHeight", "columns"] as const).map((key) => (
        <label key={key}>
          {key}
          <input
            aria-label={`Phaser ${key}`}
            type="number"
            value={options[key]}
            onChange={(e) =>
              setOptions({ ...options, [key]: Number(e.target.value) })
            }
          />
        </label>
      ))}
      {(["powerOfTwo", "includeGame", "includeAnimations"] as const).map(
        (key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={options[key]}
              onChange={(e) =>
                setOptions({ ...options, [key]: e.target.checked })
              }
            />
            {key}
          </label>
        ),
      )}
      {preview.bundle ? (
        <p className="hint">
          {project.frames.length} source frames · {project.animations.length}{" "}
          animations · {preview.bundle.raster.width} ×{" "}
          {preview.bundle.raster.height} ·{" "}
          {(
            (100 * preview.bundle.unusedArea) /
            (preview.bundle.raster.width * preview.bundle.raster.height)
          ).toFixed(1)}
          % unused
          <br />
          {[
            preview.bundle.manifest.texture,
            ...Object.keys(preview.bundle.files),
          ].join(", ")}
        </p>
      ) : (
        <p role="status">{preview.error}</p>
      )}
      <button
        disabled={busy || !preview.bundle}
        onClick={() => {
          setBusy(true);
          void savePhaserBundle(project, options)
            .catch((e) => error(String(e)))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Encoding…" : "Download Phaser bundle"}
      </button>
      <p className="hint">
        Allow multiple downloads in your browser. Keep files together in one
        directory.
      </p>
    </details>
  );
}
