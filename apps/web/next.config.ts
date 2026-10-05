import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Not on Next's built-in external list: pdfjs-dist loads its worker and font
  // files from disk and @napi-rs/canvas is a native addon, so both must stay
  // as plain Node requires rather than bundled (used by lib/pdf-to-images.ts).
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  // pdf.js reads these at runtime by path, which file tracing can't see. The
  // receipt upload server action runs from /documents.
  outputFileTracingIncludes: {
    "/documents": [
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
};

export default nextConfig;
