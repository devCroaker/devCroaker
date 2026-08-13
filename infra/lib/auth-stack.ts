import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import {
  AccountRecovery,
  OAuthScope,
  UserPool,
  type UserPoolClient,
  UserPoolClientIdentityProvider,
  type UserPoolDomain,
} from "aws-cdk-lib/aws-cognito";
import type { Construct } from "constructs";

import { config, named } from "./config.js";

/**
 * Cognito user pool. The Essentials tier includes 10,000 monthly active users
 * at no cost, which comfortably covers a personal site.
 */
export class AuthStack extends Stack {
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;
  readonly userPoolDomain: UserPoolDomain;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.userPool = new UserPool(this, "UserPool", {
      userPoolName: named("users"),
      selfSignUpEnabled: false, // Admin-created accounts only.
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: false },
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const callbackBase = `https://${config.domainName}`;

    this.userPoolClient = this.userPool.addClient("WebClient", {
      userPoolClientName: named("web"),
      generateSecret: false, // Public client: a browser cannot keep a secret.
      authFlows: { userSrp: true },
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: [
          `${callbackBase}/api/auth/callback/cognito`,
          "http://localhost:3000/api/auth/callback/cognito",
        ],
        logoutUrls: [callbackBase, "http://localhost:3000"],
      },
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      preventUserExistenceErrors: true,
    });

    this.userPoolDomain = this.userPool.addDomain("HostedUiDomain", {
      cognitoDomain: { domainPrefix: config.appName },
    });

    new CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
    });
    new CfnOutput(this, "HostedUiUrl", {
      value: this.userPoolDomain.baseUrl(),
    });
  }
}
