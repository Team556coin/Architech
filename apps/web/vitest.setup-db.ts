import { ensureDatabase } from "@architech/db";

export default async function setup() {
  await ensureDatabase(process.env.WEB_TEST_DATABASE_URL!);
}
