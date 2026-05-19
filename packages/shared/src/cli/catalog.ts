import { z } from "zod";

export const cliEntry = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  defaultArgs: z.array(z.string()).default([]),
});
export type CliEntry = z.infer<typeof cliEntry>;
