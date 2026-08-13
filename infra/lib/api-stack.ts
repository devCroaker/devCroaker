import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import {
  HttpApi,
  HttpMethod,
  type IHttpApi,
} from "aws-cdk-lib/aws-apigatewayv2";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { type SecurityGroup, SubnetType, type Vpc } from "aws-cdk-lib/aws-ec2";
import type { UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import {
  type BundlingOptions,
  NodejsFunction,
  OutputFormat,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import type { DatabaseInstance } from "aws-cdk-lib/aws-rds";
import type { Construct } from "constructs";
import { join } from "node:path";

import { config, named } from "./config.js";

export interface ApiStackProps extends StackProps {
  readonly vpc: Vpc;
  readonly database: DatabaseInstance;
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;
  /** Created in NetworkStack and already allowed into Postgres by DataStack. */
  readonly lambdaSecurityGroup: SecurityGroup;
}

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/**
 * Shared esbuild settings. Both functions are bundled to a single ESM file and
 * run on ARM, which is cheaper per millisecond than x86.
 */
const BUNDLING_BASE: BundlingOptions = {
  format: OutputFormat.ESM,
  target: "node22",
  minify: true,
  sourceMap: true,
  // pg ships optional native bindings that esbuild cannot resolve and that we
  // do not use, so they are excluded rather than bundled.
  externalModules: ["pg-native"],
};

export class ApiStack extends Stack {
  readonly httpApi: IHttpApi;
  readonly migrationFunctionName: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const commonEnv = {
      NODE_OPTIONS: "--enable-source-maps",
      DB_IAM_AUTH: "true",
      DB_HOST: props.database.dbInstanceEndpointAddress,
      DB_PORT: props.database.dbInstanceEndpointPort,
      DB_NAME: config.databaseName,
      DB_USER: config.databaseUser,
      DB_CA_BUNDLE_PATH: "/var/task/certs/rds-global-bundle.pem",
    };

    const vpcPlacement = {
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.lambdaSecurityGroup],
    };

    const certsDir = join(REPO_ROOT, "packages", "db", "certs");
    const migrationsDir = join(REPO_ROOT, "packages", "db", "migrations");

    const apiFunction = new NodejsFunction(this, "ApiFunction", {
      functionName: named("api"),
      entry: join(REPO_ROOT, "apps", "api", "src", "lambda.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(20),
      logGroup: new LogGroup(this, "ApiFunctionLogs", {
        retention: RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: commonEnv,
      // A t4g.micro has a small connection budget, so cap how many concurrent
      // containers can open connections to it.
      reservedConcurrentExecutions: 10,
      ...vpcPlacement,
      bundling: {
        ...BUNDLING_BASE,
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (_i: string, outputDir: string) => [
            `mkdir -p ${outputDir}/certs`,
            `cp ${certsDir}/rds-global-bundle.pem ${outputDir}/certs/`,
          ],
        },
      },
    });

    const migrationFunction = new NodejsFunction(this, "MigrationFunction", {
      functionName: named("migrate"),
      entry: join(REPO_ROOT, "packages", "db", "src", "migrate-handler.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.minutes(5),
      logGroup: new LogGroup(this, "MigrationFunctionLogs", {
        retention: RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: { ...commonEnv, DB_MIGRATIONS_PATH: "/var/task/migrations" },
      reservedConcurrentExecutions: 1,
      ...vpcPlacement,
      bundling: {
        ...BUNDLING_BASE,
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (_i: string, outputDir: string) => [
            `mkdir -p ${outputDir}/certs ${outputDir}/migrations`,
            `cp ${certsDir}/rds-global-bundle.pem ${outputDir}/certs/`,
            `cp -R ${migrationsDir}/. ${outputDir}/migrations/`,
          ],
        },
      },
    });
    this.migrationFunctionName = migrationFunction.functionName;

    // IAM database authentication: these grants are what replace a password.
    props.database.grantConnect(apiFunction, config.databaseUser);
    props.database.grantConnect(migrationFunction, config.databaseUser);

    const authorizer = new HttpUserPoolAuthorizer(
      "CognitoAuthorizer",
      props.userPool,
      {
        userPoolClients: [props.userPoolClient],
        identitySource: ["$request.header.Authorization"],
      },
    );

    const httpApi = new HttpApi(this, "HttpApi", {
      apiName: named("http-api"),
      description: "devCroaker REST API",
      createDefaultStage: true,
    });

    const integration = new HttpLambdaIntegration(
      "ApiIntegration",
      apiFunction,
    );

    // Reads are public. Writes go through the Cognito authorizer, so an
    // unauthenticated request is rejected before it ever reaches the Lambda.
    httpApi.addRoutes({
      path: "/api/{proxy+}",
      methods: [HttpMethod.GET, HttpMethod.HEAD, HttpMethod.OPTIONS],
      integration,
    });
    httpApi.addRoutes({
      path: "/api/{proxy+}",
      methods: [
        HttpMethod.POST,
        HttpMethod.PUT,
        HttpMethod.PATCH,
        HttpMethod.DELETE,
      ],
      integration,
      authorizer,
    });

    this.httpApi = httpApi;

    new CfnOutput(this, "HttpApiUrl", { value: httpApi.apiEndpoint });
    new CfnOutput(this, "MigrationFunctionName", {
      value: migrationFunction.functionName,
    });
  }
}
