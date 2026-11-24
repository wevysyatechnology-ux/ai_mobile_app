/**
 * Signup is disabled — membership accounts are created by admins only.
 * Anyone navigating here is immediately redirected to login.
 */
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function SignupScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/auth/login');
  }, []);

  return null;
}
