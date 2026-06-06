import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoName =
  process.env.PAGES_BASE ?? process.env.GITHUB_REPOSITORY?.split("/").pop() ?? "versus";

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES === "true" ? `/${repoName}/` : "/",
});
