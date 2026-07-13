import "dotenv/config";
import { defineConfig } from "prisma/config";

// During Railway's build phase DATABASE_URL is not available.
// prisma generate only needs the schema — it never opens a DB connection.
// We supply a syntactically valid placeholder so the config validator is
// satisfied; the real URL is injected at runtime via Railway's env vars.
const dbUrl = process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: dbUrl,
  },
});
