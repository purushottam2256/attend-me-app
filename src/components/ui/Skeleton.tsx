import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from '../../contexts';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export const Skeleton: React.FC<SkeletonProps> = ({ width, height, borderRadius = 8, style }) => {
  const { isDark } = useTheme();

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
          opacity: 0.5,
        },
        style,
      ]}
    />
  );
};
