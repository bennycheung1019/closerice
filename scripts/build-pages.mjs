import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { bootLoadingMarkup } from "../lib/loading-markup.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiBase = process.env.VITE_API_BASE_URL?.replace(/\/$/, "");
if (!apiBase || !/^https:\/\/[^/]+(?:\/[^?#]*)?$/.test(apiBase)) {
  throw new Error("VITE_API_BASE_URL must be the HTTPS base URL of the deployed Closerice API.");
}

execFileSync(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "build", "--config", path.join(root, "web/vite.config.ts")], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

const out = path.join(root, "dist-pages");
// Show the same lightweight animation before the application JavaScript starts.
const loadingStyle = readFileSync(path.join(root, "app/loading-state.css"), "utf8");
for (const page of ["index.html", "settings/index.html", "admin/index.html", "ai/index.html"]) {
  const file = path.join(out, page);
  const html = readFileSync(file, "utf8")
    .replace("</head>", `<style>${loadingStyle}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${bootLoadingMarkup}</div>`);
  writeFileSync(file, html);
}
const specPath = path.join(out, "openapi.json");
const spec = JSON.parse(readFileSync(specPath, "utf8"));
spec.servers = [{ url: apiBase }];
writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
