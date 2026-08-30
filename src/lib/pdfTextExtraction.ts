export interface PdfTextExtractionResult {
  text: string;
  pageCount: number;
  truncated: boolean;
}

/** Native sends PDF bytes to the authenticated parser; file access alone cannot decode PDF text. */
export async function extractTextFromPDF(
  _source: ArrayBuffer,
): Promise<PdfTextExtractionResult | null> {
  return null;
}
