import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface Slide {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  accentBg: string;
  title: string;
  subtitle: string;
  steps: { icon: keyof typeof Ionicons.glyphMap; text: string }[];
}

const SLIDES: Slide[] = [
  {
    icon: 'sparkles',
    iconColor: '#6366F1',
    accentBg: 'rgba(99, 102, 241, 0.10)',
    title: 'Welcome to Vanko',
    subtitle: 'Your smart campus event assistant.',
    steps: [
      { icon: 'calendar-outline', text: 'Track hackathons, CTFs, and workshops in one place' },
      { icon: 'school-outline', text: 'See live events from SIES GST community feed' },
      { icon: 'notifications-outline', text: 'Get reminders before deadlines so you never miss out' },
    ],
  },
  {
    icon: 'logo-whatsapp',
    iconColor: '#16A34A',
    accentBg: 'rgba(22, 163, 74, 0.10)',
    title: 'Share from WhatsApp',
    subtitle: 'Extract events in one tap.',
    steps: [
      { icon: 'share-social-outline', text: 'Long press any WhatsApp message with event info' },
      { icon: 'open-outline', text: 'Tap Share → select Vanko from the share sheet' },
      { icon: 'checkmark-circle-outline', text: 'AI extracts all event details instantly — review and save' },
    ],
  },
  {
    icon: 'calendar',
    iconColor: '#0EA5E9',
    accentBg: 'rgba(14, 165, 233, 0.10)',
    title: 'Your Calendar',
    subtitle: 'Everything organised, automatically.',
    steps: [
      { icon: 'time-outline', text: 'Upcoming events and deadlines sorted by date on your dashboard' },
      { icon: 'create-outline', text: 'Edit, skip, or delete any event anytime' },
      { icon: 'alarm-outline', text: 'Automatic local reminders scheduled — no setup needed' },
    ],
  },
];

interface OnboardingModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export function OnboardingModal({ visible, onDismiss }: OnboardingModalProps) {
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  if (!visible) return null;

  const goToSlide = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * SCREEN_W, animated: true });
    setActiveIndex(index);
  };

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      goToSlide(activeIndex + 1);
    } else {
      // Fade out and dismiss
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }).start(() => onDismiss());
    }
  };

  const handleScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (idx !== activeIndex) setActiveIndex(idx);
  };

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      {/* Dark blurred backdrop */}
      <View style={styles.backdrop} />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
        {/* Slide pager */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          scrollEventThrottle={16}
          style={styles.pager}
        >
          {SLIDES.map((slide, i) => (
            <SlideView key={i} slide={slide} />
          ))}
        </ScrollView>

        {/* Dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => goToSlide(i)} style={styles.dotTouch}>
              <View style={[styles.dot, i === activeIndex && styles.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>

        {/* CTA button */}
        <TouchableOpacity
          onPress={handleNext}
          activeOpacity={0.85}
          style={[styles.cta, isLast && styles.ctaLast]}
        >
          <Text style={styles.ctaText}>
            {isLast ? 'Get Started' : 'Next'}
          </Text>
          <Ionicons
            name={isLast ? 'arrow-forward-circle' : 'chevron-forward'}
            size={isLast ? 22 : 18}
            color="#FFFFFF"
            style={{ marginLeft: 6 }}
          />
        </TouchableOpacity>

        {/* Skip (only on non-last slides) */}
        {!isLast && (
          <TouchableOpacity onPress={onDismiss} style={styles.skip}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

function SlideView({ slide }: { slide: Slide }) {
  return (
    <View style={styles.slide}>
      {/* Icon badge */}
      <View style={[styles.iconBadge, { backgroundColor: slide.accentBg }]}>
        <Ionicons name={slide.icon} size={44} color={slide.iconColor} />
      </View>

      {/* Heading */}
      <Text style={styles.slideTitle}>{slide.title}</Text>
      <Text style={styles.slideSubtitle}>{slide.subtitle}</Text>

      {/* Steps */}
      <View style={styles.stepsContainer}>
        {slide.steps.map((step, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={styles.stepIconWrap}>
              <Ionicons name={step.icon} size={18} color="#52525B" />
            </View>
            <Text style={styles.stepText}>{step.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  sheet: {
    backgroundColor: '#FAFAFA',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    // Crisp shadow ring at top
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 18,
  },
  pager: {
    flexGrow: 0,
  },
  slide: {
    width: SCREEN_W,
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 8,
    alignItems: 'center',
  },
  iconBadge: {
    width: 96,
    height: 96,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  slideTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#18181B',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 6,
  },
  slideSubtitle: {
    fontSize: 15,
    color: '#71717A',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  stepsContainer: {
    width: '100%',
    gap: 14,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F4F4F5',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#3F3F46',
    lineHeight: 20,
    paddingTop: 8,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  dotTouch: {
    padding: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#D4D4D8',
  },
  dotActive: {
    backgroundColor: '#18181B',
    width: 20,
    height: 7,
    borderRadius: 999,
  },
  cta: {
    marginHorizontal: 24,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#18181B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLast: {
    backgroundColor: '#6366F1',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  skip: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  skipText: {
    fontSize: 14,
    color: '#A1A1AA',
    fontWeight: '500',
  },
});
