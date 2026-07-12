import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import svgr   from "vite-plugin-svgr";
import react  from "@vitejs/plugin-react";

const localCertPath = path.resolve(".cert", "localhost.pfx");
const localHttps = fs.existsSync(localCertPath)
  ? {
      pfx: fs.readFileSync(localCertPath),
      passphrase: "vite-localhost"
    }
  : undefined;

export default defineConfig({
  server: {
    https: localHttps
  },
  plugins: [
    svgr({
      svgo: true,
      svgrOptions: {
        svgoConfig: {
          plugins: [
            // remove any fill/stroke attributes
            { name: "removeAttrs", params: { attrs: "(fill|stroke)" } },
            // then set default fill to currentColor
            { name: "addAttributesToSVGElement", params: { attributes: [{ fill: "currentColor" }] } },
          ]
        }
      }
    }),
    react(),
  ],
});
