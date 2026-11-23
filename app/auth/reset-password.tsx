import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyRound, Lock, Eye, EyeOff } from 'lucide-react-native';
import { authService } from '@/services/authService';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();

  const [isExchanging, setIsExchanging] = useState(true);
  const [exchangeError, setExchangeError] = useState('');
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const initResetFlow = async () => {
      console.log('🔄 ResetPasswordScreen - URL parameters:', params);

      // 1. Check if there was an error in redirecting (e.g. expired link)
      if (params.error) {
        setExchangeError(params.error_description || params.error || 'The reset link is invalid or has expired.');
        setIsExchanging(false);
        return;
      }

      // 2. If code exists, exchange code for session
      if (params.code) {
        setIsExchanging(true);
        console.log('🔄 Exchanging code for session...');
        const result = await authService.exchangeCodeForSession(params.code);
        
        if (result.success) {
          console.log('✅ Session obtained successfully from code');
          setExchangeError('');
        } else {
          console.error('❌ Code exchange failed:', result.error);
          setExchangeError(result.error || 'Failed to verify reset link. It may have expired or already been used.');
        }
        setIsExchanging(false);
        return;
      }

      // 3. Fallback: check if session is already active (e.g. from prior success or implicit login)
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        console.log('✅ Found active session, allowing password update');
        setExchangeError('');
        setIsExchanging(false);
      } else {
        console.warn('⚠️ No code param and no active session found');
        setExchangeError('No reset authorization found. Please request a new password reset email.');
        setIsExchanging(false);
      }
    };

    initResetFlow();
  }, [params.code, params.error, params.error_description]);

  const handleUpdatePassword = async () => {
    if (!password) {
      setError('Please enter a new password');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    setError('');

    const result = await authService.updatePassword(password);

    if (result.success) {
      // Sign out immediately to clear recovery session and ensure they log back in
      await authService.signOut();
      setIsLoading(false);
      
      Alert.alert(
        'Success',
        'Your password has been reset successfully. Please sign in with your new password.',
        [
          {
            text: 'Sign In',
            onPress: () => router.replace('/auth/login'),
          },
        ]
      );
    } else {
      setIsLoading(false);
      setError(result.error || 'Failed to update password. Please try again.');
    }
  };

  if (isExchanging) {
    return (
      <LinearGradient colors={[colors.bg_primary, colors.bg_secondary]} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent_green_bright} />
          <Text style={styles.loadingText}>Verifying reset request...</Text>
        </View>
      </LinearGradient>
    );
  }

  if (exchangeError) {
    return (
      <LinearGradient colors={[colors.bg_primary, colors.bg_secondary]} style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.errorIconContainer}>
              <Text style={styles.errorIcon}>⚠️</Text>
            </View>
            <Text style={styles.title}>Verification Failed</Text>
            <Text style={styles.subtitle}>{exchangeError}</Text>
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace('/auth/login')}>
            <Text style={styles.buttonText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[colors.bg_primary, colors.bg_secondary]} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <KeyRound size={40} color={colors.accent_green_bright} strokeWidth={1.5} />
            </View>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
              Set a strong, new password for your account to restore access.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="New Password"
                placeholderTextColor={colors.text_muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password-new"
                editable={!isLoading}
                autoFocus
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowPassword(!showPassword)}>
                {showPassword ? (
                  <EyeOff size={22} color={colors.text_muted} />
                ) : (
                  <Eye size={22} color={colors.text_muted} />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                placeholderTextColor={colors.text_muted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoComplete="password-new"
                editable={!isLoading}
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                {showConfirmPassword ? (
                  <EyeOff size={22} color={colors.text_muted} />
                ) : (
                  <Eye size={22} color={colors.text_muted} />
                )}
              </TouchableOpacity>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleUpdatePassword}
              disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color={colors.bg_primary} />
              ) : (
                <Text style={styles.buttonText}>Reset Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 16,
    color: colors.text_muted,
    marginTop: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.2)',
  },
  errorIconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  errorIcon: {
    fontSize: 36,
  },
  title: {
    fontFamily: 'Poppins-Bold',
    fontSize: 28,
    color: colors.text_primary,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 16,
    color: colors.text_muted,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 12,
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
    position: 'relative',
  },
  input: {
    backgroundColor: 'rgba(52, 211, 153, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.2)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontFamily: 'Poppins-Regular',
    fontSize: 18,
    color: colors.text_primary,
    textAlign: 'center',
  },
  eyeIcon: {
    position: 'absolute',
    right: 20,
    top: 18,
    padding: 4,
  },
  button: {
    backgroundColor: colors.accent_green_bright,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: colors.accent_green_bright,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 18,
    color: colors.bg_primary,
  },
  errorText: {
    fontFamily: 'Poppins-Regular',
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
});
