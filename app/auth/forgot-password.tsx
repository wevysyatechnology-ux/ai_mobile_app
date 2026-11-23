import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Mail, KeyRound, CheckCircle2, ShieldCheck, Eye, EyeOff } from 'lucide-react-native';
import { authService } from '@/services/authService';
import { colors } from '@/constants/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [step, setStep] = useState<'request' | 'verify'>('request'); // 'request' or 'verify'
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleRequestOtp = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccessMessage('');

    const result = await authService.resetPassword(trimmedEmail);

    setIsLoading(false);

    if (result.success) {
      setStep('verify');
      setSuccessMessage('A verification code has been sent to your email.');
    } else {
      setError(result.error || 'Failed to send reset code. Please try again.');
    }
  };

  const handleResetPassword = async () => {
    const trimmedOtp = otp.trim();
    if (!trimmedOtp) {
      setError('Please enter the verification code');
      return;
    }

    // The code length is a Supabase Auth setting (currently 8 digits); accept 6-8 so a change there doesn't break this screen.
    if (!/^\d{6,8}$/.test(trimmedOtp)) {
      setError('Please enter the complete verification code from your email');
      return;
    }

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

    // 1. Verify OTP first
    const verifyResult = await authService.verifyRecoveryOtp(email.trim(), trimmedOtp);

    if (!verifyResult.success) {
      setIsLoading(false);
      setError(verifyResult.error || 'Invalid or expired verification code');
      return;
    }

    // 2. If OTP is valid, the user now has an active session. Update their password.
    const updateResult = await authService.updatePassword(password);

    if (updateResult.success) {
      // 3. Clear session and redirect
      await authService.signOut();
      setIsLoading(false);
      
      Alert.alert(
        'Password Reset Successful',
        'Your password has been changed successfully. Please log in with your new password.',
        [
          {
            text: 'Sign In',
            onPress: () => router.replace('/auth/login'),
          },
        ]
      );
    } else {
      setIsLoading(false);
      setError(updateResult.error || 'Failed to update password. Please try again.');
    }
  };

  return (
    <LinearGradient colors={[colors.bg_primary, colors.bg_secondary]} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => {
            if (step === 'verify') {
              setStep('request');
              setError('');
              setSuccessMessage('');
            } else {
              router.back();
            }
          }}
          disabled={isLoading}>
          <ArrowLeft size={24} color={colors.text_primary} />
        </TouchableOpacity>

        <View style={styles.content}>
          {step === 'request' ? (
            <>
              <View style={styles.header}>
                <View style={styles.iconContainer}>
                  <Mail size={40} color={colors.accent_green_bright} strokeWidth={1.5} />
                </View>
                <Text style={styles.title}>Forgot Password</Text>
                <Text style={styles.subtitle}>
                  Enter your registered email address. We will send you a verification code to reset your password.
                </Text>
              </View>

              <View style={styles.form}>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="Email Address"
                    placeholderTextColor={colors.text_muted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    editable={!isLoading}
                    autoFocus
                  />
                </View>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <TouchableOpacity
                  style={[styles.button, isLoading && styles.buttonDisabled]}
                  onPress={handleRequestOtp}
                  disabled={isLoading}>
                  {isLoading ? (
                    <ActivityIndicator color={colors.bg_primary} />
                  ) : (
                    <Text style={styles.buttonText}>Send Code</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.header}>
                <View style={styles.iconContainer}>
                  <ShieldCheck size={40} color={colors.accent_green_bright} strokeWidth={1.5} />
                </View>
                <Text style={styles.title}>Reset Password</Text>
                <Text style={styles.subtitle}>
                  Enter the OTP sent to <Text style={styles.emailHighlight}>{email.trim()}</Text> and your new password.
                </Text>
              </View>

              <View style={styles.form}>
                {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}

                <View style={styles.inputContainer}>
                  <TextInput
                    style={[styles.input, styles.otpInput]}
                    placeholder="Enter OTP"
                    placeholderTextColor={colors.text_muted}
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={8}
                    editable={!isLoading}
                    autoFocus
                  />
                </View>

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
                  onPress={handleResetPassword}
                  disabled={isLoading}>
                  {isLoading ? (
                    <ActivityIndicator color={colors.bg_primary} />
                  ) : (
                    <Text style={styles.buttonText}>Reset Password</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.optionsContainer}>
                  <TouchableOpacity 
                    onPress={handleRequestOtp} 
                    disabled={isLoading}
                    style={styles.optionButton}>
                    <Text style={styles.optionText}>Resend Code</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    onPress={() => {
                      setStep('request');
                      setError('');
                      setSuccessMessage('');
                    }} 
                    disabled={isLoading}
                    style={styles.optionButton}>
                    <Text style={styles.optionText}>Change Email</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
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
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
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
  emailHighlight: {
    fontFamily: 'Poppins-SemiBold',
    color: colors.accent_green_bright,
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 16,
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
  otpInput: {
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 4,
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
    marginTop: 8,
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
  successText: {
    fontFamily: 'Poppins-Regular',
    color: colors.accent_green_bright,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.2)',
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginTop: 8,
  },
  optionButton: {
    padding: 8,
  },
  optionText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: colors.accent_green_bright,
  },
});
