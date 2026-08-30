import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contentTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
});

const securityHeaders = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
});

function responseHeaders(extra = {}) {
  return { ...securityHeaders, ...extra };
}

function safePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    /[∕⁄／]/u.test(decoded) ||
    decoded.split("/").includes("..") ||
    /%2e|%2f|%5c/i.test(decoded)
  ) {
    return null;
  }
  let relativePath = decoded.replace(/^\/+/, "");
  if (!relativePath || relativePath.endsWith("/")) relativePath += "index.html";
  const candidate = resolve(root, relativePath);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  if (!contentTypes[extname(candidate)]) return null;
  const allowed =
    relativePath === "index.html" ||
    relativePath === "styles.css" ||
    /^ja\/index\.html$/.test(relativePath) ||
    /^src\/[a-z0-9-]+\.js$/.test(relativePath) ||
    /^data\/[a-z0-9.-]+\.json$/.test(relativePath) ||
    /^assets\/[a-z0-9-]+\.css$/.test(relativePath) ||
    /^devices\/rd-syn-[a-z0-9-]+\/index\.html$/.test(relativePath) ||
    /^sources\/synthetic-[a-z0-9-]+\/index\.html$/.test(relativePath) ||
    relativePath === "data-notice/index.html";
  if (!allowed) return null;
  if (
    relativePath.startsWith(".") ||
    relativePath.includes(".bak-") ||
    relativePath.startsWith("dist/")
  ) {
    return null;
  }
  return candidate;
}

export function createServer() {
  return createHttpServer(async (request, response) => {
    if (!request.url || !["GET", "HEAD"].includes(request.method ?? "")) {
      response.writeHead(405, responseHeaders({ Allow: "GET, HEAD" }));
      response.end("Method Not Allowed");
      return;
    }
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const path = safePath(requestUrl.pathname);
    if (!path) {
      response.writeHead(404, responseHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
      response.end("Not Found");
      return;
    }
    try {
      const info = await stat(path);
      if (!info.isFile()) throw new Error("not-file");
      response.writeHead(200, responseHeaders({ "Content-Type": contentTypes[extname(path)] }));
      if (request.method === "HEAD") response.end();
      else createReadStream(path).pipe(response);
    } catch {
      response.writeHead(404, responseHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
      response.end("Not Found");
    }
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number.parseInt(process.env.PORT ?? "4173", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT.");
  const server = createServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`Synthetic WebMCP demo: http://127.0.0.1:${port}/`);
    console.log(`Japanese: http://127.0.0.1:${port}/ja/`);
  });
}
