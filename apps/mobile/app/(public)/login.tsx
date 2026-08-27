import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { GlassButton } from '../../src/components/ui/GlassButton';
import { GlassInput } from '../../src/components/ui/GlassInput';
import { colors, radii, shadows } from '../../src/theme/tokens';

export default function LoginScreen() {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    isLoading,
    authError,
  } = useAuth();

  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const displayError = errorMsg || authError;

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Google Sign-in trigger error:', err);
      setErrorMsg(err.message || 'Google sign-in was not completed. Please try again.');
    }
  };

  const handleAuthSubmit = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    const cleanName = fullName.trim();

    if (!cleanEmail) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    if (!cleanPassword) {
      setErrorMsg('Please enter your password.');
      return;
    }

    try {
      if (authMode === 'signup') {
        if (cleanPassword.length < 6) {
          setErrorMsg('Password must be at least 6 characters.');
          return;
        }
        await signUpWithEmail(cleanEmail, cleanPassword, cleanName || undefined);
      } else {
        await signInWithEmail(cleanEmail, cleanPassword);
      }
    } catch (err: any) {
      console.error('Auth submit error:', err);
      // Handled and mapped in AuthContext
    }
  };

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Please enter your email address in the field above first.');
      return;
    }

    try {
      await sendPasswordReset(cleanEmail);
      setSuccessMsg(`Password reset link sent. Please check your inbox.`);
    } catch (err: any) {
      console.error('Password reset error:', err);
      setErrorMsg("Could not send password reset email. Please try again.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand Header */}
          <View style={styles.brandSection}>
            <View style={styles.logoBadge}>
              <Ionicons name="calendar-outline" size={26} color={colors.primary} />
            </View>
            <Text style={styles.brandTitle} numberOfLines={1}>Vanko</Text>
            <Text style={styles.brandTagline} numberOfLines={1}>
              Intelligent Event & Deadline Calendar
            </Text>
          </View>

          {/* Feature Highlights */}
          <GlassCard contentStyle={styles.featuresList}>
            <View style={styles.featureItem}>
              <View style={[styles.featureIconWrap, { backgroundColor: colors.canvasSubtle }]}>
                <Ionicons name="sparkles-outline" size={15} color={colors.textPrimary} />
              </View>
              <View style={styles.featureTextCol}>
                <Text style={styles.featureTitle} numberOfLines={1}>Instant Smart Extraction</Text>
                <Text style={styles.featureSub} numberOfLines={2}>
                  Converts forwarded announcements into structured calendar items.
                </Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <View style={[styles.featureIconWrap, { backgroundColor: colors.canvasSubtle }]}>
                <Ionicons name="shield-checkmark-outline" size={15} color={colors.textPrimary} />
              </View>
              <View style={styles.featureTextCol}>
                <Text style={styles.featureTitle} numberOfLines={1}>Private Cloud Sync</Text>
                <Text style={styles.featureSub} numberOfLines={2}>
                  Your personalized schedule stays synced across your devices.
                </Text>
              </View>
            </View>
          </GlassCard>

          {/* Main Auth Form Card */}
          <GlassCard contentStyle={styles.formCard}>
            {/* Google One-Tap Sign In */}
            <GlassButton
              title="Continue with Google"
              variant="glass"
              onPress={handleGoogleSignIn}
              loading={isLoading}
              icon={<Ionicons name="logo-google" size={17} color={colors.textPrimary} />}
              style={styles.googleBtn}
              textStyle={styles.googleBtnText}
            />

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with email</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Segmented Auth Switcher */}
            <View style={styles.segmentedControl}>
              <TouchableOpacity
                style={[
                  styles.segmentBtn,
                  authMode === 'signin' && styles.segmentBtnActive,
                ]}
                onPress={() => {
                  setAuthMode('signin');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentText,
                    authMode === 'signin' && styles.segmentTextActive,
                  ]}
                  numberOfLines={1}
                >
                  Sign In
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.segmentBtn,
                  authMode === 'signup' && styles.segmentBtnActive,
                ]}
                onPress={() => {
                  setAuthMode('signup');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentText,
                    authMode === 'signup' && styles.segmentTextActive,
                  ]}
                  numberOfLines={1}
                >
                  Create Account
                </Text>
              </TouchableOpacity>
            </View>

            {/* Error & Success Feedback Alerts */}
            {displayError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.errorBannerText} numberOfLines={3}>{displayError}</Text>
              </View>
            )}

            {successMsg && (
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                <Text style={styles.successBannerText} numberOfLines={2}>{successMsg}</Text>
              </View>
            )}

            {/* Form Fields with Input Limits */}
            <View style={styles.fieldsStack}>
              {authMode === 'signup' && (
                <GlassInput
                  label="Full Name"
                  placeholder="Alex Doe"
                  value={fullName}
                  onChangeText={setFullName}
                  maxLength={64}
                  autoCapitalize="words"
                  autoCorrect={false}
                  leftIcon={<Ionicons name="person-outline" size={16} color={colors.textTertiary} />}
                />
              )}

              <GlassInput
                label="Email Address"
                placeholder="alex@example.com"
                value={email}
                onChangeText={setEmail}
                maxLength={100}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                leftIcon={<Ionicons name="mail-outline" size={16} color={colors.textTertiary} />}
              />

              <GlassInput
                label="Password"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                maxLength={64}
                secureTextEntry
                leftIcon={<Ionicons name="lock-closed-outline" size={16} color={colors.textTertiary} />}
              />

              {authMode === 'signin' && (
                <TouchableOpacity
                  style={styles.forgotBtn}
                  onPress={handleForgotPassword}
                  activeOpacity={0.7}
                >
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Submit Button */}
            <GlassButton
              title={authMode === 'signin' ? 'Sign In' : 'Create Free Account'}
              variant="primary"
              onPress={handleAuthSubmit}
              loading={isLoading}
              style={styles.submitBtn}
            />

            {/* Security Guarantee Footer */}
            <View style={styles.securityRow}>
              <Ionicons name="lock-closed-outline" size={12} color={colors.textTertiary} />
              <Text style={styles.securityText} numberOfLines={1}>
                Protected with end-to-end cloud encryption
              </Text>
            </View>
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  flexOne: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 40,
    gap: 14,
    maxWidth: 440,
    alignSelf: 'center',
    width: '100%',
  },
  brandSection: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  logoBadge: {
    width: 54,
    height: 54,
    borderRadius: radii.card,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.subtle,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  brandTagline: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '400',
    lineHeight: 18,
  },
  featuresList: {
    padding: 14,
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextCol: {
    flex: 1,
    minWidth: 0,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 18,
  },
  featureSub: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  formCard: {
    padding: 16,
    gap: 14,
  },
  googleBtn: {
    minHeight: 46,
    backgroundColor: '#FFFFFF',
    borderColor: colors.glassBorder,
  },
  googleBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.glassBorder,
  },
  dividerText: {
    fontSize: 11,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.canvasSubtle,
    borderRadius: radii.control,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.control - 3,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    ...shadows.subtle,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 18,
  },
  segmentTextActive: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.15)',
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    color: colors.danger,
    lineHeight: 16,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.15)',
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  successBannerText: {
    flex: 1,
    fontSize: 12,
    color: colors.success,
    lineHeight: 16,
  },
  fieldsStack: {
    gap: 10,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 2,
  },
  forgotText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  submitBtn: {
    minHeight: 48,
    marginTop: 2,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 4,
  },
  securityText: {
    fontSize: 11,
    color: colors.textTertiary,
    lineHeight: 16,
  },
});
