export interface PdfTextExtractionResult {
  text: string;
  pageCount: number;
  truncated: boolean;
}

const MAX_TEXT_LENGTH = 200_000;
let pdfJsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

async function loadPdfJs() {
  pdfJsPromise ??= Promise.all([
    import('pdfjs-dist'),
    // Registers WorkerMessageHandler without relying on a CDN worker URL.
    // Metro loads this path only after the student selects a PDF.
    import('pdfjs-dist/build/pdf.worker.mjs'),
  ]).then(([pdfjs]) => pdfjs);
  return pdfJsPromise;
}

/** Extracts selectable text from a PDF in the Expo web runtime. */
export async function extractTextFromPDF(
  source: ArrayBuffer,
): Promise<PdfTextExtractionResult | null> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(source.slice(0)) });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const pages: string[] = [];
  let length = 0;
  let truncated = false;

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .flatMap((item) => ('str' in item ? [item.str] : []))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!pageText) continue;
      const section = `\n--- PAGE ${pageNumber} ---\n${pageText}`;
      const remaining = MAX_TEXT_LENGTH - length;
      if (section.length > remaining) {
        pages.push(section.slice(0, Math.max(0, remaining)));
        truncated = true;
        break;
      }
      pages.push(section);
      length += section.length;
    }
  } finally {
    await loadingTask.destroy();
  }

  const text = pages.join('').trim();
  return text ? { text, pageCount, truncated } : null;
}
