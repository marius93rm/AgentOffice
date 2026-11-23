import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const resultNotice = z.object({
  agentId: z.string(),
  at: z.string(),
  key: z.string(),
  text: z.string().max(8_000),
  cut: z.boolean(),
});

export type ResultNotice = z.output<typeof resultNotice>;

export const inboxSnapshot = defineRpc({
  name: "inbox",
  input: z.object({ agentIds: z.array(z.string()).max(2_000) }),
  output: z.object({
    results: z.array(resultNotice),
    requests: z.array(z.object({ agentId: z.string(), requestId: z.string(), at: z.string() })),
  }),
});

export const resultDetail = defineRpc({
  name: "result-detail",
  input: z.object({ agentId: z.string(), key: z.string() }),
  output: resultNotice.nullable(),
});
