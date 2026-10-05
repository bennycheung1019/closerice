import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiBase = process.env.VITE_API_BASE_URL?.replace(/\/$/, "");
if (!apiBase || !/^https:\/\/[^/]+$/.test(apiBase)) {
  throw new Error("VITE_API_BASE_URL must be the HTTPS origin of the deployed Closerice API Worker.");
}

execFileSync(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "build", "--config", path.join(root, "web/vite.config.ts")], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

const out = path.join(root, "dist-pages");
const oldBase = "https://closerice.benny-cheung.chatgpt.site";
const pageBase = "https://bunbun.space/closerice";
const guidePath = path.join(out, "llms.txt");
writeFileSync(guidePath, readFileSync(guidePath, "utf8")
  .replaceAll(oldBase, pageBase)
  .replace("Machine-readable API:", `API server: ${apiBase}\nMachine-readable API:`)
  .replace("POST one application/json request to /api/agent/reviews", `POST one application/json request to ${apiBase}/api/agent/reviews`)
  .replace("GET /api/reviews", `GET ${apiBase}/api/reviews`));

const specPath = path.join(out, "openapi.json");
const spec = JSON.parse(readFileSync(specPath, "utf8"));
spec.servers = [{ url: apiBase }];
writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
