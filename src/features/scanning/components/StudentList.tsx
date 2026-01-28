/**
 * StudentList - Apple Zen Mode Premium Design
 * Clean split-list with refined sections
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StudentCard } from './StudentCard';
import { useTheme } from '../../../contexts';

type StudentStatus = 'pending' | 'present' | 'absent' | 'od' | 'leave';

interface Student {
  id: string;
  name: string;
  rollNo: string;
  status: StudentStatus;
  detectedAt?: number;
}

interface StudentListProps {
  students: Student[];
  onStatusChange: (studentId: string, newStatus: StudentStatus) => void;
}

export const StudentList: React.FC<StudentListProps> = ({
  students,
  onStatusChange,
}) => {
  const { isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Apple Zen Mode colors
  const colors = {
    statsBar: isDark ? '#000000' : '#FFFFFF',
    statsBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    searchBg: isDark ? '#1C1C1E' : '#F2F2F7',
    searchText: isDark ? '#FFFFFF' : '#1C1C1E',
    searchPlaceholder: isDark ? 'rgba(255,255,255,0.4)' : '#8E8E93',
    searchIcon: isDark ? 'rgba(255,255,255,0.4)' : '#8E8E93',
    listBg: isDark ? '#000000' : '#F2F2F7',
    sectionText: isDark ? 'rgba(255,255,255,0.5)' : '#8E8E93',
    statText: isDark ? '#FFFFFF' : '#1C1C1E',
    accent: '#64D2A4',
    success: '#34C759',
    danger: '#FF6B6B',
  };

  // Split students into verified and pending
  const { verified, pending } = useMemo(() => {
    const filtered = searchQuery
      ? students.filter(s => 
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.rollNo.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : students;

    const verifiedList = filtered
      .filter(s => s.status === 'present' || s.status === 'od')
      .sort((a, b) => (b.detectedAt || 0) - (a.detectedAt || 0));

    const pendingList = filtered
      .filter(s => s.status === 'pending' || s.status === 'absent' || s.status === 'leave')
      .sort((a, b) => a.rollNo.localeCompare(b.rollNo));

    return { verified: verifiedList, pending: pendingList };
  }, [students, searchQuery]);

  // Stats
  const presentCount = students.filter(s => s.status === 'present' || s.status === 'od').length;
  const absentCount = students.filter(s => s.status === 'absent' || s.status === 'leave').length;
  const pendingCount = students.filter(s => s.status === 'pending').length;

  return (
    <View style={styles.container}>
      {/* Stats Bar - Minimal */}
      <View style={[styles.statsBar, { 
        backgroundColor: colors.statsBar, 
        borderBottomColor: colors.statsBorder 
      }]}>
        {showSearch ? (
          <View style={[styles.searchContainer, { backgroundColor: colors.searchBg }]}>
            <Ionicons name="search" size={16} color={colors.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: colors.searchText }]}
              placeholder="Search..."
              placeholderTextColor={colors.searchPlaceholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); }}>
              <Ionicons name="close-circle" size={18} color={colors.searchIcon} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity 
              style={[styles.searchButton, { backgroundColor: colors.searchBg }]} 
              onPress={() => setShowSearch(true)}
            >
              <Ionicons name="search" size={18} color={colors.searchIcon} />
            </TouchableOpacity>

            <View style={styles.statsGroup}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.success }]}>{presentCount}</Text>
                <Text style={[styles.statLabel, { color: colors.sectionText }]}>P</Text>
              </View>

              <View style={[styles.statDivider, { backgroundColor: colors.statsBorder }]} />

              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.danger }]}>{absentCount}</Text>
                <Text style={[styles.statLabel, { color: colors.sectionText }]}>A</Text>
              </View>

              <View style={[styles.statDivider, { backgroundColor: colors.statsBorder }]} />

              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.sectionText }]}>{pendingCount}</Text>
                <Text style={[styles.statLabel, { color: colors.sectionText }]}>...</Text>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Student List */}
      <ScrollView 
        style={[styles.listContainer, { backgroundColor: colors.listBg }]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      >
        {/* Block A: Verified */}
        {verified.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: colors.success }]} />
              <Text style={[styles.sectionTitle, { color: colors.sectionText }]}>
                VERIFIED · {verified.length}
              </Text>
            </View>
            {verified.map(student => (
              <StudentCard
                key={student.id}
                name={student.name}
                rollNo={student.rollNo}
                status={student.status}
                onStatusChange={(newStatus) => onStatusChange(student.id, newStatus)}
              />
            ))}
          </>
        )}

        {/* Block B: Pending */}
        {pending.length > 0 && (
          <>
            <View style={[styles.sectionHeader, verified.length > 0 && { marginTop: 16 }]}>
              <View style={[styles.sectionDot, { backgroundColor: colors.sectionText }]} />
              <Text style={[styles.sectionTitle, { color: colors.sectionText }]}>
                PENDING · {pending.length}
              </Text>
            </View>
            {pending.map(student => (
              <StudentCard
                key={student.id}
                name={student.name}
                rollNo={student.rollNo}
                status={student.status}
                onStatusChange={(newStatus) => onStatusChange(student.id, newStatus)}
              />
            ))}
          </>
        )}

        {/* Bottom padding for footer */}
        <View style={{ height: 160 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  statsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 16,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingTop: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  sectionDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
});

export default StudentList;
