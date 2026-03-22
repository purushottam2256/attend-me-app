
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface SlideToLogoutProps {
  onLogout: () => void;
}

import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';

const { width } = Dimensions.get('window');
const BUTTON_HEIGHT = verticalScale(56);
const BUTTON_WIDTH = width - scale(80);
const SWIPE_THRESHOLD = BUTTON_WIDTH * 0.7;

export const SlideToLogout: React.FC<SlideToLogoutProps> = ({ onLogout }) => {
  const pan = useRef(new Animated.Value(0)).current;
  const [completed, setCompleted] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (completed) return;
        const newX = Math.max(0, Math.min(gestureState.dx, BUTTON_WIDTH - BUTTON_HEIGHT - scale(4)));
        pan.setValue(newX);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (completed) return;
        
        if (gestureState.dx > SWIPE_THRESHOLD) {
          // Success
          setCompleted(true);
          
          // DO NOT run a JS-driven spring here. As the component will unmount soon, 
          // a JS animation loop will crash React Native. Snap it directly or use native driver.
          pan.setValue(BUTTON_WIDTH - BUTTON_HEIGHT - scale(4));
          
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          
          setTimeout(() => {
            onLogout();
          }, 50);
        } else {
          // Reset
          Animated.spring(pan, {
            toValue: 0,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  // Interpolate opacity of text based on swipe
  const textOpacity = pan.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const arrowColor = pan.interpolate({
      inputRange: [0, SWIPE_THRESHOLD],
      outputRange: ['#EF4444', '#FFF']
  });

  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <Animated.Text style={[styles.text, { opacity: textOpacity }]}>
          Slide to Logout
        </Animated.Text>
        
        <Animated.View
          style={[
            styles.thumb,
            {
              transform: [{ translateX: pan }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <Ionicons name="log-out" size={24} color="#EF4444" />
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: verticalScale(20),
  },
  track: {
    width: BUTTON_WIDTH,
    height: BUTTON_HEIGHT,
    backgroundColor: '#FEE2E2',
    borderRadius: BUTTON_HEIGHT / 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  thumb: {
    position: 'absolute',
    left: scale(2),
    width: BUTTON_HEIGHT - scale(4),
    height: BUTTON_HEIGHT - scale(4),
    borderRadius: (BUTTON_HEIGHT - scale(4)) / 2,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.1,
    shadowRadius: moderateScale(4),
    elevation: 3,
  },
  text: {
    color: '#EF4444',
    fontSize: normalizeFont(16),
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
