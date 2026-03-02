import { SessionContext } from "../session/context";

/**
 * Resolve a 1-, 2-, or 3-part name (e.g. ["table"], ["schema","table"], ["db","schema","table"])
 * into a fully-qualified [database, schema, table] tuple using session defaults.
 */
export function resolveThreePart(parts: string[], ctx: SessionContext): [string, string, string] {
  if (parts.length === 3) return [parts[0].toUpperCase(), parts[1].toUpperCase(), parts[2].toUpperCase()];
  if (parts.length === 2) return [ctx.currentDatabase.toUpperCase(), parts[0].toUpperCase(), parts[1].toUpperCase()];
  return [ctx.currentDatabase.toUpperCase(), ctx.currentSchema.toUpperCase(), parts[0].toUpperCase()];
}
