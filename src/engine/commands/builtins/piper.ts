import { register } from "../registry";

register(
  "piper",
  (_args, _flags, ctx) => {
    return {
      output: "",
      piperSession: {
        storyFlags: ctx.storyFlags ?? {},
        deliveredPiperIds: [],  // Will be filled by the caller
        computerId: ctx.activeComputer,
      },
    };
  },
  "Open Piper team messaging"
);
