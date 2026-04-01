/**
 * TodaysAbsencesCard - Shows students absent today without permission
 * 
 * Professional card with WhatsApp parent notification & call actions.
 * Only shows students absent in P1 (morning) / P4 (afternoon) who
 * do NOT have an active leave/OD permission.
 */

import React, { useMemo, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../contexts';
import { Fonts, Colors } from '../../../constants';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';
import type { AbsentStudent } from '../services/inchargeService';

interface TodaysAbsencesSectionProps {
  absentees: AbsentStudent[];
  classLabel: string; // e.g. "CSE-3A"
  onMessage: (msg: string, type: 'success' | 'error' | 'warning') => void;
}

const getFormattedDate = (): string => {
  const d = new Date();
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const AbsenteeCard: React.FC<{
  student: AbsentStudent;
  classLabel: string;
  isDark: boolean;
  onMessage: (msg: string, type: 'success' | 'error' | 'warning') => void;
}> = ({ student, classLabel, isDark, onMessage }) => {
  const periodsLabel = student.absent_periods
    .map(p => p === 'morning' ? 'Morning (P1)' : 'Afternoon (P4)')
    .join(' & ');

  const isBothSessions = student.absent_periods.length > 1;
  const accentColor = isBothSessions ? '#DC2626' : '#F59E0B'; // Red for both, amber for single

  const [notified, setNotified] = useState(false);

  useEffect(() => {
    const checkNotified = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const key = `@notified_${student.student_id}_${today}`;
        const val = await AsyncStorage.getItem(key);
        if (val === 'true') setNotified(true);
      } catch (e) {}
    };
    checkNotified();
  }, [student.student_id]);

  const toggleNotified = async (forceVal?: boolean) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const key = `@notified_${student.student_id}_${today}`;
      const newVal = forceVal !== undefined ? forceVal : !notified;
      setNotified(newVal);
      if (newVal) {
        await AsyncStorage.setItem(key, 'true');
      } else {
        await AsyncStorage.removeItem(key);
      }
    } catch (e) {}
  };

  const handleWhatsAppParent = async () => {
    if (!student.parent_mobile) {
      onMessage('Parent mobile number not available', 'error');
      return;
    }
    toggleNotified(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const sessionText = student.absent_periods
      .map(p => p === 'morning' ? 'Morning (P1)' : 'Afternoon (P4)')
      .join(' and ');

    const message = `Dear Parent/Guardian,

This is to formally inform you that your ward *${student.full_name}* (Roll No: ${student.roll_no}) was found absent during the *${sessionText}* session on *${getFormattedDate()}*.

Kindly ensure regular attendance to maintain satisfactory academic progress and avoid any disciplinary action.

If your ward was absent due to a valid reason, please coordinate with the class incharge at the earliest.

Regards,
Class Incharge
${classLabel}`;

    try {
      await Linking.openURL(
        `whatsapp://send?phone=+91${student.parent_mobile.replace(/\D/g, '')}&text=${encodeURIComponent(message)}`
      );
    } catch {
      onMessage('Could not open WhatsApp', 'error');
    }
  };

  const handleCallParent = async () => {
    if (!student.parent_mobile) {
      onMessage('Parent mobile number not available', 'error');
      return;
    }
    toggleNotified(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Linking.openURL(`tel:${student.parent_mobile}`);
    } catch {
      onMessage('Could not open dialer', 'error');
    }
  };

  const initials = student.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';

  return (
    <View style={[cardStyles.card, {
      backgroundColor: isDark ? `${accentColor}12` : `${accentColor}08`,
      borderColor: isDark ? `${accentColor}30` : `${accentColor}20`,
    }]}>
      {/* Left accent bar */}
      <View style={[cardStyles.accentBar, { backgroundColor: accentColor }]} />

      <View style={cardStyles.content}>
        {/* Student Info */}
        <View style={cardStyles.infoSection}>
          <View style={cardStyles.nameRow}>
            {/* Avatar */}
            <View style={[cardStyles.avatar, { backgroundColor: `${accentColor}25` }]}>
              <Text style={[cardStyles.avatarText, { color: accentColor }]}>
                {initials}
              </Text>
            </View>
            <Text style={[cardStyles.name, { color: isDark ? '#FFFFFF' : '#0F172A' }]} numberOfLines={1}>
              {student.full_name}
            </Text>
          </View>
          <Text style={[cardStyles.roll, { color: isDark ? 'rgba(255,255,255,0.5)' : '#64748B', marginLeft: scale(40) }]}>
            {student.roll_no}
          </Text>
        </View>

        {/* Period Badges Row */}
        <View style={cardStyles.periodBadgeContainer}>
            {student.absent_periods.includes('morning') && (
              <View style={[cardStyles.periodBadge, { backgroundColor: `${accentColor}18` }]}>
                <Text style={[cardStyles.periodText, { color: accentColor }]}>AM</Text>
              </View>
            )}
            {student.absent_periods.includes('afternoon') && (
              <View style={[cardStyles.periodBadge, { backgroundColor: `${accentColor}18` }]}>
                <Text style={[cardStyles.periodText, { color: accentColor }]}>PM</Text>
              </View>
            )}
        </View>

        {/* Actions */}
        <View style={cardStyles.actionsRow}>
          <TouchableOpacity 
            style={[cardStyles.actionBtn, { backgroundColor: '#0D9488' }]}
            onPress={handleCallParent}
            activeOpacity={0.8}
          >
            <Ionicons name="call" size={normalizeFont(14)} color="#FFFFFF" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[cardStyles.actionBtn, { backgroundColor: '#25D366' }]}
            onPress={handleWhatsAppParent}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-whatsapp" size={normalizeFont(14)} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Tick mark */}
          <View style={cardStyles.tickContainer}>
            <Ionicons
              name={notified ? "checkmark-circle" : "ellipse-outline"}
              size={normalizeFont(20)}
              color={notified ? Colors.premium.accent : (isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)')}
            />
          </View>
        </View>
      </View>
    </View>
  );
};

export const TodaysAbsencesSection: React.FC<TodaysAbsencesSectionProps> = ({
  absentees,
  classLabel,
  onMessage,
}) => {
  const { isDark } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  const colors = {
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#8E8E93' : '#86868B',
    surface: isDark ? '#082020' : '#FFFFFF',
    accent: '#F59E0B', // Amber for warning theme
  };

  // Group by severity: both sessions first, then single session
  const sorted = useMemo(() => {
    return [...absentees].sort((a, b) => b.absent_periods.length - a.absent_periods.length);
  }, [absentees]);

  const chunks = useMemo(() => {
    const result = [];
    for (let i = 0; i < sorted.length; i += 4) {
      result.push(sorted.slice(i, i + 4));
    }
    return result;
  }, [sorted]);

  return (
    <View style={sectionStyles.container}>
      <View style={[sectionStyles.glassCard, { backgroundColor: colors.surface }]}>
        {/* Header (Clickable for Expand/Collapse) */}
        <TouchableOpacity 
          style={sectionStyles.headerRow}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setIsExpanded(!isExpanded);
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8) }}>
            <View style={[sectionStyles.headerIcon, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
              <Ionicons name="alert-circle" size={normalizeFont(18)} color="#F59E0B" />
            </View>
            <View>
              <Text style={[sectionStyles.title, { color: colors.textPrimary }]}>Today's Absences</Text>
              <Text style={[sectionStyles.subtitle, { color: colors.textSecondary }]}>
                Without leave permission
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8) }}>
            <View style={[sectionStyles.countBadge, { backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.1)' }]}>
              <Text style={[sectionStyles.countText, { color: '#F59E0B' }]}>{absentees.length}</Text>
            </View>
            <Ionicons 
              name={isExpanded ? "chevron-up" : "chevron-down"} 
              size={normalizeFont(20)} 
              color={colors.textSecondary} 
            />
          </View>
        </TouchableOpacity>

        {/* Cards or Empty State */}
        {isExpanded && (
          <View style={{ marginTop: verticalScale(16) }} onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
          {absentees.length === 0 ? (
            <View style={{ padding: scale(20), alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: scale(64), height: scale(64), borderRadius: scale(32), backgroundColor: Colors.premium.accentGlow, alignItems: 'center', justifyContent: 'center', marginBottom: verticalScale(12) }}>
                <Ionicons name="checkmark-done" size={normalizeFont(32)} color={Colors.premium.accent} />
              </View>
              <Text style={{ fontSize: normalizeFont(16), fontFamily: Fonts.family.semiBold, color: colors.textPrimary, marginBottom: verticalScale(4) }}>100% Attendance</Text>
              <Text style={{ fontSize: normalizeFont(13), color: colors.textSecondary, textAlign: 'center' }}>All students are present today. No unauthorized absences.</Text>
            </View>
          ) : (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={containerWidth}
                style={{ maxHeight: 350 }}
                onMomentumScrollEnd={(ev) => {
                  const x = ev.nativeEvent.contentOffset.x;
                  const index = Math.round(x / containerWidth);
                  setActiveIndex(index);
                }}
              >
                {chunks.map((chunk, pageIndex) => (
                  <View key={pageIndex} style={{ width: containerWidth }}>
                    <View style={{ paddingRight: 4 }}>
                      {chunk.map(student => (
                        <AbsenteeCard
                          key={student.student_id}
                          student={student}
                          classLabel={classLabel}
                          isDark={isDark}
                          onMessage={onMessage}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>

              {/* Pagination Dots */}
              {chunks.length > 1 && (
                <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: verticalScale(12), gap: scale(6) }}>
                  {chunks.map((_, idx) => (
                    <View
                      key={idx}
                      style={{
                        width: activeIndex === idx ? scale(24) : scale(6),
                        height: scale(6),
                        borderRadius: scale(3),
                        backgroundColor: activeIndex === idx ? colors.accent : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'),
                      }}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </View>
        )}
      </View>
    </View>
  );
};

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: moderateScale(14),
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: verticalScale(10),
  },
  accentBar: {
    width: scale(4),
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(14),
    gap: scale(10),
  },
  infoSection: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  avatar: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: normalizeFont(11),
    fontWeight: '700',
  },
  name: {
    fontSize: normalizeFont(15),
    fontFamily: Fonts.family.semiBold,
    flex: 1,
  },
  roll: {
    fontSize: normalizeFont(12),
    marginTop: verticalScale(2),
  },
  periodBadgeContainer: {
    flexDirection: 'row',
    gap: scale(4),
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: scale(48),
  },
  periodBadge: {
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(6),
    alignItems: 'center',
  },
  periodText: {
    fontSize: normalizeFont(10),
    fontFamily: Fonts.family.bold,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: scale(6),
    alignItems: 'center',
  },
  actionBtn: {
    width: scale(30),
    height: scale(30),
    borderRadius: moderateScale(15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickContainer: {
    width: scale(30),
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const sectionStyles = StyleSheet.create({
  container: {
    marginTop: verticalScale(24),
    paddingHorizontal: scale(20),
  },
  glassCard: {
    padding: scale(20),
    borderRadius: moderateScale(24),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(4) },
    shadowOpacity: 0.05,
    shadowRadius: moderateScale(12),
    elevation: 2,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerIcon: {
    width: scale(36),
    height: scale(36),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: normalizeFont(17),
    fontFamily: Fonts.family.bold,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: normalizeFont(12),
    marginTop: verticalScale(1),
  },
  countBadge: {
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(10),
  },
  countText: {
    fontSize: normalizeFont(14),
    fontFamily: Fonts.family.bold,
  },
});

export default TodaysAbsencesSection;
