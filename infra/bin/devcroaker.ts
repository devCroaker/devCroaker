import { App, Tags } from "aws-cdk-lib";

import { ApiStack } from "../lib/api-stack.js";
import { AuthStack } from "../lib/auth-stack.js";
import { CertStack } from "../lib/cert-stack.js";
import { config, named, resolveAccount } from "../lib/config.js";
import { DataStack } from "../lib/data-stack.js";
import { NetworkStack } from "../lib/network-stack.js";

const app = new App();
const account = resolveAccount();

const env = { account, region: config.region };
/** CloudFront certificates are only valid from us-east-1. */
const certEnv = { account, region: config.certRegion };

const certStack = new CertStack(app, named("cert"), {
  env: certEnv,
  description: "ACM certificate for CloudFront. Must live in us-east-1.",
});

const networkStack = new NetworkStack(app, named("network"), {
  env,
  description: "VPC with isolated subnets and deliberately no NAT Gateway.",
});

const dataStack = new DataStack(app, named("data"), {
  env,
  description: "PostgreSQL on RDS with IAM authentication.",
  vpc: networkStack.vpc,
  lambdaSecurityGroup: networkStack.lambdaSecurityGroup,
});

const authStack = new AuthStack(app, named("auth"), {
  env,
  description: "Cognito user pool and hosted UI.",
});

new ApiStack(app, named("api"), {
  env,
  description: "HTTP API, Hono Lambda, and the migration Lambda.",
  vpc: networkStack.vpc,
  database: dataStack.database,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
  lambdaSecurityGroup: networkStack.lambdaSecurityGroup,
});

// WebStack is added in the next phase, once apps/web exists. cdk-nextjs builds
// the Next.js application during synth, so the app has to be there first.
void certStack;

Tags.of(app).add("project", config.appName);
Tags.of(app).add("managed-by", "cdk");

app.synth();
