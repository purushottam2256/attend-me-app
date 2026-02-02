import React, { useState, useEffect } from 'react';
import { 
    View, 
    Text, 
    StyleSheet, 
    Modal, 
    TouchableOpacity, 
    TextInput, 
    Image, 
    ActivityIndicator,
    Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../config/supabase';
import { ZenToast } from '../../../components/ZenToast';

interface EditProfileModalProps {
    visible: boolean;
    onClose: () => void;
    onProfileUpdated: () => void;
    currentName: string;
    currentPhoto: string | null;
    isDark: boolean;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ 
    visible, 
    onClose, 
    onProfileUpdated, 
    currentName, 
    currentPhoto, 
    isDark 
}) => {
    const insets = useSafeAreaInsets();
    const [name, setName] = useState(currentName);
    const [imageUri, setImageUri] = useState<string | null>(currentPhoto);
    const [isLoading, setIsLoading] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'warning' }>({
        visible: false,
        message: '',
        type: 'success'
    });

    // Reset state when modal opens
    useEffect(() => {
        if (visible) {
            setName(currentName);
            setImageUri(currentPhoto);
            setHasUnsavedChanges(false);
        }
    }, [visible, currentName, currentPhoto]);

    const handlePickImage = async () => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                setToast({ visible: true, message: 'Gallery permission required', type: 'error' });
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true, // Enables Native Cropping
                aspect: [1, 1],
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0].uri) {
                setImageUri(result.assets[0].uri);
                setHasUnsavedChanges(true);
            }
        } catch (error) {
            setToast({ visible: true, message: 'Failed to open image picker', type: 'error' });
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            setToast({ visible: true, message: 'Name cannot be empty', type: 'warning' });
            return;
        }

        setIsLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No user found');

            let finalAvatarUrl = imageUri;

            // 1. Upload new image if it's a local file
            if (imageUri && imageUri.startsWith('file://')) {
                const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
                const fileName = `${user.id}/avatar_${Date.now()}.${fileExt}`;
                const formData = new FormData();
                
                formData.append('file', {
                    uri: imageUri,
                    name: fileName,
                    type: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`,
                } as any);

                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(fileName, formData, { upsert: true });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('avatars')
                    .getPublicUrl(fileName);
                
                finalAvatarUrl = publicUrl;
            }

            // 2. Update Profile Row
            const updates: any = {
                full_name: name,
                updated_at: new Date(),
            };
            // Only update avatar_url if we have a new one (local file uploaded) or it was changed
            if (finalAvatarUrl !== currentPhoto) {
                updates.avatar_url = finalAvatarUrl;
            }

            const { error: updateError } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', user.id);

            if (updateError) throw updateError;

            onProfileUpdated(); // Notify parent to refresh data
            onClose();

        } catch (error: any) {
            setToast({ visible: true, message: error.message || 'Update Failed', type: 'error' });
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={[
                    styles.modalCard, 
                    { backgroundColor: isDark ? '#082020' : '#FFFFFF' }
                ]}>
                    <Text style={[styles.modalTitle, { color: isDark ? '#FFF' : '#0F172A' }]}>Edit Profile</Text>

                    {/* Photo Section */}
                    <View style={styles.photoSection}>
                        <TouchableOpacity onPress={handlePickImage}>
                            <Image 
                                source={imageUri ? { uri: imageUri } : { uri: 'https://via.placeholder.com/150' }} 
                                style={[styles.avatar, { borderColor: isDark ? '#334155' : '#E2E8F0' }]} 
                            />
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            onPress={handlePickImage} 
                            style={[styles.uploadBtn, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}
                        >
                            <Ionicons name="cloud-upload" size={18} color={isDark ? '#FFF' : '#334155'} />
                            <Text style={{ color: isDark ? '#FFF' : '#334155', fontWeight: '600', marginLeft: 8 }}>Upload Photo</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Inputs */}
                    <View style={{ width: '100%', marginBottom: 20 }}>
                        <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#64748B' }]}>FULL NAME</Text>
                        <TextInput
                            style={[styles.input, { 
                                color: isDark ? '#FFF' : '#0F172A',
                                backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                                borderColor: isDark ? '#334155' : '#E2E8F0'
                            }]}
                            value={name}
                            onChangeText={setName}
                            placeholder="Enter your name"
                            placeholderTextColor="#94A3B8"
                        />
                    </View>

                    {/* Actions */}
                    <View style={styles.actionRow}>
                        <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
                            <Text style={{ color: '#64748B', fontWeight: '600' }}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={handleSave} 
                            disabled={isLoading}
                            style={[styles.saveBtn, { opacity: isLoading ? 0.7 : 1 }]}
                        >
                            {isLoading ? (
                                <ActivityIndicator color="#FFF" size="small" />
                            ) : (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Ionicons name="checkmark" size={18} color="#FFF" />
                                    <Text style={{ color: '#FFF', fontWeight: '700' }}>OK</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
                <ZenToast 
                    visible={toast.visible} 
                    message={toast.message} 
                    type={toast.type}
                    onHide={() => setToast(prev => ({ ...prev, visible: false }))}
                />
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: 24,
    },
    modalCard: {
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
    },
    // ... other styles unchanged ...
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 24,
        alignSelf: 'flex-start'
    },
    photoSection: {
        alignItems: 'center',
        marginBottom: 24,
        width: '100%'
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 4,
        marginBottom: 16
    },
    uploadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
    },
    label: {
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 8,
        letterSpacing: 0.5
    },
    input: {
        width: '100%',
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        fontSize: 16
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        width: '100%',
        gap: 12
    },
    cancelBtn: {
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    saveBtn: {
        backgroundColor: '#0F766E', // Keep teal for action
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 12,
        minWidth: 80,
        alignItems: 'center',
        justifyContent: 'center'
    }
});
