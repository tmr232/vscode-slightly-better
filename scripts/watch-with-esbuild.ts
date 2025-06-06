import esbuild from "esbuild";
import config from "./esbuild.config.ts";

try {
  const context = await esbuild.context(config);
  await context.watch();
} catch {
  process.exit(1);
}
