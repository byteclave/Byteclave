import { defineConfig } from "drizzle-kit";
import path from "path";
import { parseServerEnvironment } from "@workspace/config";

const env = parseServerEnvironment();

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  out: path.join(__dirname, "./drizzle"),
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
