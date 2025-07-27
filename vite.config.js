import { defineConfig } from "vite";
import svgr   from "vite-plugin-svgr";
import react  from "@vitejs/plugin-react";

export default defineConfig({
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
