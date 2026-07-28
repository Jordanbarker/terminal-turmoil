import { describe, it, expect } from "vitest";
import { execute } from "@tt/core/snowflake/executor/executor";
import { createDefaultContext } from "@tt/core/snowflake/session/context";
import { createInitialSnowflakeState } from "../../data/snowflake/initial_data";
import { ALL_ITEMS } from "../menuItems";

/**
 * Chip quotes a real `snow sql` transcript when asked about the team. If the
 * EMPLOYEES seed drifts (a name, a department, a headcount, an employee id) or
 * the query stops being schema-qualified, the in-game answer becomes a lie the
 * player can disprove in one command. This suite runs the query Chip claims to
 * have run, from the same default session the game starts in, and diffs the
 * result against the roster Chip prints.
 */

function responseText(id: string): string {
  const item = ALL_ITEMS.find((i) => i.id === id);
  if (!item) throw new Error(`no chip menu item '${id}'`);
  if (typeof item.response !== "string") throw new Error(`chip item '${id}' has a dynamic response`);
  return item.response;
}

/** The `$ snow sql -q "<sql>"` line inside a response, unwrapped to bare SQL. */
function quotedQuery(text: string): string {
  const line = text.split("\n").find((l) => l.startsWith("$ snow sql -q "));
  if (!line) throw new Error("no `$ snow sql -q` transcript line");
  const match = line.match(/^\$ snow sql -q "(.+)"$/);
  if (!match) throw new Error(`unparsable transcript line: ${line}`);
  return match[1];
}

/** Run SQL through the real engine using the session the game boots with. */
function runQuery(sql: string) {
  const result = execute(sql, createInitialSnowflakeState(), createDefaultContext());
  const first = result.results[0];
  if (first.type !== "resultset") {
    throw new Error(`query failed: ${first.type === "error" ? first.message : first.type}`);
  }
  return first.data;
}

const teamText = responseText("team");

describe("chip: tell me about the team", () => {
  it("quotes a query that succeeds from the default ANALYTICS session", () => {
    // The default schema is empty, so an unqualified `FROM employees` dead-ends.
    expect(() => runQuery(quotedQuery(teamText))).not.toThrow();
  });

  it("prints exactly the rows that query returns, in order", () => {
    const rs = runQuery(quotedQuery(teamText));
    const nameIdx = rs.columns.findIndex((c) => c.name === "FULL_NAME");
    const deptIdx = rs.columns.findIndex((c) => c.name === "DEPARTMENT");
    const expected = rs.rows.map((r) => [String(r[nameIdx]), String(r[deptIdx])]);

    // Chip's roster lines are the two-space-indented "Name<pad>Department" block.
    const printed = teamText
      .split("\n")
      .filter((l) => /^ {2}\S/.test(l))
      .map((l) => {
        const [, name, dept] = l.match(/^ {2}(.+?) {2,}(.+)$/) ?? [];
        return [name, dept];
      });

    expect(printed).toEqual(expected);
  });

  it("states a headcount matching the active roster", () => {
    const rs = runQuery(quotedQuery(teamText));
    expect(teamText).toContain(`${rs.rows.length} people`);
  });
});

describe("chip: employee facts match the warehouse", () => {
  it("cites Jin Chen's real EMPLOYEE_ID", () => {
    const rs = runQuery("SELECT employee_id FROM raw_nexacorp.employees WHERE full_name = 'Jin Chen'");
    expect(rs.rows).toHaveLength(1);
    expect(responseText("jchen")).toContain(`Employee ID ${String(rs.rows[0][0])},`);
  });

  it("gives a company size of the active roster plus the player", () => {
    const rs = runQuery("SELECT count(*) FROM raw_nexacorp.employees WHERE status = 'active'");
    const headcount = Number(rs.rows[0][0]) + 1;
    expect(responseText("nexacorp")).toContain(`${headcount} people counting you`);
  });
});
