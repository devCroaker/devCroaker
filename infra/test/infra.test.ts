import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";

import { ApiStack } from "../lib/api-stack.js";
import { AuthStack } from "../lib/auth-stack.js";
import { DataStack } from "../lib/data-stack.js";
import { NetworkStack } from "../lib/network-stack.js";

const env = { account: "111111111111", region: "us-west-2" };

interface LambdaResource {
  Properties?: {
    FunctionName?: string;
    Environment?: { Variables?: Record<string, string> };
  };
}

interface RouteResource {
  Properties?: { RouteKey?: string; AuthorizerId?: unknown };
}

let network: Template;
let data: Template;
let api: Template;
let auth: Template;

beforeAll(() => {
  const app = new App();
  const networkStack = new NetworkStack(app, "test-network", { env });
  const dataStack = new DataStack(app, "test-data", {
    env,
    vpc: networkStack.vpc,
    lambdaSecurityGroup: networkStack.lambdaSecurityGroup,
  });
  const authStack = new AuthStack(app, "test-auth", { env });
  const apiStack = new ApiStack(app, "test-api", {
    env,
    vpc: networkStack.vpc,
    database: dataStack.database,
    userPool: authStack.userPool,
    userPoolClient: authStack.userPoolClient,
    lambdaSecurityGroup: networkStack.lambdaSecurityGroup,
  });

  network = Template.fromStack(networkStack);
  data = Template.fromStack(dataStack);
  auth = Template.fromStack(authStack);
  api = Template.fromStack(apiStack);
});

describe("cost guards", () => {
  // The single most expensive mistake available in this design. A NAT Gateway
  // is roughly 32 USD per month, nearly tripling the cost of the project.
  it("creates no NAT gateways", () => {
    network.resourceCountIs("AWS::EC2::NatGateway", 0);
  });

  it("creates no Elastic IPs, which NAT gateways would require", () => {
    network.resourceCountIs("AWS::EC2::EIP", 0);
  });

  it("creates no load balancers", () => {
    network.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 0);
    api.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 0);
  });

  it("runs a single-AZ burstable database", () => {
    data.hasResourceProperties("AWS::RDS::DBInstance", {
      DBInstanceClass: "db.t4g.micro",
      MultiAZ: false,
    });
  });
});

describe("database security", () => {
  it("is not publicly accessible", () => {
    data.hasResourceProperties("AWS::RDS::DBInstance", {
      PubliclyAccessible: false,
    });
  });

  it("enables IAM authentication and encryption at rest", () => {
    data.hasResourceProperties("AWS::RDS::DBInstance", {
      EnableIAMDatabaseAuthentication: true,
      StorageEncrypted: true,
    });
  });

  it("has deletion protection turned on", () => {
    data.hasResourceProperties("AWS::RDS::DBInstance", {
      DeletionProtection: true,
    });
  });

  it("only allows Postgres ingress from the Lambda security group", () => {
    data.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      FromPort: 5432,
      ToPort: 5432,
      IpProtocol: "tcp",
    });
    // No CIDR-based ingress at all.
    const ingress = data.findResources("AWS::EC2::SecurityGroupIngress");
    for (const resource of Object.values(ingress)) {
      expect(resource.Properties).not.toHaveProperty("CidrIp");
    }
  });
});

describe("lambdas", () => {
  it("runs on ARM64 and Node 22", () => {
    api.hasResourceProperties("AWS::Lambda::Function", {
      Architectures: ["arm64"],
      Runtime: "nodejs22.x",
    });
  });

  it("places functions in the VPC", () => {
    api.hasResourceProperties("AWS::Lambda::Function", {
      VpcConfig: Match.objectLike({ SubnetIds: Match.anyValue() }),
    });
  });

  it("caps concurrency so the micro instance is not overwhelmed", () => {
    api.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "devcroaker-api",
      ReservedConcurrentExecutions: 10,
    });
  });

  it("uses IAM auth rather than a database password", () => {
    const functions = Object.values(
      api.findResources("AWS::Lambda::Function"),
    ) as LambdaResource[];

    expect(functions.length).toBeGreaterThan(0);
    for (const fn of functions) {
      const vars = fn.Properties?.Environment?.Variables ?? {};
      expect(vars.DB_IAM_AUTH).toBe("true");
      expect(JSON.stringify(vars)).not.toMatch(/password/i);
    }
  });
});

describe("api routes", () => {
  it("leaves read routes unauthenticated and protects writes", () => {
    const routes = Object.values(
      api.findResources("AWS::ApiGatewayV2::Route"),
    ) as RouteResource[];
    const byKey = routes.map((r) => ({
      key: r.Properties?.RouteKey,
      authorizer: r.Properties?.AuthorizerId,
    }));

    const read = byKey.find((r) => r.key?.startsWith("GET "));
    const write = byKey.find((r) => r.key?.startsWith("POST "));

    expect(read).toBeDefined();
    expect(read?.authorizer).toBeUndefined();
    expect(write).toBeDefined();
    expect(write?.authorizer).toBeDefined();
  });

  it("wires a Cognito user pool authorizer", () => {
    api.hasResourceProperties("AWS::ApiGatewayV2::Authorizer", {
      AuthorizerType: "JWT",
      IdentitySource: ["$request.header.Authorization"],
    });
  });
});

describe("auth", () => {
  it("disables public self sign-up", () => {
    auth.hasResourceProperties("AWS::Cognito::UserPool", {
      AdminCreateUserConfig: Match.objectLike({
        AllowAdminCreateUserOnly: true,
      }),
    });
  });

  it("issues a public client with no secret", () => {
    auth.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      GenerateSecret: false,
    });
  });
});
