import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Client bundles must never pull in D1/R2, auth or job-runner code. The
    // `server-only` package is not used because Node tests import lib files
    // directly. Type-only imports are erased and remain allowed.
    files: [
      "components/site/**/*.{ts,tsx}",
      "components/admin/**/*.{ts,tsx}",
      "components/publications/**/*.{ts,tsx}",
      "app/**/error.tsx",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/platform",
                "@/lib/admin-auth",
                "@/lib/admin-data",
                "@/lib/job-runner",
                "@/lib/public-content",
                "@/db/*",
                "cloudflare:workers",
                "**/lib/platform",
                "**/lib/admin-auth",
                "**/lib/admin-data",
                "**/lib/job-runner",
                "**/lib/public-content",
                "**/db/*",
              ],
              allowTypeImports: true,
              message: "Server-only module: load data in a server component and pass it to client components as props.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
