import { createDb } from "./client";
import { runMigrations } from "./migrate";

const url = process.env.DATABASE_URL ?? "postgres://architech:architech@localhost:5433/architech";
const { db, close } = createDb(url, { max: 1 });
runMigrations(db)
  .then(async () => {
    console.log("Database is up to date.");
    await close();
  })
  .catch(async (e) => {
    console.error(e);
    await close();
    process.exit(1);
  });
