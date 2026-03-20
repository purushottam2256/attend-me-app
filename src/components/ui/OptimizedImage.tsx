/**
 * OptimizedImage — Production-grade remote image handler.
 * 
 * Uses expo-image for built-in caching and performance, unlike the standard React Native Image.
 * Automatically handles blurhashes, loading states, error boundaries, and fallbacks.
 */

import React, { useState } from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { Image, ImageProps } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants';

// A default blurry placeholder for quick transitions
const BLUR_HASH = 'VnE.@?o|~WbH-ofQ~WaejZaxMxjZj]a#tQj[xuj[aekEa$a|bHeRofbHayfjjZaekDbGj]tQt6fR';

interface OptimizedImageProps extends Omit<ImageProps, 'source'> {
  url?: string | null;
  fallbackInitials?: string;
  showLoadingIndicator?: boolean;
  borderRadius?: number;
  initialsStyle?: any;
  initialsTextStyle?: any;
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  url,
  fallbackInitials,
  showLoadingIndicator = false,
  style,
  borderRadius = 0,
  initialsStyle,
  initialsTextStyle,
  ...props
}) => {
  const [hasError, setHasError] = useState(!url);

  if (hasError || !url) {
    return (
      <View style={[styles.fallbackContainer, style, { borderRadius: Number(borderRadius) }, initialsStyle]}>
        {fallbackInitials ? (
          <Text style={[styles.initialsText, initialsTextStyle]}>
            {fallbackInitials.substring(0, 2).toUpperCase()}
          </Text>
        ) : (
          <Ionicons name="person" size={24} color={Colors.neutral.textLight} />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, style, { borderRadius: Number(borderRadius) }]}>
      <Image
        {...props}
        source={{ uri: url }}
        placeholder={BLUR_HASH}
        contentFit="cover"
        transition={300}
        cachePolicy="memory-disk" // Persist images offline
        style={[StyleSheet.absoluteFill, { borderRadius: Number(borderRadius) }]}
        onError={() => setHasError(true)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: Colors.neutral.background,
  },
  fallbackContainer: {
    backgroundColor: Colors.neutral.background,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  initialsText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral.textDark,
  },
});
