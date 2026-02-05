import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
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
    const body = isSwap 
        ? `${senderName || 'Faculty'} wants to swap classes with you`
        : `${senderName || 'Faculty'} needs cover`;
    const details = isSwap 
        ? `${request.slot_a_id?.toUpperCase() || 'Slot A'} ↔ ${request.slot_b_id?.toUpperCase() || 'Slot B'}`
        : `${request.subject?.code || 'Class'} • ${request.target_dept || ''}-${request.target_year || ''}-${request.target_section || ''}`;
    const timeInfo = request.date || 'Pending';
    
    // Relative time
    const timeAgo = request.requested_at 
        ? formatDistanceToNow(new Date(request.requested_at), { addSuffix: true })
        : 'Just now';

    // TEAL THEME COLORS
    const getGradient = (): readonly [string, string, string] => {
        if (isDone || isExpired) return ['#64748B', '#475569', '#334155'] as const; // Gray
        return ['#0D4A4A', '#1A6B6B', '#0F3D3D'] as const; // Teal
    };
    
    const accentColor = '#3DDC97'; // Mint accent

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={getGradient()}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.card}
            >
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.badge}>
                        <Ionicons 
                            name={isSwap ? "swap-horizontal" : "person-add"} 
                            size={14} 
                            color="#0D4A4A" 
                        />
                        <Text style={styles.badgeText}>{title}</Text>
                    </View>
                    <Text style={styles.timeAgo}>{timeAgo}</Text>
                </View>

                {/* Content */}
                <View style={styles.content}>
                    <Text style={styles.facultyName}>{body}</Text>
                    <Text style={styles.classDetails}>{details}</Text>
                    <View style={styles.timeRow}>
                        <Ionicons name="calendar-outline" size={16} color="rgba(255,255,255,0.8)" />
                        <Text style={styles.timeText}>{timeInfo}</Text>
                    </View>
                </View>

                {/* Actions or Status */}
                {isDone || isExpired ? (
                    <View style={styles.statusRow}>
                        <View style={[
                            styles.statusBadge, 
                            { 
                                backgroundColor: isExpired 
                                    ? 'rgba(255,255,255,0.15)' 
                                    : request.status === 'accepted' 
                                        ? 'rgba(61, 220, 151, 0.25)' 
                                        : 'rgba(239, 68, 68, 0.25)' 
                            }
                        ]}>
                            <Ionicons 
                                name={isExpired ? "time" : (request.status === 'accepted' ? "checkmark-circle" : "close-circle")} 
                                size={16} 
                                color={isExpired ? '#FFF' : (request.status === 'accepted' ? accentColor : '#EF4444')} 
                            />
                            <Text style={[
                                styles.statusText,
                                { color: isExpired ? '#FFF' : (request.status === 'accepted' ? accentColor : '#EF4444') }
                            ]}>
                                {isExpired ? "EXPIRED" : request.status?.toUpperCase()}
                            </Text>
                        </View>
                    </View>
                ) : (
                    <View style={styles.actions}>
                        <TouchableOpacity 
                            onPress={() => handleAction('decline')} 
                            disabled={!!loading}
                            style={styles.declineBtn}
                            activeOpacity={0.85}
                        >
                            {loading === 'decline' ? (
                                <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                                <Text style={styles.declineBtnText}>Decline</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity 
                            onPress={() => handleAction('accept')} 
                            disabled={!!loading}
                            style={styles.acceptBtn}
                            activeOpacity={0.85}
                        >
                            {loading === 'accept' ? (
                                <ActivityIndicator size="small" color="#0D4A4A" />
                            ) : (
                                <>
                                    <Ionicons name="checkmark" size={18} color="#0D4A4A" />
                                    <Text style={styles.acceptBtnText}>Accept</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                )}
            </LinearGradient>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { 
        marginHorizontal: 16,
        marginBottom: 12, 
        borderRadius: 16, 
        shadowColor: '#0D4A4A',
        shadowOffset: { width: 0, height: 6 }, 
        shadowOpacity: 0.2, 
        shadowRadius: 12, 
        elevation: 6 
    },
    card: { 
        padding: 16, 
        borderRadius: 16 
    },
    header: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 14 
    },
    badge: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: '#3DDC97', 
        paddingHorizontal: 10, 
        paddingVertical: 5, 
        borderRadius: 100, 
        gap: 5 
    },
    badgeText: { 
        fontSize: 10, 
        fontWeight: '800',
        color: '#0D4A4A',
        letterSpacing: 0.5
    },
    timeAgo: { 
        color: 'rgba(255,255,255,0.6)', 
        fontSize: 12,
        fontWeight: '500'
    },
    content: { 
        marginBottom: 16 
    },
    facultyName: { 
        color: '#FFF', 
        fontSize: 18, 
        fontWeight: '700', 
        marginBottom: 6,
        letterSpacing: -0.3
    },
    classDetails: { 
        color: 'rgba(255,255,255,0.85)', 
        fontSize: 14, 
        fontWeight: '600', 
        marginBottom: 10 
    },
    timeRow: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 8, 
        backgroundColor: 'rgba(255,255,255,0.1)', 
        alignSelf: 'flex-start', 
        paddingHorizontal: 12, 
        paddingVertical: 7, 
        borderRadius: 8 
    },
    timeText: { 
        color: '#FFF', 
        fontSize: 13, 
        fontWeight: '600' 
    },
    actions: { 
        flexDirection: 'row', 
        gap: 12 
    },
    declineBtn: { 
        flex: 1, 
        height: 46, 
        borderRadius: 12, 
        justifyContent: 'center', 
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)', 
        borderWidth: 1, 
        borderColor: 'rgba(255,255,255,0.2)' 
    },
    declineBtnText: {
        color: '#FFF',
        fontWeight: '700',
        fontSize: 14
    },
    acceptBtn: { 
        flex: 1, 
        height: 46, 
        borderRadius: 12, 
        justifyContent: 'center', 
        alignItems: 'center',
        backgroundColor: '#3DDC97',
        flexDirection: 'row',
        gap: 6
    },
    acceptBtnText: {
        color: '#0D4A4A',
        fontWeight: '700',
        fontSize: 14
    },
    statusRow: { 
        flexDirection: 'row', 
        justifyContent: 'center', 
        marginTop: 4 
    },
    statusBadge: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 6, 
        paddingHorizontal: 16, 
        paddingVertical: 10, 
        borderRadius: 20 
    },
    statusText: { 
        fontWeight: '800', 
        fontSize: 12, 
        letterSpacing: 0.8 
    }
});
