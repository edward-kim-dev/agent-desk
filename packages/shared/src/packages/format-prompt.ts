export function formatBrainstormingPrompt(payload: {
  topic: string;
  context?: string;
  constraints?: string;
  goals?: string;
}): string {
  const parts: string[] = [];
  parts.push(`Topic: ${payload.topic}`);
  if (payload.context?.trim()) parts.push(`Context: ${payload.context.trim()}`);
  if (payload.constraints?.trim()) parts.push(`Constraints: ${payload.constraints.trim()}`);
  if (payload.goals?.trim()) parts.push(`Goals: ${payload.goals.trim()}`);
  const sanitized = parts.map((p) => p.replace(/\r?\n/g, " · ")).join(" · ");
  return `/brainstorming ${sanitized}`;
}
