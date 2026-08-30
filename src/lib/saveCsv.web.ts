/**
 * A download, the way the browser already does one.
 *
 * `URL.createObjectURL` and a synthetic anchor, the same pair
 * `FileDropzone.web.tsx` uses to hand a picked file back. No dependency: the
 * platform has had this since before the app did.
 */
export async function saveCsv(filename: string, csv: string): Promise<void> {
  // The byte-order mark is what makes Excel read this as UTF-8 rather than the
  // machine's local codepage. Without it a course title with an accent in it
  // arrives mangled, which on this screen looks like a corrupted record.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoked on the next tick, not immediately: some browsers have not finished
  // reading the blob when `click` returns, and revoking under them cancels the
  // download with no error anywhere.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
