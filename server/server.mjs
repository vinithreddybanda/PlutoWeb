import http from "node:http";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 10000);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",").map(x => x.trim());
const YT_PO_TOKEN = process.env.YT_PO_TOKEN || "";

function send(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}
function cors(req, res) {
  const origin = req.headers.origin || "";
  const allowed = ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin);
  res.setHeader("Access-Control-Allow-Origin", allowed ? (ALLOWED_ORIGINS.includes("*") ? "*" : origin) : "null");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error("Request body too large.");
  }
  return raw ? JSON.parse(raw) : {};
}
function runYtDlp(args, timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim().slice(-1800) || `yt-dlp exited with code ${code}`));
    });
  });
}
function ytArgs() {
  const args = ["--no-warnings", "--no-playlist", "--js-runtimes", "node", "--remote-components", "ejs:github"];
  if (YT_PO_TOKEN) args.push("--extractor-args", `youtube:po_token=${YT_PO_TOKEN}`);
  return args;
}
const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, service: "PlutoWeb YouTube bridge" });

    if (req.method === "POST" && /^\/api\/innertube\/(search|next|browse|player)$/.test(url.pathname)) {
      const endpoint = url.pathname.split("/").at(-1);
      const body = await readJson(req);
      const upstream = await fetch(`https://music.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-YouTube-Client-Name": "67",
          "X-YouTube-Client-Version": body.context?.client?.clientVersion || "1.20260304.03.00",
          "Origin": "https://music.youtube.com",
          "Referer": "https://music.youtube.com/"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000)
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(text);
    }

    const match = req.method === "GET" && url.pathname.match(/^\/api\/stream\/([a-zA-Z0-9_-]{6,20})$/);
    if (match) {
      const videoUrl = `https://www.youtube.com/watch?v=${match[1]}`;
      const output = await runYtDlp([...ytArgs(), "--get-url", "-f", "bestaudio/best", videoUrl]);
      const streamUrl = output.split("\n").find(line => /^https:\/\//.test(line));
      if (!streamUrl) throw new Error("yt-dlp did not return an audio stream URL.");
      return send(res, 200, { url: streamUrl });
    }

    return send(res, 404, { error: "Not found." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upstream error.";
    return send(res, 502, { error: message });
  }
});
server.listen(PORT, "0.0.0.0", () => console.log(`PlutoWeb YouTube bridge listening on ${PORT}`));
