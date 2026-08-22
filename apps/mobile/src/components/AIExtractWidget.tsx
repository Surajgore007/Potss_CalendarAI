import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface AIExtractWidgetProps {
  userName?: string;
}

export const AIExtractWidget: React.FC<AIExtractWidgetProps> = ({
  userName = 'Suraj',
}) => {
  const router = useRouter();
  const [quickText, setQuickText] = useState('');

  const handleQuickExtract = () => {
    if (!quickText.trim()) {
      router.push('/extract');
      return;
    }
    // Navigate to extract screen with the prefilled text
    router.push({
      pathname: '/extract',
      params: { initialText: quickText },
    });
  };

  return (
    <View style={styles.container}>
      {/* 3D Soft Gradient Sphere / Icon */}
      <View style={styles.sphereContainer}>
        <View style={styles.sphereGlow}>
          <Ionicons name="sparkles" size={32} color="#3B82F6" />
        </View>
      </View>

      {/* Greeting Title */}
      <Text style={styles.greetingTitle}>Welcome, {userName}</Text>
      <Text style={styles.greetingSubtitle}>
        What events or deadlines can I extract today?
      </Text>

      {/* Quick Action Chips */}
      <View style={styles.chipRow}>
        <TouchableOpacity
          style={styles.actionChip}
          onPress={() => router.push('/extract')}
        >
          <Ionicons name="clipboard-outline" size={13} color="#475569" />
          <Text style={styles.actionChipText}>Paste WhatsApp</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionChip}
          onPress={() => router.push('/calendar')}
        >
          <Ionicons name="warning-outline" size={13} color="#475569" />
          <Text style={styles.actionChipText}>Check Clashes</Text>
        </TouchableOpacity>
      </View>

      {/* Input Box */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Paste message or ask anything..."
          placeholderTextColor="#94A3B8"
          value={quickText}
          onChangeText={setQuickText}
          onSubmitEditing={handleQuickExtract}
        />
        <TouchableOpacity
          style={styles.sendBtn}
          onPress={handleQuickExtract}
          activeOpacity={0.8}
        >
          <Ionicons name="send" size={15} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    flex: 1,
    minWidth: 280,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sphereContainer: {
    marginBottom: 12,
    alignItems: 'center',
  },
  sphereGlow: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(191, 219, 254, 0.6)',
  },
  greetingTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  greetingSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 16,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  actionChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    width: '100%',
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 4,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});
