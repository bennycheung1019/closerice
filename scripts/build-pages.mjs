import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
const specPath = path.join(out, "openapi.json");
const spec = JSON.parse(readFileSync(specPath, "utf8"));
spec.servers = [{ url: apiBase }];
writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
