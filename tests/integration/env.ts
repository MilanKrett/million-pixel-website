import os from "node:os";
import path from "node:path";

export const TEST_DATABASE = "pixelwall_test";
export const TEST_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:54329/${TEST_DATABASE}`;
export const TEST_STORAGE_DIR = path.join(os.tmpdir(), `pixelwall-test-storage-${process.pid}`);

/** Point the app code at the test database and a throw-away storage folder. */
export function applyTestEnvironment(): void {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.STORAGE_DRIVER = "local";
  process.env.LOCAL_STORAGE_DIR = TEST_STORAGE_DIR;
  process.env.AUTH_SECRET = "test-auth-secret-0123456789-abcdefghijklmnop";
  process.env.CRON_SECRET ??= "test-cron-secret-0123456789";
  process.env.ADMIN_EMAILS = "boss@example.com";
  process.env.PAYMENT_PROVIDER = "dev";
  process.env.EMAIL_DRIVER = "log";
  // Outside services stay off in tests.
  for (const key of ["LINK_CHECK_PROVIDER", "IMAGE_MODERATION_PROVIDER", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"]) delete process.env[key];
  delete process.env.APP_ENV;
}
