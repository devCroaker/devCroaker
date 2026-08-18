import { Stack, type StackProps } from "aws-cdk-lib";
import {
  Certificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";
import { HostedZone, type IHostedZone } from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";

import { config, named } from "./config.js";

/**
 * CloudFront only accepts certificates issued in us-east-1, so this stack is
 * pinned to that region while everything else runs in us-west-2. It contains
 * nothing but the certificate and costs nothing to keep.
 */
export class CertStack extends Stack {
  readonly certificateArn: string;
  readonly hostedZone: IHostedZone;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, { ...props, crossRegionReferences: true });

    this.hostedZone = HostedZone.fromLookup(this, "HostedZone", {
      domainName: config.hostedZoneName,
    });

    const certificate = new Certificate(this, "SiteCertificate", {
      domainName: config.domainName,
      certificateName: named("site-cert"),
      validation: CertificateValidation.fromDns(this.hostedZone),
    });

    this.certificateArn = certificate.certificateArn;
  }
}
