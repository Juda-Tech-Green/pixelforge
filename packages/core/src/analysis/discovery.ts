import { z } from "zod";
import { operationSchema } from "../operations/batch.js";
type Node = Record<string, unknown>;
function node(value: unknown): Node {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Node)
    : {};
}
function sample(value: unknown, key = ""): unknown {
  const s = node(value);
  if ("const" in s) return s.const;
  if (Array.isArray(s.enum)) return s.enum[0];
  const alternatives = s.anyOf ?? s.oneOf;
  if (Array.isArray(alternatives)) return sample(alternatives[0], key);
  if (s.type === "object") {
    const properties = node(s.properties),
      required = Array.isArray(s.required) ? s.required : [];
    return Object.fromEntries(
      Object.entries(properties)
        .filter(([name]) => required.includes(name))
        .map(([name, child]) => [name, sample(child, name)]),
    );
  }
  if (s.type === "array") {
    if (Array.isArray(s.prefixItems))
      return s.prefixItems.map((item) => sample(item, key));
    return Array.from(
      { length: typeof s.minItems === "number" ? Math.max(1, s.minItems) : 1 },
      () => sample(s.items, key),
    );
  }
  if (s.type === "boolean") return true;
  if (s.type === "integer" || s.type === "number")
    return typeof s.exclusiveMinimum === "number"
      ? Math.max(0, Math.floor(s.exclusiveMinimum) + 1)
      : typeof s.minimum === "number"
        ? Math.max(0, s.minimum)
        : 0;
  if (s.type === "string")
    return (
      (
        {
          frame: "frame-0",
          frameId: "frame-0",
          source: "frame-0",
          layer: "base",
          name: "idle",
          animation: "idle",
        } as Record<string, string>
      )[key] ?? "example"
    );
  return null;
}
export function listOperations() {
  return operationSchema.options.map((option) => option.shape.op.value);
}
export function describeOperation(name: string) {
  const option = operationSchema.options.find(
    (option) => option.shape.op.value === name,
  );
  if (!option)
    throw new Error(`Unknown operation ${name}; run operations list`);
  const schema = z.toJSONSchema(option, { target: "draft-2020-12" }),
    properties = node(schema.properties),
    required = Array.isArray(schema.required) ? schema.required : [];
  const example = sample(schema);
  option.parse(example);
  return {
    name,
    fields: Object.entries(properties).map(([name, schema]) => ({
      name,
      required: required.includes(name),
      schema,
    })),
    schema,
    example,
    semantics: {
      references:
        "frame/source/frameId identify source frames; layer identifies a project layer; animation/name identify named sequences. Referenced identifiers must exist unless this operation creates them.",
      coordinates:
        "Integer canvas coordinates, top-left origin. setPixel/clearPixel/floodFill are strict; shape drawing clips. Sizes and movement follow the operations reference.",
      palette:
        "color/from/to are palette indices0..255 and must exist in the project. Index0 is transparent.",
      example:
        "Schema-valid minimal shape; adapt identifiers, colors, geometry and scope to your inspected project. Removal/reorder operations require existing targets.",
    },
  };
}
