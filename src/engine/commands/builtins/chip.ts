import { register } from "../registry";

register(
  "chip",
  (_args, _flags, ctx) => {
    return {
      output: "",
      chipSession: { storyFlags: ctx.storyFlags ?? {} },
    };
  },
  "Chat with Chip, NexaCorp's AI assistant"
);
