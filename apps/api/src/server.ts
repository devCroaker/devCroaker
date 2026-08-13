import { serve } from "@hono/node-server";

import { createRootApp } from "./app.js";

const port = Number(process.env.API_PORT ?? 8787);

// Mounted under /api locally so paths match the CloudFront behaviour in AWS.
const app = createRootApp();

serve({ fetch: app.fetch, port }, (info) => {
  console.warn(`API listening on http://localhost:${info.port}/api`);
  console.warn(`  OpenAPI document: http://localhost:${info.port}/api/doc`);
  console.warn(
    `  Reference UI:     http://localhost:${info.port}/api/reference`,
  );
});
