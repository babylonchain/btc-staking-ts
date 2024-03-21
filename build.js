import { build } from "esbuild"

const shared = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true
}

build({
  ...shared,
  platform: "node", // for CJS
  outfile: "dist/index.js"
})

build({
  ...shared,
  platform: "neutral", // for ESM
  outfile: "dist/index.esm.js",
  format: "esm"
})
