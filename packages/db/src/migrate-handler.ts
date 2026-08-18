import { closeDb } from "./client.js";
import { runMigrations } from "./migrate.js";

export interface MigrateResult {
  status: "ok" | "failed";
  message: string;
}

/**
 * Invoked by the deploy workflow after the stacks update. The database sits in
 * isolated subnets, so a GitHub Actions runner cannot reach it directly; this
 * Lambda runs inside the VPC on the runner's behalf.
 */
export async function handler(): Promise<MigrateResult> {
  try {
    await runMigrations();
    return { status: "ok", message: "Migrations applied." };
  } catch (error) {
    console.error("Migration failed:", error);
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    await closeDb();
  }
}
