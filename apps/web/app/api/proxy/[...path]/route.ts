import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";

async function forward(
  req: Request,
  params: Promise<{ path: string[] }>
): Promise<Response> {
  const { path } = await params;
  const { gatewayUrl, gatewayToken } = getServerEnv();
  const url = new URL(req.url);
  const target = `${gatewayUrl}/${path.join("/")}${url.search}`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${gatewayToken}`,
  };
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;

  const init: RequestInit = {
    method: req.method,
    headers,
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }
  const upstream = await fetch(target, init);
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> }
) {
  return forward(req, ctx.params);
}
export const POST = GET;
export const PUT = GET;
export const DELETE = GET;
export const PATCH = GET;
