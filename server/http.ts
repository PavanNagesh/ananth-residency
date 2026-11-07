import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";

export type CustomerVar = { id: number; phone: string; name: string };
export type StaffVar = { id: number; name: string; phone: string; role: "owner" | "staff" };

export type AppEnv = {
  Variables: {
    customer: CustomerVar;
    staff: StaffVar;
  };
};

/** An error whose message is safe to show the user. */
export class HttpError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what = "That item") => new HttpError(404, `${what} could not be found. It may have been removed.`);

/** Parses and validates a JSON body; 400 for malformed JSON, 422 with per-field messages for invalid data. */
export async function body<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, "The request was not valid JSON. Refresh the page and try again.");
  }
  return validate(schema, raw);
}

export function validate<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      // Zod's built-in type messages ("Invalid input: expected string…") are not for people.
      const message = issue.code === "invalid_type" ? "Fill in this field." : issue.message;
      fields[key] ??= message;
    }
    const first = Object.values(fields)[0] ?? "Some details are missing or invalid.";
    throw new HttpError(422, first, fields);
  }
  return result.data;
}

export function idParam(c: Context, name = "id"): number {
  const n = Number(c.req.param(name));
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
}
