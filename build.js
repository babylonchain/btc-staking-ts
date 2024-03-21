import { build } from "esbuild";
import pkg from "./package.json" assert { type: "json" };
const { dependencies } = pkg;

const shared = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  external: Object.keys(dependencies || {}),
};

build({
  ...shared,
  platform: "node", // for CJS
  outfile: "dist/index.cjs",
});

build({
  ...shared,
  platform: "node", // for ESM
  outfile: "dist/index.js",
  format: "esm",
});
