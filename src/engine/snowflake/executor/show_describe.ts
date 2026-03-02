import { SnowflakeState } from "../state";
import * as AST from "../parser/ast";
import { QueryResult, ResultSet } from "../formatter/result_types";
import { SessionContext } from "../session/context";
import { resolveThreePart } from "./resolve";

export function executeShow(stmt: AST.ShowStatement, state: SnowflakeState, ctx: SessionContext): QueryResult {
  switch (stmt.objectType) {
    case "DATABASES": {
      const dbs = state.listDatabases();
      const rs: ResultSet = {
        columns: [
          { name: "name", type: "VARCHAR" },
          { name: "created_on", type: "TIMESTAMP" },
        ],
        rows: dbs.map((d) => [d, new Date("2026-02-03")]),
        rowCount: dbs.length,
      };
      return { type: "resultset", data: rs };
    }

    case "SCHEMAS": {
      const db = (stmt.inDatabase ?? ctx.currentDatabase).toUpperCase();
      const schemas = state.listSchemas(db);
      const filtered = stmt.like ? schemas.filter((s) => likeMatch(s, stmt.like!)) : schemas;
      const rs: ResultSet = {
        columns: [
          { name: "name", type: "VARCHAR" },
          { name: "database_name", type: "VARCHAR" },
        ],
        rows: filtered.map((s) => [s, db]),
        rowCount: filtered.length,
      };
      return { type: "resultset", data: rs };
    }

    case "TABLES": {
      const db = (stmt.inDatabase ?? ctx.currentDatabase).toUpperCase();
      const schema = (stmt.inSchema ?? ctx.currentSchema).toUpperCase();
      const tables = state.listTables(db, schema);
      const filtered = stmt.like ? tables.filter((t) => likeMatch(t.name, stmt.like!)) : tables;
      const rs: ResultSet = {
        columns: [
          { name: "name", type: "VARCHAR" },
          { name: "database_name", type: "VARCHAR" },
          { name: "schema_name", type: "VARCHAR" },
          { name: "rows", type: "NUMBER" },
        ],
        rows: filtered.map((t) => [t.name, db, schema, t.rows.length]),
        rowCount: filtered.length,
      };
      return { type: "resultset", data: rs };
    }

    case "VIEWS": {
      const db = (stmt.inDatabase ?? ctx.currentDatabase).toUpperCase();
      const schema = (stmt.inSchema ?? ctx.currentSchema).toUpperCase();
      const views = state.listViews(db, schema);
      const rs: ResultSet = {
        columns: [
          { name: "name", type: "VARCHAR" },
          { name: "database_name", type: "VARCHAR" },
          { name: "schema_name", type: "VARCHAR" },
        ],
        rows: views.map((v) => [v.name, db, schema]),
        rowCount: views.length,
      };
      return { type: "resultset", data: rs };
    }

    case "COLUMNS": {
      const db = (stmt.inDatabase ?? ctx.currentDatabase).toUpperCase();
      const schema = (stmt.inSchema ?? ctx.currentSchema).toUpperCase();
      const tables = state.listTables(db, schema);
      const rows: (string | number | null)[][] = [];
      for (const t of tables) {
        for (const col of t.columns) {
          rows.push([t.name, col.name, col.type, col.nullable ? "Y" : "N"]);
        }
      }
      return {
        type: "resultset",
        data: {
          columns: [
            { name: "table_name", type: "VARCHAR" },
            { name: "column_name", type: "VARCHAR" },
            { name: "data_type", type: "VARCHAR" },
            { name: "is_nullable", type: "VARCHAR" },
          ],
          rows,
          rowCount: rows.length,
        },
      };
    }

    case "WAREHOUSES": {
      const whs = state.listWarehouses();
      const rs: ResultSet = {
        columns: [
          { name: "name", type: "VARCHAR" },
          { name: "size", type: "VARCHAR" },
          { name: "state", type: "VARCHAR" },
        ],
        rows: whs.map((w) => [w.name, w.size, w.state]),
        rowCount: whs.length,
      };
      return { type: "resultset", data: rs };
    }

    default: {
      return { type: "resultset", data: { columns: [], rows: [], rowCount: 0 } };
    }
  }
}

export function executeDescribe(stmt: AST.DescribeStatement, state: SnowflakeState, ctx: SessionContext): QueryResult {
  switch (stmt.objectType) {
    case "TABLE": case "VIEW": {
      const [db, schema, name] = resolveThreePart(stmt.name, ctx);
      const tbl = state.getTable(db, schema, name);
      if (!tbl) return { type: "error", message: `Table '${stmt.name.join(".")}' does not exist.` };

      const rs: ResultSet = {
        columns: [
          { name: "name", type: "VARCHAR" },
          { name: "type", type: "VARCHAR" },
          { name: "kind", type: "VARCHAR" },
          { name: "null?", type: "VARCHAR" },
          { name: "default", type: "VARCHAR" },
          { name: "primary key", type: "VARCHAR" },
        ],
        rows: tbl.columns.map((c) => [
          c.name,
          c.type,
          "COLUMN",
          c.nullable ? "Y" : "N",
          c.defaultValue != null ? String(c.defaultValue) : null,
          c.primaryKey ? "Y" : "N",
        ]),
        rowCount: tbl.columns.length,
      };
      return { type: "resultset", data: rs };
    }

    case "DATABASE": {
      const name = stmt.name[0].toUpperCase();
      const db = state.getDatabase(name);
      if (!db) return { type: "error", message: `Database '${name}' does not exist.` };
      return { type: "resultset", data: { columns: [{ name: "name", type: "VARCHAR" }], rows: [[name]], rowCount: 1 } };
    }

    case "SCHEMA": {
      const parts = stmt.name;
      const db = (parts.length === 2 ? parts[0] : ctx.currentDatabase).toUpperCase();
      const schema = parts[parts.length - 1].toUpperCase();
      if (!state.getSchema(db, schema)) return { type: "error", message: `Schema '${schema}' does not exist.` };
      return { type: "resultset", data: { columns: [{ name: "name", type: "VARCHAR" }], rows: [[schema]], rowCount: 1 } };
    }

    default:
      return { type: "error", message: `Cannot describe ${stmt.objectType}` };
  }
}

export function executeUse(stmt: AST.UseStatement, state: SnowflakeState, ctx: SessionContext): { result: QueryResult; ctx: SessionContext } {
  const name = stmt.name.toUpperCase();
  switch (stmt.objectType) {
    case "DATABASE":
      if (!state.getDatabase(name)) return { result: { type: "error", message: `Database '${name}' does not exist.` }, ctx };
      return { result: { type: "status", data: { message: `Statement executed successfully.` } }, ctx: { ...ctx, currentDatabase: name } };
    case "SCHEMA":
      if (!state.getSchema(ctx.currentDatabase, name)) return { result: { type: "error", message: `Schema '${name}' does not exist.` }, ctx };
      return { result: { type: "status", data: { message: `Statement executed successfully.` } }, ctx: { ...ctx, currentSchema: name } };
    case "WAREHOUSE":
      return { result: { type: "status", data: { message: `Statement executed successfully.` } }, ctx: { ...ctx, currentWarehouse: name } };
    case "ROLE":
      return { result: { type: "status", data: { message: `Statement executed successfully.` } }, ctx: { ...ctx, currentRole: name } };
  }
}

function likeMatch(value: string, pattern: string): boolean {
  const regex = "^" + pattern.replace(/%/g, ".*").replace(/_/g, ".") + "$";
  return new RegExp(regex, "i").test(value);
}
