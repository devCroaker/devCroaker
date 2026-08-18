# devCroaker

Personal site, portfolio, and reference implementation. TypeScript from front end to infrastructure.

Live at [dev.croaker.me](https://dev.croaker.me).

## Stack

| Layer          | Technology                                              |
| -------------- | ------------------------------------------------------- |
| Monorepo       | pnpm workspaces + Turborepo                             |
| Front end      | Next.js 16 (App Router), React, MUI Core, Jotai         |
| API            | Hono + `@hono/zod-openapi`, deployed as a single Lambda |
| Contract       | OpenAPI 3.1, generated from Zod schemas                 |
| Database       | PostgreSQL on RDS, Drizzle ORM                          |
| Auth           | Amazon Cognito                                          |
| Infrastructure | AWS CDK (TypeScript)                                    |
| CI/CD          | GitHub Actions with OIDC, no static AWS keys            |

## Architecture

CloudFront serves the Next.js app and proxies `/api/*` to API Gateway, so the browser only ever talks
to a single origin and CORS never enters the picture. The API Lambda runs inside a VPC with isolated
subnets and reaches Postgres using RDS IAM authentication, which means there is no stored database
password and no NAT Gateway.

```
Route53 (croaker.me)
  └─ CloudFront
       ├─ default  ->  Next.js SSR Lambda + S3 assets
       └─ /api/*   ->  API Gateway HTTP API (Cognito JWT authorizer)
                          └─ Hono Lambda (VPC)
                               └─ RDS PostgreSQL (isolated subnets)
```

## Repository layout

```
apps/
  web/            Next.js application
  api/            Hono API, Lambda and local server entry points
packages/
  db/             Drizzle schema, migrations, client factory
  api-contract/   Zod schemas that generate the OpenAPI document
  api-client/     Typed client generated from the OpenAPI document
  ui/             Shared MUI theme and components
  config/         Shared ESLint, Prettier, and TypeScript config
infra/            AWS CDK application
```

## Getting started

Requires Node 22 (see `.nvmrc`), pnpm, and Docker.

```bash
nvm use
pnpm install
pnpm db:up          # start local Postgres
pnpm dev            # web on :3000, api on :8787
```

Useful scripts:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format
```

## Notes on cost

This project is deliberately built to run for roughly 18 USD per month, most of which is the RDS
instance. The design avoids two common cost traps: a NAT Gateway (about 32 USD per month) and an
always-on Application Load Balancer (about 17 USD per month). If you fork this, keep an eye on both.
