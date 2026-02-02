import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { useNotifications } from '../../../contexts/NotificationContext';
import { LinearGradient } from 'expo-linear-gradient';

interface SubstituteRequestCardProps {
    request: {
        id: string;
        original_faculty: { full_name: string };
        date: string;
        start_time: string; // "10:30"
        subject: { name: string; code: string };
        target_year: number;
        target_dept: string;
        target_section: string;
        notes?: string;
    };
}

export const SubstituteRequestCard: React.FC<SubstituteRequestCardProps> = ({ request }) => {
    const { isDark } = useTheme();
    const { respondToSubstituteRequest } = useNotifications();
    const [loading, setLoading] = useState<'accept' | 'decline' | null>(null);

    const handleAction = async (action: 'accept' | 'decline') => {
        setLoading(action);
        await respondToSubstituteRequest(request.id, action);
        setLoading(null);
    };

    return (
        <View style={styles.container}>
            {/* Purple Gradient Card (Theme Aware Request) */}
            <LinearGradient
                colors={['#7C3AED', '#6D28D9']} // Violet/Purple
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.card}
            >
                <View style={styles.header}>
                    <View style={styles.badge}>
                        <Ionicons name="alert-circle" size={14} color="#7C3AED" />
                        <Text style={styles.badgeText}>SUBSTITUTE REQUEST</Text>
                    </View>
                    <Text style={styles.timeAgo}>Just now</Text>
                </View>

                <View style={styles.content}>
                    <Text style={styles.facultyName}>{request.original_faculty.full_name} needs cover</Text>
                    <Text style={styles.classDetails}>
                        {request.subject.code} • {request.target_year}-{request.target_dept}-{request.target_section}
                    </Text>
                    <View style={styles.timeRow}>
                        <Ionicons name="time" size={16} color="rgba(255,255,255,0.8)" />
                        <Text style={styles.timeText}>{request.start_time} (Today)</Text>
                    </View>
                </View>

                {/* Actions */}
                <View style={styles.actions}>
                   <TouchableOpacity 
                        onPress={() => handleAction('decline')} 
                        disabled={!!loading}
                        style={[styles.btn, styles.declineBtn]}
                    >
                        {loading === 'decline' ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.btnText}>Decline</Text>}
                   </TouchableOpacity>

                   <TouchableOpacity 
                        onPress={() => handleAction('accept')} 
                        disabled={!!loading}
                        style={[styles.btn, styles.acceptBtn]}
                    >
                        {loading === 'accept' ? (
                            <ActivityIndicator size="small" color="#7C3AED" />
                        ) : (
                            <Text style={[styles.btnText, { color: '#7C3AED' }]}>Accept Class</Text>
                        )}
                   </TouchableOpacity>
                </View>
            </LinearGradient>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { marginBottom: 16, borderRadius: 16, shadowColor: "#7C3AED", shadowOffset: { width:0, height:4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
    card: { padding: 16, borderRadius: 16 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100, gap: 4 },
    badgeText: { color: '#7C3AED', fontSize: 10, fontWeight: '800' },
    timeAgo: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
    content: { marginBottom: 16 },
    facultyName: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 4 },
    classDetails: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600', marginBottom: 8 },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.2)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    timeText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
    actions: { flexDirection: 'row', gap: 12 },
    btn: { flex: 1, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    declineBtn: { backgroundColor: 'rgba(0,0,0,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    acceptBtn: { backgroundColor: '#FFF' },
    btnText: { color: '#FFF', fontWeight: '700' }
});
