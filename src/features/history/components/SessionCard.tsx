/**
 * SessionCard - Expandable attendance session card
 * Features: Health strip, accordion expansion, export buttons, edit capability
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts';

interface SessionData {
  id: string;
  subject: string;
  subjectCode: string;
  section: string;
  time: string;
  date: Date;
  total: number;
  present: number;
  absent: number;
  isSynced: boolean;
  isEditable: boolean; // Within 24 hours
  lastModified?: string;
  absentees: string[]; // Roll numbers
  presentees: string[]; // Roll numbers
}

interface SessionCardProps {
  session: SessionData;
  onEdit?: (sessionId: string) => void;
}

export const SessionCard: React.FC<SessionCardProps> = ({
  session,
  onEdit,
}) => {
  const { isDark } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;

  // Calculate attendance percentage
  const attendancePercent = session.total > 0 
    ? Math.round((session.present / session.total) * 100) 
    : 0;

  // Health color based on percentage
  const getHealthColor = () => {
    if (attendancePercent >= 75) return '#22C55E'; // Green
    if (attendancePercent >= 50) return '#F59E0B'; // Amber
    return '#EF4444'; // Red
  };

  // Toggle expansion
  const toggleExpand = () => {
    const toValue = isExpanded ? 0 : 1;
    Animated.spring(expandAnim, {
      toValue,
      friction: 10,
      tension: 100,
      useNativeDriver: false,
    }).start();
    setIsExpanded(!isExpanded);
  };

  // Generate WhatsApp report
  const generateWhatsAppReport = () => {
    const dateStr = session.date.toLocaleDateString('en-GB', { 
      day: '2-digit', month: 'short' 
    });
    const absentList = session.absentees.slice(0, 10).join(', ');
    const moreAbsent = session.absentees.length > 10 
      ? ` +${session.absentees.length - 10} more` 
      : '';
    
    const report = `📅 ${dateStr} | ${session.subjectCode}\n✅ Present: ${session.present}/${session.total}\n❌ Absent: ${session.absent} - ${absentList}${moreAbsent}`;
    
    Share.share({
      message: report,
      title: `Attendance - ${session.subject}`,
    });
  };

  // Export handlers
  const handleExport = (format: 'pdf' | 'excel' | 'json') => {
    console.log(`Exporting as ${format.toUpperCase()}...`);
    // Placeholder for future export implementation
  };

  // Colors
  const colors = {
    cardBg: isDark ? 'rgba(30, 41, 59, 0.6)' : '#FFFFFF',
    cardBorder: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    textPrimary: isDark ? '#FFFFFF' : '#0F172A',
    textSecondary: isDark ? 'rgba(255,255,255,0.7)' : '#64748B',
    textMuted: isDark ? 'rgba(255,255,255,0.4)' : '#94A3B8',
    statBg: isDark ? 'rgba(255,255,255,0.08)' : '#F8FAFC',
    buttonBg: isDark ? 'rgba(255,255,255,0.1)' : '#F1F5F9',
    success: '#22C55E',
    danger: '#EF4444',
    syncedColor: '#22C55E',
    pendingColor: '#F59E0B',
  };

  const expandHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 180],
  });

  return (
    <TouchableOpacity
      style={[styles.card, { 
        backgroundColor: colors.cardBg,
        borderColor: colors.cardBorder,
      }]}
      onPress={toggleExpand}
      activeOpacity={0.9}
    >
      {/* Health Strip */}
      <View style={[styles.healthStrip, { backgroundColor: getHealthColor() }]} />

      {/* Main Content */}
      <View style={styles.content}>
        {/* Header Row */}
        <View style={styles.headerRow}>
          <View style={styles.subjectInfo}>
            <Text style={[styles.subject, { color: colors.textPrimary }]} numberOfLines={1}>
              {session.subject}
            </Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {session.section} • {session.time}
            </Text>
          </View>
          
          <View style={styles.syncStatus}>
            <Ionicons 
              name={session.isSynced ? 'cloud-done' : 'cloud-outline'} 
              size={16} 
              color={session.isSynced ? colors.syncedColor : colors.pendingColor} 
            />
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={[styles.statBox, { backgroundColor: colors.statBg }]}>
            <Text style={[styles.statValue, { color: colors.textPrimary }]}>{session.total}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.statBg }]}>
            <Text style={[styles.statValue, { color: colors.success }]}>{session.present}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Present</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.statBg }]}>
            <Text style={[styles.statValue, { color: colors.danger }]}>{session.absent}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Absent</Text>
          </View>
        </View>

        {/* Expandable Panel */}
        <Animated.View style={[styles.expandPanel, { height: expandHeight }]}>
          {isExpanded && (
            <View style={styles.expandContent}>
              {/* Absentees Quick View */}
              <View style={styles.absenteesSection}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  Absentees ({session.absentees.length})
                </Text>
                <Text style={[styles.absenteesList, { color: colors.danger }]} numberOfLines={2}>
                  {session.absentees.slice(0, 8).join(', ')}
                  {session.absentees.length > 8 && '...'}
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity 
                  style={[styles.actionBtn, { backgroundColor: '#25D366' }]}
                  onPress={generateWhatsAppReport}
                >
                  <Ionicons name="logo-whatsapp" size={16} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Share</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.actionBtn, { backgroundColor: colors.buttonBg }]}
                  onPress={() => handleExport('pdf')}
                >
                  <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.actionBtn, { backgroundColor: colors.buttonBg }]}
                  onPress={() => handleExport('excel')}
                >
                  <Ionicons name="grid-outline" size={16} color={colors.textSecondary} />
                </TouchableOpacity>

                {session.isEditable ? (
                  <TouchableOpacity 
                    style={[styles.actionBtn, { backgroundColor: colors.buttonBg }]}
                    onPress={() => onEdit?.(session.id)}
                  >
                    <Ionicons name="pencil-outline" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.actionBtn, { backgroundColor: colors.buttonBg, opacity: 0.5 }]}>
                    <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
                  </View>
                )}
              </View>

              {/* Last Modified */}
              {session.lastModified && (
                <Text style={[styles.modifiedText, { color: colors.textMuted }]}>
                  Modified: {session.lastModified}
                </Text>
              )}
            </View>
          )}
        </Animated.View>

        {/* Expand Indicator */}
        <View style={styles.expandIndicator}>
          <Ionicons 
            name={isExpanded ? 'chevron-up' : 'chevron-down'} 
            size={16} 
            color={colors.textMuted} 
          />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 0.5,
    marginBottom: 12,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  healthStrip: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  subjectInfo: {
    flex: 1,
  },
  subject: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  meta: {
    fontSize: 13,
    fontWeight: '500',
  },
  syncStatus: {
    marginLeft: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statBox: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  expandPanel: {
    overflow: 'hidden',
  },
  expandContent: {
    paddingTop: 16,
  },
  absenteesSection: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  absenteesList: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  modifiedText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 12,
    fontStyle: 'italic',
  },
  expandIndicator: {
    alignItems: 'center',
    marginTop: 8,
  },
});

export default SessionCard;
