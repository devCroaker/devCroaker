/**
 * Deployment configuration.
 *
 * The AWS account id is deliberately not committed. It comes from the ambient
 * CDK environment locally and from a GitHub Actions variable in CI, which
 * keeps it out of a public repository.
 */
export interface AppConfig {
  readonly appName: string;
  readonly region: string;
  /** CloudFront certificates must live in us-east-1. */
  readonly certRegion: string;
  readonly hostedZoneName: string;
  readonly domainName: string;
  readonly databaseName: string;
  /** Database user the API authenticates as, via RDS IAM auth. */
  readonly databaseUser: string;
}

export const config: AppConfig = {
  appName: "devcroaker",
  region: process.env.AWS_REGION ?? "us-west-2",
  certRegion: "us-east-1",
  hostedZoneName: "croaker.me",
  domainName: "dev.croaker.me",
  databaseName: "devcroaker",
  databaseUser: "api",
};

export function resolveAccount(): string {
  const account = process.env.CDK_DEFAULT_ACCOUNT ?? process.env.AWS_ACCOUNT_ID;
  if (!account) {
    throw new Error(
      "No AWS account found. Set AWS_ACCOUNT_ID or run through the AWS CLI so " +
        "CDK_DEFAULT_ACCOUNT is populated.",
    );
  }
  return account;
}

/** Prefixes a resource name with the app name for easy identification. */
export function named(suffix: string): string {
  return `${config.appName}-${suffix}`;
}
