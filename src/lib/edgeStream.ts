export interface EdgeResponseChunk {
  index: number;
  chunkBytes: number;
  totalBytes: number;
  estimatedTokens: number;
}

export interface EdgeResponseStreamTelemetry {
  onChunk?: (event: EdgeResponseChunk) => void;
}

export async function readEdgeResponseText(
  response: Response,
  telemetry?: EdgeResponseStreamTelemetry,
): Promise<string> {
  if (!telemetry?.onChunk || !response.body?.getReader) {
    const raw = await response.text();
    if (telemetry?.onChunk && raw) {
      const bytes = new TextEncoder().encode(raw).byteLength;
      telemetry.onChunk({
        index: 1,
        chunkBytes: bytes,
        totalBytes: bytes,
        estimatedTokens: Math.ceil(bytes / 4),
      });
    }
    return raw;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let index = 0;
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    index += 1;
    totalBytes += value.byteLength;
    raw += decoder.decode(value, { stream: true });
    telemetry.onChunk({
      index,
      chunkBytes: value.byteLength,
      totalBytes,
      // JSON payload telemetry, not a provider-billed token count.
      estimatedTokens: Math.ceil(totalBytes / 4),
    });
  }
  raw += decoder.decode();
  return raw;
}
