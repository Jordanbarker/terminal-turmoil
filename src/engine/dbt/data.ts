import modelOrderJson from "../../story/data/dbt/model_order.json";

/** Standard models run in dependency order (excludes _chip_internal) */
export const STANDARD_MODEL_ORDER: string[] = modelOrderJson.standard;

/** _chip_internal models (only run when explicitly selected) */
export const CHIP_INTERNAL_MODELS: string[] = modelOrderJson.chip_internal;
