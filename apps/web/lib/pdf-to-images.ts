import "server-only";
import { createRequire } from "node:module";
import path from "node:path";

// Bills rarely run past a couple of pages, and every page adds upload size and
// VLM latency, so only the first few are rendered.
const MAX_PAGES = 3;
// Long edge in pixels — enough for small print on a letter page without
// producing multi-megabyte payloads.
const TARGET_LONG_EDGE = 1600;

function standardFontDir() {
  // Digital PDFs often reference Helvetica/Times without embedding them;
  // pdf.js needs its bundled font data to render that text server-side.
  // Resolved from the app root so it works whether or not the module is bundled.
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const dir = path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts");
  // pdf.js insists on a trailing "/" (not path.sep); fs accepts "/" on Windows too.
  return dir.replaceAll("\\", "/") + "/";
}

/**
 * Renders the first pages of a PDF to PNG buffers, for vision models whose
 * APIs accept images but not PDFs. Returns [] if the PDF can't be read.
 */
export async function renderPdfPagesToPng(pdfBuffer: Buffer): Promise<Buffer[]> {
  try {
    const [{ getDocument }, { createCanvas }] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("@napi-rs/canvas"),
    ]);

    const loadingTask = getDocument({
      data: new Uint8Array(pdfBuffer),
      standardFontDataUrl: standardFontDir(),
      verbosity: 0,
    });

    try {
      const pdf = await loadingTask.promise;
      const pages: Buffer[] = [];
      const pageCount = Math.min(pdf.numPages, MAX_PAGES);

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: TARGET_LONG_EDGE / Math.max(base.width, base.height),
        });

        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d");
        // Transparent PNGs read as black-on-black to some VLMs.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: context as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;

        pages.push(canvas.toBuffer("image/png"));
        page.cleanup();
      }

      return pages;
    } finally {
      // In pdf.js 6 teardown lives on the loading task, not the document.
      await loadingTask.destroy();
    }
  } catch (err) {
    console.warn("PDF rendering failed:", err);
    return [];
  }
}
