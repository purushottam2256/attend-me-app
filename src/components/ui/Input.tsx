/**
 * Input Component
 * Text input with floating label animation
 */

import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    TextInput,
    Text,
    StyleSheet,
    Animated,
    TouchableOpacity,
    TextInputProps,
    ViewStyle,
} from 'react-native';
import { Colors, Fonts, Layout } from '../../constants';
import { scale, verticalScale } from '../../utils/responsive';

interface InputProps extends Omit<TextInputProps, 'style'> {
    label: string;
    error?: string;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    onRightIconPress?: () => void;
    containerStyle?: ViewStyle;
}

export const Input: React.FC<InputProps> = ({
    label,
    error,
    leftIcon,
    rightIcon,
    onRightIconPress,
    containerStyle,
    value,
    onFocus,
    onBlur,
    ...props
}) => {
    const [isFocused, setIsFocused] = useState(false);
    const animatedValue = useRef(new Animated.Value(value ? 1 : 0)).current;

    useEffect(() => {
        Animated.timing(animatedValue, {
            toValue: isFocused || value ? 1 : 0,
            duration: 200,
            useNativeDriver: false,
        }).start();
    }, [isFocused, value, animatedValue]);

    const handleFocus = (e: any) => {
        setIsFocused(true);
        onFocus?.(e);
    };

    const handleBlur = (e: any) => {
        setIsFocused(false);
        onBlur?.(e);
    };

    const labelStyle = {
        position: 'absolute' as const,
        left: leftIcon ? scale(44) : Layout.input.paddingHorizontal,
        top: animatedValue.interpolate({
            inputRange: [0, 1],
            outputRange: [16, 6],
        }),
        fontSize: animatedValue.interpolate({
            inputRange: [0, 1],
            outputRange: [Fonts.size.md, Fonts.size.xs],
        }),
        color: animatedValue.interpolate({
            inputRange: [0, 1],
            outputRange: [Colors.neutral.textLight, Colors.primary.main],
        }),
    };

    return (
        <View style={[styles.container, containerStyle]}>
            <View
                style={[
                    styles.inputContainer,
                    isFocused && styles.focused,
                    error && styles.error,
                ]}
            >
                {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}

                <Animated.Text style={[styles.label, labelStyle]}>
                    {label}
                </Animated.Text>

                <TextInput
                    style={[
                        styles.input,
                        leftIcon ? styles.inputWithLeftIcon : undefined,
                        rightIcon ? styles.inputWithRightIcon : undefined,
                    ]}
                    placeholderTextColor={Colors.neutral.textLight}
                    value={value}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    {...props}
                />

                {rightIcon && (
                    <TouchableOpacity
                        style={styles.rightIcon}
                        onPress={onRightIconPress}
                        disabled={!onRightIconPress}
                    >
                        {rightIcon}
                    </TouchableOpacity>
                )}
            </View>

            {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: Layout.spacing.lg,
    },

    inputContainer: {
        height: Layout.input.height,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.neutral.background,
        borderRadius: Layout.radius.md,
        borderWidth: 1.5,
        borderColor: Colors.neutral.border,
    },

    focused: {
        borderColor: Colors.primary.main,
        backgroundColor: Colors.neutral.white,
    },

    error: {
        borderColor: Colors.status.error,
    },

    label: {
        fontFamily: Fonts.family.regular,
        backgroundColor: 'transparent',
    },

    input: {
        flex: 1,
        height: '100%',
        paddingHorizontal: Layout.input.paddingHorizontal,
        paddingTop: verticalScale(16),
        fontSize: Fonts.size.md,
        fontFamily: Fonts.family.regular,
        color: Colors.neutral.textDark,
    },

    inputWithLeftIcon: {
        paddingLeft: scale(44),
    },

    inputWithRightIcon: {
        paddingRight: scale(44),
    },

    leftIcon: {
        position: 'absolute',
        left: scale(12),
        zIndex: 1,
    },

    rightIcon: {
        position: 'absolute',
        right: scale(12),
        padding: scale(4),
    },

    errorText: {
        marginTop: Layout.spacing.xs,
        marginLeft: Layout.spacing.sm,
        fontSize: Fonts.size.sm,
        fontFamily: Fonts.family.regular,
        color: Colors.status.error,
    },
});

export default Input;
