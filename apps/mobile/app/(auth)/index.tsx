import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEvents } from '../../src/context/EventsContext';
import { useAuth } from '../../src/context/AuthContext';
import { Header } from '../../src/components/Header';
import { SidebarRail } from '../../src/components/SidebarRail';
import { TimelineGrid } from '../../src/components/TimelineGrid';
import { FutureEventsWidget } from '../../src/components/FutureEventsWidget';
import { DeadlinesWidget } from '../../src/components/DeadlinesWidget';
import { AIExtractWidget } from '../../src/components/AIExtractWidget';
import { ClashBanner } from '../../src/components/ClashBanner';

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { events, clashes } = useEvents();
  const { width } = useWindowDimensions();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'events' | 'deadlines' | 'clashes'>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const isDesktop = Platform.OS === 'web' && width >= 1024;

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  // Filter events based on search and active tab
  const filteredEvents = useMemo(() => {
    return events
      .filter((e) => e.status !== 'skipped')
      .filter((e) => {
        if (activeTab === 'deadlines') {
          return !!e.registration_deadline && e.type !== 'deadline'
            ? true
            : e.type === 'deadline';
        }
        if (activeTab === 'events' && e.type === 'deadline') {
          return false;
        }
        return true;
      })
      .filter((e) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          e.title.toLowerCase().includes(q) ||
          (e.location?.toLowerCase().includes(q) ?? false) ||
          (e.source_group?.toLowerCase().includes(q) ?? false) ||
          (e.tags?.some((t) => t.toLowerCase().includes(q)) ?? false)
        );
      });
  }, [events, activeTab, searchQuery]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.layoutWrapper}>
        {/* Left Sidebar Nav Rail (Desktop/Web only) */}
        {isDesktop && (
          <SidebarRail onExtractPress={() => router.push('/extract')} />
        )}

        {/* Main Dashboard Canvas */}
        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.mainContentContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Top Header Bar */}
          <Header
            activeTab={activeTab}
            onTabChange={(tab) => {
              if (tab === 'clashes') {
                router.push('/calendar');
              } else {
                setActiveTab(tab);
              }
            }}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onAddPress={() => router.push('/extract')}
          />

          {/* Clash Alert Banner if any conflict detected */}
          {clashes.length > 0 && <ClashBanner clashes={clashes} />}

          {/* Top Hero: Schedule Timeline Gantt Grid */}
          <TimelineGrid
            events={filteredEvents}
            onSelectEvent={(event) => router.push(`/event/${event.id}`)}
            onViewAllPress={() => router.push('/calendar')}
          />

          {/* Bottom Widgets - stack vertically on mobile, row on desktop */}
          <View style={isDesktop ? styles.bottomWidgetsRow : styles.bottomWidgetsColumn}>
            <FutureEventsWidget events={filteredEvents} />
            <DeadlinesWidget events={events} />
            <AIExtractWidget userName={user?.displayName?.split(' ')[0] || 'Developer'} />
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EEF2F6',
  },
  layoutWrapper: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#EEF2F6',
  },
  mainScroll: {
    flex: 1,
  },
  mainContentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  bottomWidgetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 4,
  },
  bottomWidgetsColumn: {
    flexDirection: 'column',
    gap: 16,
    marginTop: 4,
  },
});
