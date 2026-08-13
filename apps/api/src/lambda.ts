import { handle } from "hono/aws-lambda";

import { createRootApp } from "./app.js";

/**
 * API Gateway strips nothing, so the app is mounted at /api to match the
 * CloudFront behaviour that routes /api/* here.
 */
const app = createRootApp();

export const handler = handle(app);
