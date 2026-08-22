import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ExtractedEvent,
  EventType,
  EventMode,
  EVENT_TYPE_CONFIG,
  EVENT_MODE_CONFIG,
  CONFIDENCE_LOW_THRESHOLD,
  validateEventForSave,
} from '@eventpulse/shared';
import { ConfidenceBadge } from './ConfidenceBadge';

interface EditableEventCardProps {
  event: ExtractedEvent;
  index: number;
  total: number;
  onUpdate: (updated: ExtractedEvent) => void;
  onDelete: () => void;
  onSaveSingle: () => void;
  isSaving?: boolean;
}

const EVENT_TYPES: EventType[] = ['hackathon', 'ctf', 'meetup', 'workshop', 'deadline', 'other'];
const EVENT_MODES: EventMode[] = ['online', 'offline', 'hybrid'];

export const EditableEventCard: React.FC<EditableEventCardProps> = ({
  event,
  index,
  total,
  onUpdate,
  onDelete,
  onSaveSingle,
  isSaving = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const issues = validateEventForSave(event);
  const hasErrors = issues.some((i) => i.severity === 'error');
  const isLowConfidence = event.confidence_score < CONFIDENCE_LOW_THRESHOLD;
  const isMissingDates = !event.event_start_date && !event.registration_deadline;

  const handleChange = (field: keyof ExtractedEvent, value: any) => {
    onUpdate({
      ...event,
      [field]: value,
    });
  };

  return (
    <View style={[styles.card, hasErrors && styles.cardErrorBorder]}>
      {/* Header Bar */}
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.indexBadge}>
            <Text style={styles.indexText}>#{index + 1}</Text>
          </View>
          <ConfidenceBadge score={event.confidence_score} />
          {event.duplicate_warning?.is_duplicate && (
            <View style={styles.duplicateBadge}>
              <Ionicons name="copy-outline" size={11} color="#F59E0B" style={{ marginRight: 3 }} />
              <Text style={styles.duplicateText}>Possible Duplicate</Text>
            </View>
          )}
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setIsExpanded((prev) => !prev)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#94A3B8" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, styles.deleteBtn]}
            onPress={onDelete}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={16} color="#F87171" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Warnings & Alerts */}
      {isMissingDates && (
        <View style={styles.missingDateBanner}>
          <Ionicons name="alert-circle" size={16} color="#EF4444" />
          <Text style={styles.missingDateText}>
            Dates missing from message. Please enter the Event Date or Registration Deadline below.
          </Text>
        </View>
      )}

      {isLowConfidence && !isMissingDates && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning-outline" size={16} color="#F59E0B" />
          <Text style={styles.warningText}>
            Low AI extraction confidence. Please verify all fields before saving.
          </Text>
        </View>
      )}

      {event.duplicate_warning?.is_duplicate && (
        <View style={styles.duplicateBanner}>
          <Ionicons name="copy" size={14} color="#F59E0B" />
          <Text style={styles.duplicateBannerText}>
            Matches existing: "{event.duplicate_warning.matched_event_title}"
          </Text>
        </View>
      )}

      {/* Editable Fields */}
      <View style={styles.content}>
        {/* Title Field */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>EVENT TITLE *</Text>
          <TextInput
            style={styles.textInput}
            value={event.title}
            onChangeText={(text) => handleChange('title', text)}
            placeholder="e.g. AI Hackathon 2026"
            placeholderTextColor="#475569"
          />
        </View>

        {/* Type Selector */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>EVENT TYPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {EVENT_TYPES.map((t) => {
              const selected = event.type === t;
              const config = EVENT_TYPE_CONFIG[t];
              return (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.chip,
                    selected && { backgroundColor: config.accentColor, borderColor: config.accentColor },
                  ]}
                  onPress={() => handleChange('type', t)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {config.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {isExpanded && (
          <>
            {/* Mode Selector */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>DELIVERY MODE</Text>
              <View style={styles.modeRow}>
                {EVENT_MODES.map((m) => {
                  const selected = event.mode === m;
                  const config = EVENT_MODE_CONFIG[m];
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[styles.modeButton, selected && styles.modeButtonSelected]}
                      onPress={() => handleChange('mode', m)}
                    >
                      <Ionicons
                        name={config.icon as any}
                        size={13}
                        color={selected ? '#FFFFFF' : '#94A3B8'}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.modeButtonText, selected && styles.modeButtonTextSelected]}>
                        {config.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Critical Dates Row: Registration Deadline & Event Start Date */}
            <View style={styles.rowTwoCols}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <View style={styles.labelWithIcon}>
                  <Ionicons name="alarm" size={12} color="#D97706" />
                  <Text style={[styles.fieldLabel, { color: '#B45309' }]}>REG. DEADLINE</Text>
                </View>
                <TextInput
                  style={[styles.textInput, styles.deadlineInput]}
                  value={event.registration_deadline || ''}
                  onChangeText={(text) => handleChange('registration_deadline', text || null)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <View style={styles.labelWithIcon}>
                  <Ionicons name="calendar" size={12} color="#2563EB" />
                  <Text style={[styles.fieldLabel, { color: '#1D4ED8' }]}>EVENT START</Text>
                </View>
                <TextInput
                  style={styles.textInput}
                  value={event.event_start_date || ''}
                  onChangeText={(text) => handleChange('event_start_date', text || null)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            {/* Optional End Date & Time */}
            <View style={styles.rowTwoCols}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>EVENT END DATE</Text>
                <TextInput
                  style={styles.textInput}
                  value={event.event_end_date || ''}
                  onChangeText={(text) => handleChange('event_end_date', text || null)}
                  placeholder="YYYY-MM-DD (opt)"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>TIME (24H)</Text>
                <TextInput
                  style={styles.textInput}
                  value={event.time || ''}
                  onChangeText={(text) => handleChange('time', text || null)}
                  placeholder="e.g. 10:00"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            {/* Location */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>LOCATION / PLATFORM</Text>
              <TextInput
                style={styles.textInput}
                value={event.location || ''}
                onChangeText={(text) => handleChange('location', text || null)}
                placeholder="e.g. Microsoft Reactor, Bengaluru or Online / Discord"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Registration Link */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>REGISTRATION LINK (URL)</Text>
              <TextInput
                style={styles.textInput}
                value={event.registration_link || ''}
                onChangeText={(text) => handleChange('registration_link', text || null)}
                placeholder="https://..."
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>

            {/* Source Group */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>WHATSAPP GROUP / SOURCE</Text>
              <TextInput
                style={styles.textInput}
                value={event.source_group || ''}
                onChangeText={(text) => handleChange('source_group', text || null)}
                placeholder="e.g. Bangalore Techies WhatsApp"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </>
        )}
      </View>

      {/* Action Footer */}
      <View style={styles.cardFooter}>
        <TouchableOpacity
          style={[styles.saveSingleBtn, hasErrors && styles.btnDisabled]}
          onPress={onSaveSingle}
          disabled={hasErrors || isSaving}
        >
          <Ionicons name="checkmark-circle-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.saveSingleBtnText}>Save This Event</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    overflow: 'hidden',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
    marginBottom: 12,
  },
  cardErrorBorder: {
    borderColor: '#EF4444',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  indexBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  indexText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  duplicateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  duplicateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B45309',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  deleteBtn: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  missingDateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FECACA',
  },
  missingDateText: {
    flex: 1,
    fontSize: 12,
    color: '#B91C1C',
    lineHeight: 16,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 16,
  },
  duplicateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    padding: 8,
    paddingHorizontal: 16,
  },
  duplicateBannerText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '500',
  },
  content: {
    padding: 16,
    gap: 14,
  },
  fieldGroup: {
    gap: 5,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#64748B',
  },
  labelWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  deadlineInput: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  modeButtonSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  modeButtonText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  modeButtonTextSelected: {
    color: '#3B82F6',
    fontWeight: '700',
  },
  rowTwoCols: {
    flexDirection: 'row',
    gap: 12,
  },
  cardFooter: {
    padding: 14,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'flex-end',
  },
  saveSingleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    gap: 6,
  },
  btnDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.7,
  },
  saveSingleBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
