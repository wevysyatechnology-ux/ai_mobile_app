import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import StartupLoadingView from '@/components/shared/StartupLoadingView';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isProfileComplete, isLoading } = useAuth();
  const [routing, setRouting] = useState(false);

  const goToNextScreen = useCallback(() => {
    if (routing) return;
    setRouting(true);

    if (isLoading) {
      // Auth still resolving — wait briefly and retry
      setTimeout(() => setRouting(false), 200);
      return;
    }

    if (!isAuthenticated) {
      router.replace('/auth/login');
    } else if (!isProfileComplete) {
      router.replace('/auth/profile-setup');
    } else {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, isProfileComplete, router, routing]);

  useEffect(() => {
    if (routing && !isLoading) {
      goToNextScreen();
    }
  }, [routing, isLoading, goToNextScreen]);

  return <StartupLoadingView onEnter={goToNextScreen} />;
}
