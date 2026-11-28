import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import StartupLoadingView from '@/components/shared/StartupLoadingView';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isProfileComplete, isLoading } = useAuth();
  const [isRecovery, setIsRecovery] = useState(false);
  const [routing, setRouting] = useState(false);

  // On web, detect Supabase auth redirects in the URL hash fragment
  // (e.g. recovery / reset password) — preserved from Sumit's 2.5.1.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const hash = window.location.hash;
    if (!hash) return;

    const hashStr = hash.substring(1);
    const params = new URLSearchParams(hashStr);

    const error = params.get('error');
    const errorDescription = params.get('error_description');
    if (error) {
      console.log('🔴 Hash contains auth error redirect:', error, errorDescription);
      setIsRecovery(true);
      router.replace({
        pathname: '/auth/reset-password',
        params: { error, error_description: errorDescription },
      });
      return;
    }

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (accessToken && refreshToken && type === 'recovery') {
      console.log('🔄 Hash contains recovery session. Setting session...');
      setIsRecovery(true);
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error: sessionError }) => {
          if (!sessionError) {
            console.log('✅ Recovery session set, routing to reset-password');
            router.replace('/auth/reset-password');
          } else {
            console.error('❌ Failed to set recovery session:', sessionError);
            setIsRecovery(false);
          }
        });
    }
  }, [router]);

  const goToNextScreen = useCallback(() => {
    if (routing || isRecovery) return;

    if (isLoading) {
      // Auth still resolving — mark routing intent and let effect retry
      setRouting(true);
      return;
    }

    setRouting(true);

    if (!isAuthenticated) {
      router.replace('/auth/login');
    } else if (!isProfileComplete) {
      router.replace('/auth/profile-setup');
    } else {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, isProfileComplete, isRecovery, router, routing]);

  // If user tapped Enter while auth was loading, retry when it resolves
  useEffect(() => {
    if (routing && !isLoading && !isRecovery) {
      if (!isAuthenticated) {
        router.replace('/auth/login');
      } else if (!isProfileComplete) {
        router.replace('/auth/profile-setup');
      } else {
        router.replace('/(tabs)');
      }
    }
  }, [routing, isLoading, isAuthenticated, isProfileComplete, isRecovery, router]);

  // Safety fallback: auto-advance after 30s if the user never taps Enter
  useEffect(() => {
    const fallback = setTimeout(() => {
      goToNextScreen();
    }, 30000);
    return () => clearTimeout(fallback);
  }, [goToNextScreen]);

  return <StartupLoadingView onEnter={goToNextScreen} />;
}
