import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const { user, signInWithGoogle, signInAsDemoUser, isLoading } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (user) {
      router.replace('/(auth)');
    }
  }, [user]);

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    try {
      await signInWithGoogle();
      router.replace('/(auth)');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(
        err.message || 'Google Sign-In failed. Try Demo Mode for instant testing.'
      );
    }
  };

  const handleDemoSignIn = async () => {
    setErrorMsg(null);
    try {
      await signInAsDemoUser('Suraj Dev', 'suraj.dev@example.com');
      router.replace('/(auth)');
    } catch (err: any) {
      setErrorMsg('Demo sign in failed.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Brand Header */}
        <View style={styles.brandSection}>
          <View style={styles.logoBadge}>
            <Ionicons name="pulse" size={32} color="#3B82F6" />
          </View>
          <Text style={styles.brandTitle}>EventPulse</Text>
          <Text style={styles.brandTagline}>
            AI-Powered WhatsApp Event & Deadline Calendar
          </Text>
        </View>

        {/* Feature Cards Grid */}
        <View style={styles.featuresSection}>
          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="sparkles" size={20} color="#3B82F6" />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Groq LPU AI Extraction</Text>
              <Text style={styles.featureDesc}>
                Paste any unstructured WhatsApp message and extract events in ~200ms.
              </Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="alarm" size={20} color="#D97706" />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Deadline vs Event Distinction</Text>
              <Text style={styles.featureDesc}>
                Never miss registration deadlines separated from the actual event date.
              </Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="git-network-outline" size={20} color="#DC2626" />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Calendar Clash Detection</Text>
              <Text style={styles.featureDesc}>
                Flags same-day hackathons and overlapping workshop schedules.
              </Text>
            </View>
          </View>
        </View>

        {/* Error message */}
        {errorMsg && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color="#EF4444" />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        {/* Auth CTA Buttons */}
        <View style={styles.ctaSection}>
          {/* Demo Mode Button (Instant preview) */}
          <TouchableOpacity
            style={styles.demoButton}
            onPress={handleDemoSignIn}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            <View style={styles.btnContent}>
              <Ionicons name="play-circle" size={20} color="#FFFFFF" />
              <Text style={styles.demoButtonText}>Try Demo Mode (Instant)</Text>
            </View>
          </TouchableOpacity>

          {/* Google Sign-In */}
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleSignIn}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color="#0F172A" size="small" />
            ) : (
              <View style={styles.btnContent}>
                <Ionicons name="logo-google" size={18} color="#EA4335" />
                <Text style={styles.googleButtonText}>Sign in with Google</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.disclaimerText}>
            Demo mode enables full local preview without Firebase configuration.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EEF2F6',
  },
  container: {
    padding: 24,
    justifyContent: 'center',
    minHeight: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    width: '100%',
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  brandTagline: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  featuresSection: {
    gap: 12,
    marginBottom: 32,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
    gap: 14,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  featureDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
  },
  ctaSection: {
    gap: 12,
  },
  demoButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  demoButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 15,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  googleButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
  },
});
