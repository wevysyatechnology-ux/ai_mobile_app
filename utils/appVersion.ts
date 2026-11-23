import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Marketing version of the installed binary, e.g. "2.4.0". */
export function getAppVersion(): string {
  return Constants.nativeAppVersion || Constants.expoConfig?.version || '0.0.0';
}

/** iOS buildNumber / Android versionCode of the installed binary, e.g. "14". */
export function getBuildNumber(): string {
  return (
    Constants.nativeBuildVersion ||
    (Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : String(Constants.expoConfig?.android?.versionCode ?? '')) ||
    ''
  );
}

/** "v2.4.0 (14)" — what we show members and support. */
export function getVersionLabel(): string {
  const build = getBuildNumber();
  return build ? `v${getAppVersion()} (${build})` : `v${getAppVersion()}`;
}

/** Returns <0 if a<b, 0 if equal, >0 if a>b. Compares dotted numeric versions; missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
