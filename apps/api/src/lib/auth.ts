import type { Context, MiddlewareHandler } from "hono";

import { ApiError, respondWithError } from "./errors.js";

export interface AuthenticatedUser {
  sub: string;
  email?: string;
}

/**
 * Claims are validated by the API Gateway JWT authorizer before the request
 * ever reaches this Lambda, so we only need to read them here rather than
 * verify signatures a second time.
 */
interface JwtAuthorizerContext {
  jwt?: { claims?: Record<string, unknown> };
}

interface LambdaEventLike {
  requestContext?: { authorizer?: JwtAuthorizerContext };
}

function claimsFromEvent(c: Context): Record<string, unknown> | undefined {
  const event = (c.env as { event?: LambdaEventLike } | undefined)?.event;
  return event?.requestContext?.authorizer?.jwt?.claims;
}

export function getUser(c: Context): AuthenticatedUser | undefined {
  const claims = claimsFromEvent(c);
  if (claims && typeof claims.sub === "string") {
    return {
      sub: claims.sub,
      email: typeof claims.email === "string" ? claims.email : undefined,
    };
  }

  // Local development only. Never set this in a deployed environment.
  if (process.env.AUTH_DEV_BYPASS === "true") {
    return { sub: "local-dev-user", email: "dev@localhost" };
  }

  return undefined;
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const user = getUser(c);
  if (!user) {
    return respondWithError(
      c,
      new ApiError("unauthorized", "Authentication required."),
    );
  }
  c.set("user", user);
  await next();
};
