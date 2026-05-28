#!/usr/bin/env node
// wp-progress.js — agent-desk work-package 진행 추적
// Claude Code PostToolUse(Write|Edit) 및 Stop 훅에서 호출
// Node.js CJS — Windows/Mac/Linux 공통. 항상 exit(0).
//
// TODO(v2-codex): Codex PostToolUse는 apply_patch 도구 사용.
//   file_path가 unified diff에 임베드 → grep '+++ b/' | sed 파싱 필요.
//   설정: .codex/hooks.json  matcher: "apply_patch"
//
// TODO(v2-gemini): Gemini AfterTool, tool_name="write_file",
//   tool_input.file_path 직접 접근 (Claude Code 동일 구조).
//   설정: .gemini/settings.json  matcher: "write_.*"

"use strict";
const path  = require("path");
const http  = require("http");
const https = require("https");

const sessionId = process.env.AGENT_DESK_SESSION_ID;
const baseUrl   = process.env.AGENT_DESK_URL;
const token     = process.env.AGENT_DESK_TOKEN;

if (!sessionId || !baseUrl || !token) process.exit(0);

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { raw += c; });
process.stdin.on("end", () => {
  try { run(JSON.parse(raw)); } catch { /* 파싱 실패 무시 */ }
  process.exit(0);
});

function run(input) {
  const event = input.hook_event_name ?? "";
  const tool  = input.tool_name ?? "";
  let payload = null;

  if (event === "PostToolUse" && (tool === "Write" || tool === "Edit")) {
    const fp = input.tool_input?.file_path;
    if (!fp) return;
    payload = { filePath: path.normalize(fp).replace(/\\/g, "/") };
  } else if (event === "Stop") {
    const msg = (input.last_assistant_message ?? "").slice(0, 500);
    if (!msg) return;
    payload = { lastMessage: msg };
  } else {
    return;
  }

  post(`${baseUrl}/sessions/${sessionId}/progress`, payload, token);
}

function post(url, body, bearerToken) {
  const data   = Buffer.from(JSON.stringify(body), "utf8");
  const parsed = new URL(url);
  const lib    = parsed.protocol === "https:" ? https : http;
  const req    = lib.request({
    hostname: parsed.hostname,
    port:     parsed.port || (parsed.protocol === "https:" ? 443 : 80),
    path:     parsed.pathname + parsed.search,
    method:   "POST",
    headers: {
      "Content-Type":   "application/json",
      "Content-Length": data.length,
      "Authorization":  `Bearer ${bearerToken}`,
    },
    timeout: 3000,
  });
  req.on("error",    () => { /* 실패 무시 */ });
  req.on("timeout",  () => { req.destroy(); });
  req.on("response", (res) => { res.resume(); });
  req.write(data);
  req.end();
}
