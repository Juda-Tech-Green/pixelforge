import { useEffect, useRef, useState } from "react";
import {
  audioPresetNames,
  createSound,
  parseSound,
  serializeSound,
  type AudioMetrics,
  type Effect,
  type SoundProject,
  type Voice,
} from "@pixelforge/audio-core";
import { encodeWav } from "@pixelforge/audio-exporters";

function save(name: string, data: string | Uint8Array, type: string): void {
  const url = URL.createObjectURL(
    new Blob([typeof data === "string" ? data : Uint8Array.from(data).buffer], {
      type,
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function NumberField({
  label,
  value,
  change,
  min,
  max,
  step = "any",
}: {
  label: string;
  value: number;
  change: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          if (e.target.value !== "") change(e.target.valueAsNumber);
        }}
      />
    </label>
  );
}
function JsonField({
  label,
  value,
  commit,
}: {
  label: string;
  value: unknown;
  commit: (value: unknown) => boolean | void;
}) {
  const serialized = JSON.stringify(value, null, 2);
  const [text, setText] = useState(serialized);
  const [error, setError] = useState("");
  const draftDirty = useRef(false);
  useEffect(() => {
    if (!draftDirty.current) {
      setText(serialized);
      setError("");
    }
  }, [serialized]);
  return (
    <details className="audio-json">
      <summary>{label}</summary>
      <textarea
        aria-label={label}
        value={text}
        onChange={(e) => {
          draftDirty.current = true;
          setText(e.target.value);
        }}
        spellCheck={false}
      />
      <button
        onClick={() => {
          try {
            if (commit(JSON.parse(text)) !== false) {
              draftDirty.current = false;
              setError("");
            }
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        Apply {label.toLowerCase()}
      </button>
      <button
        onClick={() => {
          draftDirty.current = false;
          setText(serialized);
          setError("");
        }}
      >
        Reset draft
      </button>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
function Waveform({
  pcm,
  durationMs,
  position,
}: {
  pcm: Float64Array | null;
  durationMs: number;
  position: number;
}) {
  const ref = useRef<SVGSVGElement>(null),
    [width, setWidth] = useState(900);
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(280, entries[0]!.contentRect.width)),
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const plotWidth = width - 80,
    bins = Math.floor(plotWidth);
  let path = "";
  if (pcm)
    for (let x = 0; x < bins; x++) {
      const start = Math.floor((x * pcm.length) / bins),
        end = Math.max(start + 1, Math.floor(((x + 1) * pcm.length) / bins));
      let lo = 0,
        hi = 0;
      for (let n = start; n < end && n < pcm.length; n++) {
        lo = Math.min(lo, pcm[n]!);
        hi = Math.max(hi, pcm[n]!);
      }
      path += `M${60 + x},${150 - hi * 110}V${150 - lo * 110}`;
    }
  return (
    <svg
      ref={ref}
      className="audio-wave"
      viewBox={`0 0 ${width} 320`}
      role="img"
      aria-label="Sound waveform, amplitude from minus one to one, time in milliseconds"
    >
      {[40, 150, 260].map((y, i) => (
        <g key={y}>
          <line x1="60" x2={width - 20} y1={y} y2={y} className="wave-grid" />
          <text x="45" y={y + 4} textAnchor="end">
            {["1", "0", "−1"][i]}
          </text>
        </g>
      ))}
      {(width < 500 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((t) => (
        <g key={t}>
          <line
            x1={60 + t * plotWidth}
            x2={60 + t * plotWidth}
            y1="40"
            y2="260"
            className="wave-grid"
          />
          <text x={60 + t * plotWidth} y="286" textAnchor="middle">
            {Math.round(t * durationMs)}
          </text>
        </g>
      ))}
      <path d={path} className="wave-data" />
      <line
        x1={60 + position * plotWidth}
        x2={60 + position * plotWidth}
        y1="30"
        y2="265"
        className="wave-playhead"
      />
      <text x={60 + plotWidth / 2} y="310" textAnchor="middle">
        Time (ms)
      </text>
    </svg>
  );
}
export function AudioEditor() {
  const [project, setProject] = useState(() => createSound("Laser shot"));
  const dirty = useRef(false),
    [unsaved, setUnsaved] = useState(false),
    [documentSerial, setDocumentSerial] = useState(0);
  const markDirty = (value: boolean) => {
    dirty.current = value;
    setUnsaved(value);
  };
  const allowDiscard = () =>
    !dirty.current || window.confirm("Discard unsaved sound changes?");
  const replaceProject = (next: SoundProject) => {
    if (!allowDiscard()) return;
    setProject(next);
    setSelected(next.voices[0]!.id);
    markDirty(false);
    setDocumentSerial((n) => n + 1);
  };
  const [selected, setSelected] = useState("main");
  const [pcm, setPcm] = useState<Float64Array | null>(null),
    [metrics, setMetrics] = useState<AudioMetrics | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [playing, setPlaying] = useState(false),
    [position, setPosition] = useState(0);
  const worker = useRef<Worker | null>(null),
    serial = useRef(0),
    file = useRef<HTMLInputElement>(null);
  const context = useRef<AudioContext | null>(null),
    source = useRef<AudioBufferSourceNode | null>(null),
    started = useRef(0);
  const voice =
    project.voices.find((v) => v.id === selected) ?? project.voices[0]!;
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  function stop() {
    source.current?.stop();
    source.current = null;
    setPlaying(false);
    setPosition(0);
  }
  useEffect(() => {
    const instance = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = instance;
    instance.onmessage = (
      e: MessageEvent<{
        id: number;
        pcm?: Float64Array;
        metrics?: AudioMetrics;
        error?: string;
      }>,
    ) => {
      if (e.data.id !== serial.current) return;
      setBusy(false);
      setError(e.data.error ?? "");
      setPcm(e.data.pcm ?? null);
      setMetrics(e.data.metrics ?? null);
    };
    instance.onerror = (e) => {
      setError(e.message || "Audio worker failed. Reload the workspace.");
      setBusy(false);
    };
    return () => {
      instance.terminate();
      source.current?.stop();
      void context.current?.close();
    };
  }, []);
  useEffect(() => {
    stop();
    setBusy(true);
    setPcm(null);
    worker.current?.postMessage({ id: ++serial.current, project });
  }, [project]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      setPosition(
        Math.min(
          1,
          ((context.current?.currentTime ?? 0) - started.current) /
            (project.durationMs / 1000),
        ),
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, project.durationMs]);
  const update = (edit: (next: SoundProject) => void) => {
    try {
      const next = structuredClone(project);
      edit(next);
      setProject(parseSound(next));
      markDirty(true);
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  const editVoice = (edit: (v: Voice) => void) =>
    update((p) => {
      edit(p.voices.find((v) => v.id === voice.id)!);
    });
  async function play() {
    if (!pcm) return;
    try {
      stop();
      context.current ??= new AudioContext();
      await context.current.resume();
      const buffer = context.current.createBuffer(
        1,
        pcm.length,
        project.sampleRate,
      );
      buffer.copyToChannel(Float32Array.from(pcm), 0);
      const node = context.current.createBufferSource();
      node.buffer = buffer;
      node.connect(context.current.destination);
      node.onended = () => {
        if (source.current === node) {
          source.current = null;
          setPlaying(false);
          setPosition(0);
        }
      };
      source.current = node;
      started.current = context.current.currentTime;
      node.start();
      setPlaying(true);
    } catch (e) {
      setError(String(e));
    }
  }
  function addEffect(type: Effect["type"]) {
    update((p) => {
      const id = `effect_${crypto.randomUUID().slice(0, 8)}`;
      const effect =
        type === "delay"
          ? { id, type, delayMs: 75, feedback: 0.15, mix: 0.2 }
          : type === "distortion"
            ? { id, type, model: "tanh" }
            : { id, type, cutoffHz: 2000 };
      p.effects.push(effect as Effect);
    });
  }
  return (
    <div className="audio-editor">
      <header>
        <strong>
          PixelForge <span>Audio</span>
        </strong>
        <nav aria-label="Workspaces">
          <a
            href="/"
            onClick={(e) => {
              if (!allowDiscard()) e.preventDefault();
              else dirty.current = false;
            }}
          >
            Sprite editor
          </a>
          <a
            href="/audio.html"
            aria-current="page"
            onClick={(e) => e.preventDefault()}
          >
            Audio editor
          </a>
        </nav>
        <div className="audio-actions">
          {unsaved && <span role="status">Unsaved changes</span>}
          <button onClick={() => replaceProject(createSound("Untitled sound"))}>
            New sound
          </button>
          <button onClick={() => file.current?.click()}>Open sound</button>
          <button
            onClick={() => {
              save(
                `${project.id}.sound.json`,
                serializeSound(project),
                "application/json",
              );
              markDirty(false);
            }}
          >
            Save definition
          </button>
          <button
            disabled={!pcm || busy}
            onClick={() =>
              pcm &&
              save(
                `${project.id}.wav`,
                encodeWav(pcm, project.sampleRate),
                "audio/wav",
              )
            }
          >
            Render WAV
          </button>
          <input
            ref={file}
            hidden
            type="file"
            accept=".json,.sound.json"
            aria-label="Import sound definition"
            onChange={async (e) => {
              const item = e.target.files?.[0];
              if (!item) return;
              try {
                if (item.size > 1_048_576)
                  throw new Error("Sound definition exceeds 1 MiB");
                const next = parseSound(JSON.parse(await item.text()));
                replaceProject(next);
              } catch (err) {
                setError(String(err));
              }
              e.target.value = "";
            }}
          />
        </div>
      </header>
      {error && (
        <div className="audio-error" role="alert">
          <strong>Sound could not be updated.</strong>
          <pre>{error}</pre>
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      <div className="audio-layout">
        <aside className="audio-project">
          <h1>Sound project</h1>
          <label>
            Name
            <input
              value={project.name}
              onChange={(e) =>
                update((p) => {
                  p.name = e.target.value;
                })
              }
            />
          </label>
          <NumberField
            label="Duration (ms)"
            value={project.durationMs}
            min={1}
            max={10000}
            change={(value) =>
              update((p) => {
                p.durationMs = value;
              })
            }
          />
          <label>
            Sample rate
            <select
              value={project.sampleRate}
              onChange={(e) =>
                update((p) => {
                  p.sampleRate = Number(
                    e.target.value,
                  ) as SoundProject["sampleRate"];
                })
              }
            >
              {[22050, 44100, 48000].map((rate) => (
                <option key={rate} value={rate}>
                  {rate} Hz
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label="Seed"
            value={project.seed}
            min={0}
            max={4294967295}
            step={1}
            change={(value) =>
              update((p) => {
                p.seed = value;
              })
            }
          />
          <h2>Sound library</h2>
          <p className="audio-muted">
            Five editable starting points. Selecting one opens a new project.
          </p>
          {audioPresetNames.map((name) => (
            <button
              key={name}
              onClick={() => replaceProject(createSound(name, name))}
            >
              {name.replaceAll("-", " ")}
            </button>
          ))}
          <h2>Output</h2>
          <NumberField
            label="Master gain"
            value={project.output.gain}
            min={0}
            max={4}
            change={(value) =>
              update((p) => {
                p.output.gain = value;
              })
            }
          />
          <label>
            Clipping
            <select
              value={project.output.clipping}
              onChange={(e) =>
                update((p) => {
                  p.output.clipping = e.target.value as "error" | "hard";
                })
              }
            >
              <option value="error">Reject clipping</option>
              <option value="hard">Hard clip</option>
            </select>
          </label>
          <NumberField
            label="Boundary fade (ms)"
            value={project.output.fadeMs}
            min={0}
            max={20}
            change={(value) =>
              update((p) => {
                p.output.fadeMs = value;
              })
            }
          />
        </aside>
        <main className="audio-main">
          <section className="audio-preview" aria-label="Waveform and playback">
            <div className="audio-preview-heading">
              <h2>{project.name}</h2>
              <span className="audio-muted">Mono · PCM16 WAV</span>
            </div>
            <Waveform
              pcm={pcm}
              durationMs={project.durationMs}
              position={position}
            />
            <div className="audio-transport">
              <button
                className="audio-play"
                disabled={!pcm || busy}
                onClick={() => void play()}
              >
                {playing ? "Replay" : "Play sound"}
              </button>
              <button disabled={!playing} onClick={stop}>
                Stop
              </button>
              <output aria-live="polite">
                {busy
                  ? "Rendering…"
                  : metrics
                    ? `${metrics.samples.toLocaleString()} samples · ${(project.durationMs / 1000).toFixed(3)} s`
                    : "No rendered audio"}
              </output>
            </div>
            {metrics && (
              <dl className="audio-metrics">
                <div>
                  <dt>Peak</dt>
                  <dd>{metrics.peak.toFixed(4)}</dd>
                </div>
                <div>
                  <dt>RMS</dt>
                  <dd>{metrics.rms.toFixed(4)}</dd>
                </div>
                <div>
                  <dt>Clipped samples</dt>
                  <dd>{metrics.clippedSamples}</dd>
                </div>
                <div>
                  <dt>Signal</dt>
                  <dd>{metrics.silent ? "Silent" : "Present"}</dd>
                </div>
              </dl>
            )}
            {metrics && metrics.clippedSamples > 0 && (
              <p role="status">
                Clipping detected. Lower voice or master gain for a clean
                export.
              </p>
            )}
          </section>
          <section className="audio-effects">
            <h2>Effects chain</h2>
            <p className="audio-muted">
              Processed from top to bottom, after voice mixing.
            </p>
            {project.effects.length === 0 && (
              <p>No effects. The mixed voices pass directly to output.</p>
            )}
            {project.effects.map((effect, i) => (
              <div className="audio-effect" key={effect.id}>
                <div className="audio-effect-title">
                  <strong>
                    {i + 1}. {effect.type}
                  </strong>
                  <div>
                    <button
                      aria-label={`Move ${effect.id} earlier`}
                      disabled={i === 0}
                      onClick={() =>
                        update((p) => {
                          [p.effects[i - 1], p.effects[i]] = [
                            p.effects[i]!,
                            p.effects[i - 1]!,
                          ];
                        })
                      }
                    >
                      Earlier
                    </button>
                    <button
                      aria-label={`Move ${effect.id} later`}
                      disabled={i === project.effects.length - 1}
                      onClick={() =>
                        update((p) => {
                          [p.effects[i + 1], p.effects[i]] = [
                            p.effects[i]!,
                            p.effects[i + 1]!,
                          ];
                        })
                      }
                    >
                      Later
                    </button>
                    <button
                      aria-label={`Remove ${effect.id}`}
                      onClick={() =>
                        update((p) => {
                          p.effects.splice(i, 1);
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {"cutoffHz" in effect && (
                  <NumberField
                    label="Cutoff (Hz)"
                    value={effect.cutoffHz}
                    change={(value) =>
                      update((p) => {
                        const e = p.effects[i]!;
                        if ("cutoffHz" in e) e.cutoffHz = value;
                      })
                    }
                  />
                )}
                {effect.type === "delay" && (
                  <>
                    {(["delayMs", "feedback", "mix"] as const).map((key) => (
                      <NumberField
                        key={key}
                        label={key === "delayMs" ? "Delay (ms)" : key}
                        value={effect[key]}
                        change={(value) =>
                          update((p) => {
                            const e = p.effects[i]!;
                            if (e.type === "delay") e[key] = value;
                          })
                        }
                      />
                    ))}
                  </>
                )}
                {effect.type === "distortion" && (
                  <>
                    <label>
                      Transfer model
                      <select
                        value={effect.model}
                        onChange={(event) =>
                          update((p) => {
                            const e = p.effects[i]!;
                            if (e.type === "distortion")
                              e.model = event.target.value as typeof e.model;
                          })
                        }
                      >
                        {["tanh", "hard", "asymmetric", "logarithmic"].map(
                          (model) => (
                            <option key={model}>{model}</option>
                          ),
                        )}
                      </select>
                    </label>
                    {(["inputGain", "outputGain", "mix"] as const).map(
                      (key) => (
                        <NumberField
                          key={key}
                          label={key}
                          value={effect[key]}
                          change={(value) =>
                            update((p) => {
                              const e = p.effects[i]!;
                              if (e.type === "distortion") e[key] = value;
                            })
                          }
                        />
                      ),
                    )}
                  </>
                )}
                <JsonField
                  key={`${documentSerial}:${effect.id}`}
                  label="Effect parameters"
                  value={effect}
                  commit={(value) =>
                    update((p) => {
                      p.effects[i] = value as Effect;
                    })
                  }
                />
              </div>
            ))}
            <div className="audio-add-effects">
              {(["lowpass", "highpass", "delay", "distortion"] as const).map(
                (type) => (
                  <button
                    key={type}
                    disabled={project.effects.length >= 16}
                    onClick={() => addEffect(type)}
                  >
                    Add {type}
                  </button>
                ),
              )}
            </div>
          </section>
        </main>
        <aside className="audio-inspector">
          <h2>Voices</h2>
          <div className="audio-voice-list">
            {project.voices.map((v) => (
              <button
                key={v.id}
                aria-pressed={v.id === voice.id}
                onClick={() => setSelected(v.id)}
              >
                {v.id}
                <small>{v.type}</small>
              </button>
            ))}
          </div>
          <div className="audio-voice-actions">
            <button
              disabled={project.voices.length >= 32}
              onClick={() =>
                update((p) => {
                  const v = structuredClone(voice);
                  v.id = `voice_${crypto.randomUUID().slice(0, 8)}`;
                  p.voices.push(v);
                  setSelected(v.id);
                })
              }
            >
              Duplicate voice
            </button>
            <button
              disabled={project.voices.length <= 1}
              onClick={() =>
                update((p) => {
                  p.voices = p.voices.filter((v) => v.id !== voice.id);
                  setSelected(p.voices[0]!.id);
                })
              }
            >
              Remove voice
            </button>
          </div>
          <h2>{voice.id}</h2>
          <NumberField
            label="Gain"
            value={voice.gain}
            min={0}
            max={4}
            change={(value) =>
              editVoice((v) => {
                v.gain = value;
              })
            }
          />
          <NumberField
            label="Phase (cycles)"
            value={voice.phase}
            min={0}
            max={1}
            change={(value) =>
              editVoice((v) => {
                v.phase = value;
              })
            }
          />
          {voice.type === "oscillator" && (
            <label>
              Waveform
              <select
                value={voice.waveform}
                onChange={(e) =>
                  editVoice((v) => {
                    if (v.type === "oscillator")
                      v.waveform = e.target.value as typeof v.waveform;
                  })
                }
              >
                {["sine", "triangle", "sawtooth", "square", "pulse"].map(
                  (w) => (
                    <option key={w}>{w}</option>
                  ),
                )}
              </select>
            </label>
          )}
          {"frequency" in voice && (
            <>
              <NumberField
                label="Start frequency (Hz)"
                value={voice.frequency.startHz}
                change={(value) =>
                  editVoice((v) => {
                    if ("frequency" in v) v.frequency.startHz = value;
                  })
                }
              />
              <NumberField
                label="End frequency (Hz)"
                value={voice.frequency.endHz}
                change={(value) =>
                  editVoice((v) => {
                    if ("frequency" in v) v.frequency.endHz = value;
                  })
                }
              />
              <label>
                Sweep
                <select
                  value={voice.frequency.curve}
                  onChange={(e) =>
                    editVoice((v) => {
                      if ("frequency" in v)
                        v.frequency.curve = e.target.value as
                          "linear" | "exponential";
                    })
                  }
                >
                  <option>linear</option>
                  <option>exponential</option>
                </select>
              </label>
            </>
          )}
          {voice.type === "damped" && (
            <NumberField
              label="Decay (1/s)"
              value={voice.decay}
              change={(value) =>
                editVoice((v) => {
                  if (v.type === "damped") v.decay = value;
                })
              }
            />
          )}
          {voice.type === "nonlinear" &&
            (["sigma", "cReal", "cImag", "initialAmplitude"] as const).map(
              (key) => (
                <NumberField
                  key={key}
                  label={key}
                  value={voice[key]}
                  change={(value) =>
                    editVoice((v) => {
                      if (v.type === "nonlinear") v[key] = value;
                    })
                  }
                />
              ),
            )}
          <JsonField
            key={`envelope:${documentSerial}:${voice.id}`}
            label="Envelope"
            value={voice.envelope}
            commit={(value) =>
              editVoice((v) => {
                v.envelope = value as Voice["envelope"];
              })
            }
          />
          <JsonField
            key={`voice:${documentSerial}:${voice.id}`}
            label="Voice parameters"
            value={voice}
            commit={(value) =>
              update((p) => {
                p.voices[p.voices.findIndex((v) => v.id === voice.id)] =
                  value as Voice;
              })
            }
          />
          <p className="audio-muted">
            Changes render locally. Playback starts only when you press Play
            sound.
          </p>
        </aside>
      </div>
    </div>
  );
}
