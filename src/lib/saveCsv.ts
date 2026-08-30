import { Share } from 'react-native';

/**
 * Hand an export to the platform, on iOS and Android.
 *
 * A file-extension split rather than a `Platform.OS` branch, matching
 * `pdfTextExtraction.ts` / `.web.ts` and `FileDropzone.tsx` / `.web.tsx`. Metro
 * picks the web file on web and this one everywhere else, so neither half ever
 * has to test which platform it is running on.
 *
 * ponytail: the CSV rides in the share sheet's message body. That is right for
 * a screen's worth of rows and unpleasant for a thousand, because some share
 * targets truncate a long message and none of them name the file. Measured at
 * review: a term of one department is 362 KB, which is also large enough to be
 * a Binder transaction risk on Android. The upgrade
 * is `expo-file-system` writing to the cache directory plus `expo-sharing` —
 * neither is installed, and two dependencies is a lot for a path an
 * administrator exporting a term of history almost always takes on the web
 * instead. Swap this body if somebody actually exports from a phone.
 */
export async function saveCsv(filename: string, csv: string): Promise<void> {
  await Share.share({ message: csv, title: filename });
}
