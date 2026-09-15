import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig(async ({ command, isPreview }) => {
  // Use a normal Node server for local development; build for Workers.
  const workerPlugins = [];
  if (command === "build" || isPreview) {
    const { cloudflare } = await import("@cloudflare/vite-plugin");
    workerPlugins.push(cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      inspectorPort: false,
    }));
  }
  return {
    server: { host: "127.0.0.1", port: 3000, strictPort: true },
    preview: { host: "127.0.0.1", port: 3000, strictPort: true },
    plugins: [
      vinext(),
      ...workerPlugins,
    ],
  };
});
