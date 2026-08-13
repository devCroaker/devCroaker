import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  Port,
  SecurityGroup,
  SubnetType,
  type Vpc,
} from "aws-cdk-lib/aws-ec2";
import {
  Credentials,
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion,
  StorageType,
} from "aws-cdk-lib/aws-rds";
import type { Construct } from "constructs";

import { config, named } from "./config.js";

export interface DataStackProps extends StackProps {
  readonly vpc: Vpc;
  /** Granted inbound access to Postgres. Created in NetworkStack. */
  readonly lambdaSecurityGroup: SecurityGroup;
}

/**
 * PostgreSQL on RDS. This is the single largest line item in the project at
 * roughly 14 USD per month, so it is intentionally a single-AZ t4g.micro with
 * modest gp3 storage.
 *
 * IAM authentication is enabled so the API can connect without a stored
 * password. The master password still exists in Secrets Manager for admin use,
 * but the application path never reads it.
 */
export class DataStack extends Stack {
  readonly database: DatabaseInstance;
  readonly databaseSecurityGroup: SecurityGroup;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    this.databaseSecurityGroup = new SecurityGroup(
      this,
      "DatabaseSecurityGroup",
      {
        vpc: props.vpc,
        securityGroupName: named("db-sg"),
        description:
          "Postgres access. Ingress is granted per client security group.",
        allowAllOutbound: false,
      },
    );

    this.database = new DatabaseInstance(this, "Database", {
      instanceIdentifier: named("db"),
      engine: DatabaseInstanceEngine.postgres({
        version: PostgresEngineVersion.VER_17_5,
      }),
      instanceType: InstanceType.of(
        InstanceClass.BURSTABLE4_GRAVITON,
        InstanceSize.MICRO,
      ),
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.databaseSecurityGroup],
      databaseName: config.databaseName,
      credentials: Credentials.fromGeneratedSecret("postgres", {
        secretName: named("db-master"),
      }),
      iamAuthentication: true,
      multiAz: false,
      publiclyAccessible: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      storageType: StorageType.GP3,
      storageEncrypted: true,
      backupRetention: Duration.days(7),
      deleteAutomatedBackups: false,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.SNAPSHOT,
      enablePerformanceInsights: false,
      autoMinorVersionUpgrade: true,
    });

    this.databaseSecurityGroup.addIngressRule(
      props.lambdaSecurityGroup,
      Port.tcp(5432),
      "API and migration Lambdas",
    );
  }
}
