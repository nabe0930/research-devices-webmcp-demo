const staticFiles = [
  "index.html",
  "ja/index.html",
  "styles.css",
  "vercel.json",
  "src/app.js",
  "src/data-store.js",
  "src/tools.js",
  "src/webmcp.js",
  "data/profile.synthetic.json",
  "data/catalog.synthetic.json",
  "data/prices.synthetic.json",
  "data/literature.synthetic.json",
  "sources/synthetic-price-scenarios/index.html",
  "sources/synthetic-methods-corpus/index.html",
  "data-notice/index.html",
  "assets/product-detail.css",
  "assets/price-scenarios.css",
  "assets/methods-corpus.css",
  "assets/data-notice.css",
];

export const STATIC_BUILD_FILES = Object.freeze(staticFiles);

export function buildFilesForCatalog(catalog) {
  if (!Array.isArray(catalog?.products)) throw new Error("Catalog products are missing.");
  const ids = new Set();
  for (const product of catalog.products) {
    if (!product || typeof product.id !== "string" || !/^rd-syn-[a-z0-9-]{1,80}$/.test(product.id)) {
      throw new Error("Catalog contains an unsafe product ID for a build path.");
    }
    if (ids.has(product.id)) throw new Error("Catalog contains a duplicate product ID.");
    ids.add(product.id);
  }
  return [
    ...STATIC_BUILD_FILES,
    ...[...ids].map((id) => `devices/${id}/index.html`),
  ].sort();
}

