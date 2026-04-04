/**
 * ErrorBoundary — Catches JS render errors and shows a recovery UI.
 * Prevents the app from crashing to a white screen.
 *
 * Recovery options:
 * - Try Again: re-renders the component
 * - Go Back: navigates to the previous screen (if navigation is available)
 * 
 * CRASH-PROOF: handleGoBack NEVER calls BackHandler.exitApp().
 * Instead it resets to Home or clears the error state.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Report to Sentry in all environments
    try {
      const Sentry = require('@sentry/react-native');
      Sentry.captureException(error, {
        tags: { component: 'ErrorBoundary' },
        extra: { componentStack: errorInfo.componentStack },
      });
    } catch {
      // Sentry not available — swallow
    }

    if (__DEV__) {
      console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  handleGoBack = (): void => {
    try {
      // Try React Navigation first
      const { navigationRef } = require('../navigation/navigationRef');
      if (navigationRef?.current?.canGoBack?.()) {
        this.setState({ hasError: false, error: null });
        navigationRef.current.goBack();
        return;
      }
      // Fallback: navigate to Home instead of killing the app
      if (navigationRef?.current?.isReady?.()) {
        this.setState({ hasError: false, error: null });
        navigationRef.current.reset({
          index: 0,
          routes: [{ name: 'MainTabs' as never }],
        });
        return;
      }
    } catch {
      // Navigation ref not available
    }
    // Last resort: just clear the error — NEVER exit the app
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.iconCircle}>
              <Ionicons name="warning-outline" size={40} color="#EF4444" />
            </View>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.subtitle}>
              This section encountered an error. Your other tabs still work!
            </Text>
            {__DEV__ && this.state.error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText} numberOfLines={4}>
                  {this.state.error.message}
                </Text>
              </View>
            )}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.goBackBtn}
                onPress={this.handleGoBack}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-back" size={18} color="#FFF" />
                <Text style={styles.retryText}>Go Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={this.handleReset}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={18} color="#FFF" />
                <Text style={styles.retryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 32,
    width: Math.min(width - 48, 380),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: 12,
    padding: 12,
    width: '100%',
    marginBottom: 20,
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#F87171',
    lineHeight: 18,
  },
  retryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D9488',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  goBackBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#475569',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
});

export default ErrorBoundary;
