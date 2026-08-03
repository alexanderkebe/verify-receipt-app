// ============================================
// Share the release APK via the native share sheet
//
// Downloads the built APK into the app's cache directory, then opens the
// Android share sheet so users can send it through messaging apps, Wi-Fi
// Direct, Bluetooth, email, etc. — no Play Store link involved.
//
// This is only meaningful in a release build (the Home screen hides the
// button in __DEV__), which is why it's gated there rather than here.
// ============================================

import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { createDebug } from '@/lib/debug';

const debug = createDebug('[SHARE-APK]');

const APK_FILE_NAME = 'deresegn.apk';
const APK_MIME_TYPE = 'application/vnd.android.package-archive';

/**
 * The public URL of the release APK. Read from the environment override
 * first, then `app.json` → `expo.extra.apkUrl`.
 */
export function getApkUrl(): string | null {
  const url =
    process.env.EXPO_PUBLIC_APK_URL ??
    (Constants.expoConfig?.extra?.apkUrl as string | undefined);
  return url && url.trim() ? url.trim() : null;
}

/**
 * Download the APK (if not already cached) and open the native share sheet.
 *
 * Throws with a human-readable message on failure so the caller can surface
 * it to the user.
 */
export async function shareApk(): Promise<void> {
  const apkUrl = getApkUrl();
  if (!apkUrl) {
    throw new Error('The APK download link is not configured yet.');
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not supported on this device.');
  }

  // Deterministic cache location so we can reuse a prior download.
  const file = new File(Paths.cache, APK_FILE_NAME);

  if (!file.exists) {
    debug('downloading APK from', apkUrl);
    try {
      await File.downloadFileAsync(apkUrl, file);
    } catch (e) {
      debug('download failed:', (e as Error).message);
      // Drop any partial download so the next attempt starts fresh instead
      // of silently sharing a corrupt APK.
      if (file.exists) {
        try {
          file.delete();
        } catch {
          // best effort — cache dir is cleared by the OS anyway
        }
      }
      throw new Error(
        'Could not download the app file. Check your connection and try again.',
      );
    }
  } else {
    debug('APK already cached, reusing', file.uri);
  }

  debug('sharing', file.uri);
  await Sharing.shareAsync(file.uri, {
    mimeType: APK_MIME_TYPE,
    dialogTitle: 'Share Deresegn app',
    UTI: 'com.android.package-archive', // iOS fallback UTI, harmless on Android
  });
}
