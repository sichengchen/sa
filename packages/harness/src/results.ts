import { Value } from "@sinclair/typebox/value";
import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

export interface TypedResult<T = unknown> {
  raw: string;
  parsed: T;
  schemaJson: unknown;
}

export function schemaToJsonSchema(schema: unknown): unknown {
  if (isValibotSchema(schema)) return toJsonSchema(schema);
  if (isZodSchema(schema)) return schema.toJSONSchema?.() ?? schema._def ?? {};
  return schema;
}

export function buildResultPrompt(schema: unknown): string {
  return [
    "Return the final structured result between these delimiters:",
    "---RESULT_START---",
    "<json>",
    "---RESULT_END---",
    "The JSON Schema is:",
    JSON.stringify(schemaToJsonSchema(schema), null, 2),
  ].join("\n");
}

export function parseTypedResult<T = unknown>(text: string, schema: unknown): TypedResult<T> {
  const raw = extractResultBlock(text);
  const parsedJson = JSON.parse(raw);
  const parsed = validateSchema<T>(schema, parsedJson);
  return { raw, parsed, schemaJson: schemaToJsonSchema(schema) };
}

export function extractResultBlock(text: string): string {
  const matches = [...text.matchAll(/---RESULT_START---\s*([\s\S]*?)\s*---RESULT_END---/g)];
  const block = matches.at(-1)?.[1]?.trim();
  if (!block) throw new Error("No structured result block found.");
  return block;
}

function validateSchema<T>(schema: unknown, value: unknown): T {
  if (isValibotSchema(schema)) {
    const parsed = v.safeParse(schema, value);
    if (!parsed.success)
      throw new Error(
        `Valibot result validation failed: ${parsed.issues.map((issue) => issue.message).join(", ")}`,
      );
    return parsed.output as T;
  }
  if (isZodSchema(schema)) {
    const parsed = schema.safeParse(value);
    if (!parsed.success)
      throw new Error(`Zod result validation failed: ${parsed.error?.message ?? "invalid result"}`);
    return parsed.data as T;
  }
  if (isTypeBoxSchema(schema)) {
    if (!Value.Check(schema as never, value)) throw new Error("TypeBox result validation failed.");
    return value as T;
  }
  return value as T;
}

function isValibotSchema(schema: unknown): schema is v.GenericSchema {
  return Boolean(
    schema && typeof schema === "object" && "~standard" in schema && "async" in schema,
  );
}

function isZodSchema(schema: unknown): schema is {
  safeParse: (value: unknown) => { success: boolean; data?: unknown; error?: { message: string } };
  toJSONSchema?: () => unknown;
  _def?: unknown;
} {
  return Boolean(schema && typeof schema === "object" && "safeParse" in schema);
}

function isTypeBoxSchema(schema: unknown): boolean {
  return Boolean(schema && typeof schema === "object" && Symbol.for("TypeBox.Kind") in schema);
}
