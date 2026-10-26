import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  ...coreWebVitals,
  ...typescript,
  { ignores: [".next/**", "spike/**", ".scratch/**", "public/**", "next-env.d.ts"] },
  {
    rules: {
      // the agent and classic islands own hand-rendered, escaped HTML on purpose (see src/render/html.ts)
      "@next/next/no-img-element": "off",
      // mode switches are full page loads by design, so React never reconciles the agent's hand-managed DOM
      "@next/next/no-html-link-for-pages": "off",
      "@next/next/no-location-assign-relative-destination": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // Playwright fixtures call `use`, which is not React's hook
  { files: ["tests/e2e/**"], rules: { "react-hooks/rules-of-hooks": "off" } },
];
export default config;
