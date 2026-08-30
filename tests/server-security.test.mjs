import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "../scripts/dev-server.mjs";

let server;
let origin;

test.before(async () => {
  server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("home, Japanese page, all devices, and source pages return 200 with security headers", async () => {
  const catalog = JSON.parse(await readFile("data/catalog.synthetic.json", "utf8"));
  const paths = [
    "/",
    "/ja/",
    "/sources/synthetic-price-scenarios/",
    "/sources/synthetic-methods-corpus/",
    "/data-notice/",
    ...catalog.products.map((product) => product.paths.product),
  ];
  for (const path of paths) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
});

test("source JSON remains same-origin and old or private paths return 404", async () => {
  for (const path of [
    "/data/profile.synthetic.json",
    "/data/catalog.synthetic.json",
    "/data/prices.synthetic.json",
    "/data/literature.synthetic.json",
  ]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /application\/json/);
  }
  for (const path of [
    "/package.json",
    "/README.md",
    "/scripts/build.mjs",
    "/tests/domain.test.mjs",
    "/products/anything/",
    `/data/catalog.${"public"}.json`,
    "/.git/config",
  ]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 404, path);
  }
});

test("server rejects unsupported methods", async () => {
  const response = await fetch(`${origin}/`, { method: "POST" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
});

test("generated HTML has no unresolved placeholders, inline scripts, or inline event handlers", async () => {
  const catalog = JSON.parse(await readFile("data/catalog.synthetic.json", "utf8"));
  const files = [
    "index.html",
    "ja/index.html",
    "sources/synthetic-price-scenarios/index.html",
    "sources/synthetic-methods-corpus/index.html",
    "data-notice/index.html",
    ...catalog.products.map((product) => `devices/${product.id}/index.html`),
  ];
  for (const path of files) {
    const html = await readFile(path, "utf8");
    assert.doesNotMatch(html, /\{\{[A-Z0-9_]+\}\}/, path);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i, path);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, path);
    assert.doesNotMatch(html, /javascript:/i, path);
  }
});
