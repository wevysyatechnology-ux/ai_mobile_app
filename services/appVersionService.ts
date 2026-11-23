import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getAppVersion, getBuildNumber } from '@/utils/appVersion';

export interface AppVersionConfig {
  platform: 'ios' | 'android';
  latest_version: string;
  store_url: string;
  message: string | null;
}

const platform = (): 'ios' | 'android' | null =>
  Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : null;

export const AppVersionService = {
  /** Latest version + store link for this platform, or null if unavailable (offline, no row). Callers must treat null as "nothing to announce". */
  async getConfig(): Promise<AppVersionConfig | null> {
    const p = platform();
    if (!p) return null;
    try {
      const { data, error } = await supabase
        .from('app_version_config')
        .select('platform, latest_version, store_url, message')
        .eq('platform', p)
        .maybeSingle();
      if (error) {
        console.warn('[appVersion] could not load version config:', error.message);
        return null;
      }
      return data as AppVersionConfig | null;
    } catch (e) {
      console.warn('[appVersion] version config request failed:', e);
      return null;
    }
  },

  /** Records which version this member is running, so support can see it. Best effort. */
  async reportVersion(userId: string): Promise<void> {
    const p = platform();
    if (!p) return;
    try {
      await supabase
        .from('users_profile')
        .update({
          app_version: getAppVersion(),
          app_build: getBuildNumber() || null,
          app_platform: p,
          app_version_seen_at: new Date().toISOString(),
        })
        .eq('id', userId);
    } catch (e) {
      console.warn('[appVersion] could not report version:', e);
    }
  },
};
