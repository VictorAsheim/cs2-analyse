import type { NextConfig } from "next";

// One codebase, two modes. Unset, this is the local tool: upload a demo, the
// worker parses it, API routes serve the result. With CS2_STATIC=1 the same
// pages are exported as flat files for GitHub Pages, which has no server to
// run the upload or parse steps.
const isStatic = process.env.CS2_STATIC === "1";

// A GitHub Pages project site is served from /<repo>, so every asset and link
// needs that prefix. The publish script passes it; a user site at the domain
// root passes nothing.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(isStatic
    ? {
        output: "export" as const,
        basePath,
        // Pages serves /match/x as a directory, so emit match/x/index.html.
        trailingSlash: true,
        // The default image loader needs a server; the radar is a plain <img>
        // off the static folder either way.
        images: { unoptimized: true },
      }
    : {}),
  // Both of these imply Partial Prerendering, which streams from a server and
  // cannot be combined with a static export. The published build is flat files
  // with no server, so neither applies to it.
  cacheComponents: !isStatic,
  partialPrefetching: !isStatic,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
