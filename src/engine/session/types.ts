import { VirtualFS } from "../filesystem/VirtualFS";
import { GameEvent } from "../mail/delivery";
import { SnowflakeState } from "../snowflake/state";

export interface SessionResult {
  type: "continue" | "exit";
  newFs?: VirtualFS;
  newState?: SnowflakeState;
  output?: string;
  triggerEvents?: GameEvent[];
}

export interface ISession {
  enter(): void | SessionResult | Promise<void>;
  handleInput(data: string): SessionResult | null;
  /** Returns false if the session has unsaved state and should not be closed. Defaults to true. */
  canClose?(): boolean;
}
