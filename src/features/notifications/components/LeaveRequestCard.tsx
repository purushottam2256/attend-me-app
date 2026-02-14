import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';
import { formatDistanceToNow, format } from 'date-fns';

interface LeaveRequestCardProps {
    item: any; // The notification item containing data
}

/**
 * TEAL THEME LEAVE CARD
 * Matches SubstituteRequestCard styling for consistency.
 */
export const LeaveRequestCard: React.FC<LeaveRequestCardProps> = ({ item }) => {
    const { isDark } = useTheme();
    const leave = item.data; // The raw leave object

    const startDate = leave.start_date ? new Date(leave.start_date) : new Date();
    const endDate = leave.end_date ? new Date(leave.end_date) : new Date();
    
    const startStr = format(startDate, 'MMM d, yyyy');
    const endStr = format(endDate, 'MMM d, yyyy');
    const dateDisplay = startStr === endStr ? startStr : `${startStr} - ${endStr}`;

    const timeAgo = item.timestamp 
        ? formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })
        : 'Just now';

    // Status Styling
    const status = leave.status || 'pending';
    let statusColor = '#F59E0B'; // Pending: Orange
    let statusIcon: keyof typeof Ionicons.glyphMap = 'time';
    
    if (status === 'approved') {
        statusColor = '#3DDC97'; // Green
        statusIcon = 'checkmark-circle';
    } else if (status === 'rejected') {
        statusColor = '#EF4444'; // Red
        statusIcon = 'close-circle';
    }

    const cardBg = isDark ? '#082020' : '#FFFFFF';
    const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
    const textColor = isDark ? '#FFF' : '#000';
    const subTextColor = isDark ? 'rgba(255,255,255,0.6)' : '#666';

    return (
        <View style={styles.container}>
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.badge}>
                        <Ionicons name="calendar" size={normalizeFont(14)} color="#3DDC97" />
                        <Text style={styles.badgeText}>LEAVE REQUEST</Text>
                    </View>
                    <Text style={[styles.timeAgo, { color: subTextColor }]}>{timeAgo}</Text>
                </View>

                {/* Content */}
                <View style={styles.content}>
                    <Text style={[styles.reason, { color: textColor }]} numberOfLines={2}>
                        {leave.reason || 'No reason provided'}
                    </Text>
                    <Text style={[styles.dateDetails, { color: subTextColor }]}>
                        {dateDisplay} • {leave.leave_type === 'half_day' ? 'Half Day' : 'Full Day'}
                    </Text>
                </View>

                {/* Status Footer */}
                <View style={styles.statusRow}>
                    <View style={[
                        styles.statusBadge, 
                        { backgroundColor: statusColor + '20' } // 20% opacity
                    ]}>
                        <Ionicons name={statusIcon} size={normalizeFont(16)} color={statusColor} />
                        <Text style={[styles.statusText, { color: statusColor }]}>
                            {status.toUpperCase()}
                        </Text>
                    </View>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { 
        marginHorizontal: scale(16),
        marginBottom: verticalScale(12), 
        shadowColor: '#0D4A4A',
        shadowOffset: { width: 0, height: verticalScale(4) }, 
        shadowOpacity: 0.15, 
        shadowRadius: moderateScale(8), 
        elevation: 4 
    },
    card: {
        borderRadius: moderateScale(16),
        borderWidth: 1,
        padding: scale(16),
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: verticalScale(12),
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(61, 220, 151, 0.1)',
        paddingHorizontal: scale(8),
        paddingVertical: verticalScale(4),
        borderRadius: moderateScale(8),
    },
    badgeText: {
        color: '#3DDC97',
        fontSize: normalizeFont(10),
        fontWeight: '700',
        marginLeft: scale(4),
        letterSpacing: 0.5,
    },
    timeAgo: {
        fontSize: normalizeFont(11),
        fontWeight: '500',
    },
    content: {
        marginBottom: verticalScale(16),
    },
    reason: {
        fontSize: normalizeFont(16),
        fontWeight: '600',
        marginBottom: verticalScale(4),
        lineHeight: verticalScale(22),
    },
    dateDetails: {
        fontSize: normalizeFont(13),
        fontWeight: '500',
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start', // Align left like Substitute card
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: scale(10),
        paddingVertical: verticalScale(6),
        borderRadius: moderateScale(20),
    },
    statusText: {
        fontSize: normalizeFont(12),
        fontWeight: '700',
        marginLeft: scale(6),
        letterSpacing: 0.5,
    }
});
