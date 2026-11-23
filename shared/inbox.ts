import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const inboxSnapshot = defineRpc({
  name: "inbox",
  input: z.object({ agentIds: z.array(z.string()).max(2_000) }),
  output: z.object({
    requests: z.array(z.object({ agentId: z.string(), requestId: z.string(), at: z.string() })),
  }),
});
