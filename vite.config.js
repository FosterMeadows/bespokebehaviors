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

function buildReleaseName(date = new Date()) {
  const pad = value => String(value).padStart(2, "0");
  const datePart = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
  const timePart = [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join("");
  return `${datePart}-${timePart}`;
}

export default defineConfig(({ command, mode }) => {
  const developmentName = mode === "development" ? "local-development" : `${mode}-development`;
  const releaseName = command === "build" ? buildReleaseName() : developmentName;

  return {
    define: {
      "import.meta.env.VITE_APP_RELEASE": JSON.stringify(releaseName)
    },
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
  };
});
