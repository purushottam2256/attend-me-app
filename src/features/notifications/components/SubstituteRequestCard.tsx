import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';
import { useNotifications } from '../../../contexts/NotificationContext';
import { LinearGradient } from 'expo-linear-gradient';
import { isBefore, startOfDay, parseISO, formatDistanceToNow } from 'date-fns';

interface SubstituteRequestCardProps {
    request: any;
    type?: 'substitution' | 'swap';
    onAccept?: () => void;
    onDecline?: () => void;
}

/**
 * TEAL THEME REQUEST CARD
 * Color Palette:
 * - Primary Gradient: #0D4A4A → #1A6B6B → #0F3D3D
 * - Accent: #3DDC97
 * - Surface: rgba(255,255,255,0.08)
 */
export const SubstituteRequestCard: React.FC<SubstituteRequestCardProps> = ({ 
    request, 
    type = 'substitution', 
    onAccept, 
    onDecline 
}) => {
    const { isDark } = useTheme();
    const { respondToSubstituteRequest } = useNotifications();
    const [loading, setLoading] = useState<'accept' | 'decline' | null>(null);

    const handleAction = async (action: 'accept' | 'decline') => {
        setLoading(action);
        if (action === 'accept' && onAccept) await onAccept();
        else if (action === 'decline' && onDecline) await onDecline();
        else {
            await respondToSubstituteRequest(request.id, action);
        }
        setLoading(null);
    };

    const isSwap = type === 'swap';
    const isDone = request.status && request.status !== 'pending'; 
    const isExpired = request.date && isBefore(parseISO(request.date), startOfDay(new Date()));
    
    // Data extraction
    const senderName = isSwap ? request.faculty_a?.full_name : request.original_faculty?.full_name;
    const title = isSwap ? 'SWAP REQUEST' : 'SUBSTITUTE REQUEST';
    
    // Professional Message (Matching Push Notification)
    const body = isSwap 
        ? `${senderName || 'Faculty'} requests a class swap for ${request.slot_a_id?.split('_')[1] || 'Slot A'}.`
        : `${senderName || 'Faculty'} requests you to cover ${request.subject?.code || 'their class'}.`;
        
    const details = isSwap 
        ? `${request.slot_a_id?.split('_')[1]} ↔ ${request.slot_b_id?.split('_')[1]}`
        : `${request.target_dept}-${request.target_year}-${request.target_section} • ${request.slot_id?.split('_')[1] || 'Period'}`;

    const timeInfo = request.date || 'Pending';
    
    // Relative time
    const timeAgo = request.requested_at 
        ? formatDistanceToNow(new Date(request.requested_at), { addSuffix: true })
        : 'Just now';
    
    const accentColor = '#3DDC97';

    const cardBg = isDark ? '#082020' : '#FFFFFF';
    const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
    const textColor = isDark ? '#FFF' : '#000';
    const subTextColor = isDark ? 'rgba(255,255,255,0.6)' : '#666';

    return (
        <View style={styles.container}>
            <View
                style={[styles.card, { backgroundColor: cardBg, borderColor }]}
            >
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.badge}>
                        <Ionicons 
                            name={isSwap ? "swap-horizontal" : "person-add"} 
                            size={normalizeFont(14)} 
                            color="#3DDC97" 
                        />
                        <Text style={styles.badgeText}>{title}</Text>
                    </View>
                    <Text style={[styles.timeAgo, { color: subTextColor }]}>{timeAgo}</Text>
                </View>

                {/* Content */}
                <View style={styles.content}>
                    <Text style={[styles.facultyName, { color: textColor }]}>{body}</Text>
                    <Text style={[styles.classDetails, { color: subTextColor }]}>{details}</Text>
                </View>

                {/* Actions or Status */}
                {isDone || isExpired ? (
                    <View style={styles.statusRow}>
                        <View style={[
                            styles.statusBadge, 
                            { 
                                backgroundColor: isExpired 
                                    ? 'rgba(100,100,100,0.1)' 
                                    : request.status === 'accepted' 
                                        ? 'rgba(61, 220, 151, 0.1)' 
                                        : 'rgba(239, 68, 68, 0.1)' 
                            }
                        ]}>
                            <Ionicons 
                                name={isExpired ? "time" : (request.status === 'accepted' ? "checkmark-circle" : "close-circle")} 
                                size={normalizeFont(16)} 
                                color={isExpired ? subTextColor : (request.status === 'accepted' ? accentColor : '#EF4444')} 
                            />
                            <Text style={[
                                styles.statusText,
                                { color: isExpired ? subTextColor : (request.status === 'accepted' ? accentColor : '#EF4444') }
                            ]}>
                                {isExpired ? "EXPIRED" : request.status?.toUpperCase()}
                            </Text>
                        </View>
                    </View>
                ) : (
                    <View style={styles.actions}>
                        <TouchableOpacity onPress={() => handleAction('decline')} style={[styles.declineBtn, { borderColor: '#F15C6D' }]} disabled={!!loading}>
                           {loading === 'decline' ? <ActivityIndicator size="small" color="#F15C6D" /> : <Text style={[styles.declineBtnText, { color: '#F15C6D' }]}>Decline</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleAction('accept')} style={[styles.acceptBtn, { backgroundColor: '#3DDC97' }]} disabled={!!loading}>
                           {loading === 'accept' ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.acceptBtnText}>Accept</Text>}
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { 
        marginHorizontal: scale(16),
        marginBottom: verticalScale(12), 
        borderRadius: moderateScale(16), 
        shadowColor: '#0D4A4A',
        shadowOffset: { width: 0, height: verticalScale(6) }, 
        shadowOpacity: 0.2, 
        shadowRadius: moderateScale(12), 
        elevation: 6 
    },
    card: { 
        padding: scale(8),
        borderRadius: moderateScale(12),
        borderWidth: 0.5,
    },
    header: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: verticalScale(2)
    },
    badge: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: 'rgba(61, 220, 151, 0.2)', 
        paddingHorizontal: scale(6), 
        paddingVertical: verticalScale(2), 
        borderRadius: moderateScale(100), 
        gap: scale(4) 
    },
    badgeText: { 
        fontSize: normalizeFont(9), 
        fontWeight: '700',
        color: '#3DDC97',
    },
    timeAgo: { 
        fontSize: normalizeFont(10),
        fontWeight: '500'
    },
    content: { 
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: verticalScale(8)
    },
    facultyName: { 
        fontSize: normalizeFont(14),
        fontWeight: '600', 
    },
    classDetails: { 
        fontSize: normalizeFont(12),
        fontWeight: '400', 
    },
    actions: { 
        flexDirection: 'row', 
        justifyContent: 'flex-end',
        gap: scale(12),
        marginTop: verticalScale(4)
    },
    declineBtn: { 
        paddingHorizontal: scale(16),
        paddingVertical: verticalScale(6),
        borderRadius: moderateScale(100), 
        justifyContent: 'center', 
        alignItems: 'center',
        borderWidth: 1, 
    },
    declineBtnText: {
        fontWeight: '600',
        fontSize: normalizeFont(12)
    },
    acceptBtn: { 
        paddingHorizontal: scale(20),
        paddingVertical: verticalScale(6),
        borderRadius: moderateScale(100), 
        justifyContent: 'center', 
        alignItems: 'center' 
    },
    acceptBtnText: { 
        color: '#000', 
        fontWeight: '700', 
        fontSize: normalizeFont(12) 
    },
    statusRow: { 
        flexDirection: 'row', 
        justifyContent: 'flex-end',
        marginTop: verticalScale(4) 
    },
    statusBadge: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: scale(6), 
        paddingHorizontal: scale(16), 
        paddingVertical: verticalScale(10), 
        borderRadius: moderateScale(20) 
    },
    statusText: { 
        fontWeight: '800', 
        fontSize: normalizeFont(12), 
        letterSpacing: 0.8 
    }
});
