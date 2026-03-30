import modelOrderJson from "../../story/data/dbt/model_order.json";

/** Standard models run in dependency order */
export const STANDARD_MODEL_ORDER: string[] = modelOrderJson.standard;
