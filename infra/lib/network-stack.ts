import { Stack, type StackProps } from "aws-cdk-lib";
import {
  IpAddresses,
  SecurityGroup,
  SubnetType,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import type { Construct } from "constructs";

import { named } from "./config.js";

/**
 * VPC for the API Lambda and the database.
 *
 * There is deliberately no NAT Gateway. One costs roughly 32 USD per month,
 * which would nearly triple the running cost of this project. It is avoidable
 * because the Lambda never needs outbound internet access: it talks only to
 * RDS, and RDS IAM tokens are signed locally with SigV4 rather than fetched
 * over the network.
 */
export class NetworkStack extends Stack {
  readonly vpc: Vpc;

  /**
   * Owned here rather than in ApiStack. If ApiStack created it and DataStack
   * consumed it for an ingress rule, the two stacks would reference each other
   * and CloudFormation would reject the cycle.
   */
  readonly lambdaSecurityGroup: SecurityGroup;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.vpc = new Vpc(this, "Vpc", {
      vpcName: named("vpc"),
      ipAddresses: IpAddresses.cidr("10.20.0.0/16"),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          // PRIVATE_ISOLATED has no route to the internet, which is exactly
          // what both the Lambda and the database need.
          name: "isolated",
          subnetType: SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    this.lambdaSecurityGroup = new SecurityGroup(this, "LambdaSecurityGroup", {
      vpc: this.vpc,
      securityGroupName: named("lambda-sg"),
      description: "API and migration Lambdas.",
      allowAllOutbound: true,
    });
  }
}
