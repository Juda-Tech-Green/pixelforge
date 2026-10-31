import { fromDocument, serializeProject, type Project } from "@pixelforge/core";

interface Entry {
  text: string;
  bytes: number;
  label: string;
}
/** Immutable serialized checkpoints: one per completed gesture, never per pixel. */
export class EditorHistory {
  private past: Entry[] = [];
  private future: Entry[] = [];
  private saved: string;
  private current: Entry;
  constructor(
    project: Project,
    readonly maxEntries = 50,
    readonly maxBytes = 32 * 1024 * 1024,
  ) {
    if (
      !Number.isInteger(maxEntries) ||
      maxEntries < 1 ||
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 1
    )
      throw new Error("History budgets must be positive integers");
    this.current = this.snapshot(project, "Open project");
    this.saved = this.current.text;
  }
  private snapshot(p: Project, label: string): Entry {
    const text = serializeProject(p);
    return { text, bytes: text.length * 2, label };
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  get dirty(): boolean {
    return this.saved !== this.current.text;
  }
  get retainedBytes(): number {
    return [...this.past, ...this.future].reduce((sum, e) => sum + e.bytes, 0);
  }
  get undoLabel(): string {
    return this.current.label;
  }
  get redoLabel(): string {
    return this.future.at(-1)?.label ?? "";
  }
  project(): Project {
    return fromDocument(JSON.parse(this.current.text));
  }
  commit(project: Project, label: string): boolean {
    const next = this.snapshot(project, label);
    if (next.text === this.current.text) return false;
    this.past.push(this.current);
    this.current = next;
    this.future = [];
    this.trim();
    return true;
  }
  private trim(): void {
    while (
      this.past.length + this.future.length > this.maxEntries ||
      this.retainedBytes > this.maxBytes
    ) {
      if (this.past.length) this.past.shift();
      else if (this.future.length) this.future.shift();
      else break;
    }
  }
  undo(): Project {
    if (this.canUndo) {
      this.future.push(this.current);
      this.current = this.past.pop()!;
      this.trim();
    }
    return this.project();
  }
  redo(): Project {
    if (this.canRedo) {
      this.past.push(this.current);
      this.current = this.future.pop()!;
      this.trim();
    }
    return this.project();
  }
  markSaved(): void {
    this.saved = this.current.text;
  }
  replace(project: Project): Project {
    const next = this.snapshot(project, "Open project");
    this.current = next;
    this.saved = next.text;
    this.past = [];
    this.future = [];
    return this.project();
  }
}
