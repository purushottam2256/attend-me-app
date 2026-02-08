
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const safeHaptic = async (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Heavy) => {
    try {
        const enabled = await AsyncStorage.getItem('hapticsEnabled');
        if (enabled === 'true') {
            await Haptics.impactAsync(style);
        }
    } catch (e) {
        console.warn('Haptic Error', e);
    }
};

export const safeVibrate = async (type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success) => {
    try {
        const enabled = await AsyncStorage.getItem('hapticsEnabled');
        if (enabled === 'true') {
             await Haptics.notificationAsync(type);
        }
    } catch(e) {
        console.warn('Vibrate Error', e);
    }
};
