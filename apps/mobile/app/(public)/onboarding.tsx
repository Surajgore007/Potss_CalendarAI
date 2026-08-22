import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function OnboardingScreen() {
  const router = useRouter();
  const [selectedBrand, setSelectedBrand] = useState<'xiaomi' | 'oneplus' | 'samsung' | 'oppo' | 'pixel'>('samsung');

  const brandGuides = {
    samsung: {
      title: 'Samsung (One UI)',
      steps: [
        'Open Settings -> Apps -> EventPulse',
        'Tap "Battery" -> Choose "Unrestricted"',
        'Open "Alarms & Reminders" -> Toggle "Allow setting alarms"',
      ],
    },
    xiaomi: {
      title: 'Xiaomi / Redmi / POCO (MIUI / HyperOS)',
      steps: [
        'Settings -> Apps -> Manage Apps -> EventPulse',
        'Enable "Autostart" toggle',
        'Battery saver -> Choose "No restrictions"',
        'Permissions -> Enable "Alarms & Reminders"',
      ],
    },
    oneplus: {
      title: 'OnePlus / Realme (OxygenOS / ColorOS)',
      steps: [
        'Settings -> Apps -> App Management -> EventPulse',
        'Battery usage -> Allow background activity & Auto-launch',
        'Special app access -> Alarms & Reminders -> Allow',
      ],
    },
    oppo: {
      title: 'Oppo / Vivo',
      steps: [
        'Settings -> Battery -> Background power consumption -> High usage allowed',
        'Settings -> Apps -> Special app access -> Alarms -> Enable',
      ],
    },
    pixel: {
      title: 'Google Pixel / Stock Android',
      steps: [
        'Settings -> Apps -> EventPulse -> App battery usage -> Unrestricted',
        'Alarms & Reminders -> Allowed',
      ],
    },
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="shield-checkmark" size={32} color="#818CF8" />
          </View>
          <Text style={styles.title}>100% Reliable Reminders</Text>
          <Text style={styles.subtitle}>
            To ensure you never miss a registration deadline even when EventPulse is fully closed,
            Android requires two quick permissions:
          </Text>
        </View>

        {/* Step 1: Exact Alarms */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.stepNumber, { backgroundColor: '#4F46E5' }]}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Exact Alarms Permission</Text>
              <Text style={styles.cardSubtitle}>
                Allows the OS to fire notifications at the exact minute without delay.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {
              // Trigger permission flow in Phase 3
            }}
          >
            <Ionicons name="alarm-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.actionBtnText}>Grant Exact Alarm Permission</Text>
          </TouchableOpacity>
        </View>

        {/* Step 2: Battery Optimization Guide */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.stepNumber, { backgroundColor: '#059669' }]}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Battery Optimization Exemption</Text>
              <Text style={styles.cardSubtitle}>
                Prevents aggressive phone cleaners from killing scheduled reminders.
              </Text>
            </View>
          </View>

          <Text style={styles.selectBrandLabel}>Select your phone manufacturer:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.brandTabs}>
            {(['samsung', 'xiaomi', 'oneplus', 'oppo', 'pixel'] as const).map((b) => (
              <TouchableOpacity
                key={b}
                style={[styles.brandTab, selectedBrand === b && styles.brandTabSelected]}
                onPress={() => setSelectedBrand(b)}
              >
                <Text style={[styles.brandTabText, selectedBrand === b && styles.brandTabTextSelected]}>
                  {b.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.instructionsBox}>
            <Text style={styles.instructionTitle}>{brandGuides[selectedBrand].title}</Text>
            {brandGuides[selectedBrand].steps.map((step, idx) => (
              <View key={idx} style={styles.instructionStep}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Done Button */}
        <TouchableOpacity
          style={styles.doneBtn}
          activeOpacity={0.85}
          onPress={() => router.replace('/(auth)')}
        >
          <Text style={styles.doneBtnText}>I'm All Set, Open Calendar</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#090D16',
  },
  container: {
    padding: 20,
    gap: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 8,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1E1B4B',
    borderWidth: 1.5,
    borderColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  selectBrandLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  brandTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  brandTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  brandTabSelected: {
    backgroundColor: '#059669',
    borderColor: '#10B981',
  },
  brandTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  brandTabTextSelected: {
    color: '#FFFFFF',
  },
  instructionsBox: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  instructionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#34D399',
    marginBottom: 4,
  },
  instructionStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  bullet: {
    fontSize: 14,
    color: '#94A3B8',
  },
  stepText: {
    flex: 1,
    fontSize: 12,
    color: '#CBD5E1',
    lineHeight: 17,
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
