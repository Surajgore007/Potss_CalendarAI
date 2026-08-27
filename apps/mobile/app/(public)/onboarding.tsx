import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { GlassButton } from '../../src/components/ui/GlassButton';
import { colors, radii, shadows } from '../../src/theme/tokens';
import { requestNotificationPermissions } from '../../src/services/notificationService';

export default function OnboardingScreen() {
  const router = useRouter();
  const [selectedBrand, setSelectedBrand] = useState<'samsung' | 'xiaomi' | 'oneplus' | 'oppo' | 'pixel'>('samsung');

  const brandGuides = {
    samsung: {
      title: 'Samsung (One UI)',
      steps: [
        'Open Settings -> Apps -> Vanko',
        'Tap "Battery" -> Choose "Unrestricted"',
        'Open "Alarms & Reminders" -> Toggle "Allow setting alarms"',
      ],
    },
    xiaomi: {
      title: 'Xiaomi / Redmi / POCO (HyperOS / MIUI)',
      steps: [
        'Settings -> Apps -> Manage Apps -> Vanko',
        'Enable "Autostart" toggle',
        'Battery saver -> Choose "No restrictions"',
        'Permissions -> Enable "Alarms & Reminders"',
      ],
    },
    oneplus: {
      title: 'OnePlus / Realme (OxygenOS / ColorOS)',
      steps: [
        'Settings -> Apps -> App Management -> Vanko',
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
        'Settings -> Apps -> Vanko -> App battery usage -> Unrestricted',
        'Alarms & Reminders -> Allowed',
      ],
    },
  };

  const handleGrantPermissions = async () => {
    try {
      await requestNotificationPermissions();
    } catch (e) {
      console.error('Permission request error:', e);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="notifications-outline" size={26} color={colors.textPrimary} />
          </View>
          <Text style={styles.title} numberOfLines={1}>Reliable Reminders</Text>
          <Text style={styles.subtitle} numberOfLines={3}>
            To ensure you receive event and deadline reminders even when Vanko is closed, please enable standard Android notifications:
          </Text>
        </View>

        {/* Step 1: Notifications & Exact Alarms */}
        <GlassCard contentStyle={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.cardTitle} numberOfLines={1}>Notification Permissions</Text>
              <Text style={styles.cardSubtitle} numberOfLines={2}>
                Allows reminders to arrive ahead of registration deadlines and event dates.
              </Text>
            </View>
          </View>
          <GlassButton
            title="Enable Notifications"
            variant="primary"
            onPress={handleGrantPermissions}
            icon={<Ionicons name="notifications-outline" size={16} color="#FFFFFF" />}
            style={styles.actionBtn}
          />
        </GlassCard>

        {/* Step 2: Battery Optimization Guide */}
        <GlassCard contentStyle={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.cardTitle} numberOfLines={1}>Battery Optimization Exemption</Text>
              <Text style={styles.cardSubtitle} numberOfLines={2}>
                Prevents phone battery savers from silencing upcoming notifications.
              </Text>
            </View>
          </View>

          <Text style={styles.selectBrandLabel}>Select your device manufacturer:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.brandTabs}
          >
            {(['samsung', 'xiaomi', 'oneplus', 'oppo', 'pixel'] as const).map((b) => (
              <TouchableOpacity
                key={b}
                style={[styles.brandTab, selectedBrand === b && styles.brandTabSelected]}
                onPress={() => setSelectedBrand(b)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.brandTabText, selectedBrand === b && styles.brandTabTextSelected]}
                  numberOfLines={1}
                >
                  {b.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.instructionsBox}>
            <Text style={styles.instructionTitle} numberOfLines={1}>
              {brandGuides[selectedBrand].title}
            </Text>
            {brandGuides[selectedBrand].steps.map((step, idx) => (
              <View key={idx} style={styles.instructionStep}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        </GlassCard>

        {/* Done Button */}
        <GlassButton
          title="Continue to Calendar"
          variant="primary"
          onPress={() => router.replace('/(auth)')}
          style={styles.doneBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  container: {
    padding: 16,
    paddingBottom: 36,
    gap: 14,
    maxWidth: 440,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: radii.card,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.subtle,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  cardContent: {
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 18,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  actionBtn: {
    minHeight: 44,
    marginTop: 4,
  },
  selectBrandLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  brandTabs: {
    gap: 8,
    paddingVertical: 2,
  },
  brandTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  brandTabSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  brandTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  brandTabTextSelected: {
    color: '#FFFFFF',
  },
  instructionsBox: {
    backgroundColor: colors.canvasSubtle,
    borderRadius: radii.control,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  instructionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 18,
  },
  instructionStep: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
  },
  bullet: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  stepText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  doneBtn: {
    minHeight: 48,
    marginTop: 6,
  },
});
