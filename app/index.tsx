import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import StartupLoadingView from '@/components/shared/StartupLoadingView';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isProfileComplete, isLoading } = useAuth();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    // On web, detect Supabase auth redirects in the URL hash fragment (e.g. recovery / reset password)
    if (Platform.OS === 'web') {
      const hash = window.location.hash;
      if (hash) {
        const hashStr = hash.substring(1);
        const params = new URLSearchParams(hashStr);
        
        // 1. Detect if there is a redirection error (like otp_expired)
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

        // 2. Detect recovery tokens
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const type = params.get('type');
        
        if (accessToken && refreshToken && type === 'recovery') {
          console.log('🔄 Hash contains recovery session. Setting session...');
          setIsRecovery(true);
          supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          }).then(({ data, error: sessionError }) => {
            if (!sessionError) {
              console.log('✅ Recovery session set successfully, routing to reset-password');
              router.replace('/auth/reset-password');
            } else {
              console.error('❌ Failed to set recovery session from hash:', sessionError);
              setIsRecovery(false);
            }
          });
        }
      }
    }
  }, []);

  useEffect(() => {
    const minDisplayTimer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, 2500);

    return () => clearTimeout(minDisplayTimer);
  }, []);

  useEffect(() => {
    console.log('Index screen - isLoading:', isLoading, 'isAuthenticated:', isAuthenticated, 'isProfileComplete:', isProfileComplete, 'minTimeElapsed:', minTimeElapsed, 'isRecovery:', isRecovery);

    if (isRecovery) {
      return; // Do not perform standard redirects if we are processing a recovery hash
    }

    if (!isLoading && minTimeElapsed) {
      if (!isAuthenticated) {
        console.log('Redirecting to login');
        router.replace('/auth/login');
      } else if (!isProfileComplete) {
        console.log('Redirecting to profile setup');
        router.replace('/auth/profile-setup');
      } else {
        console.log('Redirecting to tabs');
        router.replace('/(tabs)');
      }
    }
  }, [isAuthenticated, isProfileComplete, isLoading, minTimeElapsed, isRecovery]);

  return <StartupLoadingView />;
}
