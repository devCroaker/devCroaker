import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { OPENAPI_INFO, createRootApp } from "../src/app.js";

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = join(here, "..", "openapi.json");

const document = createRootApp().getOpenAPI31Document(OPENAPI_INFO);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

console.warn(`Wrote ${outputPath}`);
