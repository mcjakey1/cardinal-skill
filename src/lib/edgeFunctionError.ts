export function edgeErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const message = (body as { error?: unknown }).error;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 500);
  return fallback;
}
