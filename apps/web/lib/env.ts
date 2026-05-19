const required = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is required`);
  return v;
};

export function getServerEnv() {
  return {
    gatewayUrl: process.env.AGENT_DESK_GATEWAY_URL ?? "http://127.0.0.1:3334",
    gatewayToken: required("AGENT_DESK_TOKEN"),
  };
}
