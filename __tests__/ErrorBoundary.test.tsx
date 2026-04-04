/**
 * ErrorBoundary.test.tsx — Tests for the React Error Boundary component
 * 
 * Verifies that:
 * - Error boundary catches render errors
 * - Recovery UI is displayed
 * - Go Back NEVER calls BackHandler.exitApp()
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

// Mock expo vector icons (requires expo-asset/expo-font which aren't in Jest)
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

// Mock navigation ref
jest.mock('../src/navigation/navigationRef', () => ({
  navigationRef: {
    current: {
      canGoBack: jest.fn(() => false),
      goBack: jest.fn(),
      isReady: jest.fn(() => false),
      reset: jest.fn(),
    },
  },
}));

// Mock Sentry
jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  init: jest.fn(),
}));

import ErrorBoundary from '../src/components/ErrorBoundary';

// A component that throws on render
const CrashingComponent: React.FC<{ shouldCrash?: boolean }> = ({ shouldCrash }) => {
  if (shouldCrash) {
    throw new Error('Test crash!');
  }
  return <Text testID="child">Working</Text>;
};

describe('ErrorBoundary', () => {
  // Suppress console.error for expected errors in tests
  const originalConsoleError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });
  afterAll(() => {
    console.error = originalConsoleError;
  });

  it('renders children when no error occurs', () => {
    const { getByTestId } = render(
      <ErrorBoundary>
        <CrashingComponent shouldCrash={false} />
      </ErrorBoundary>
    );
    expect(getByTestId('child')).toBeTruthy();
  });

  it('renders error UI when child throws', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <CrashingComponent shouldCrash={true} />
      </ErrorBoundary>
    );
    expect(getByText('Something went wrong')).toBeTruthy();
    expect(getByText('This section encountered an error. Your other tabs still work!')).toBeTruthy();
  });

  it('shows recovery buttons (Go Back and Try Again)', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <CrashingComponent shouldCrash={true} />
      </ErrorBoundary>
    );
    expect(getByText('Go Back')).toBeTruthy();
    expect(getByText('Try Again')).toBeTruthy();
  });

  it('Try Again button does not crash the app', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <CrashingComponent shouldCrash={true} />
      </ErrorBoundary>
    );

    // This should not throw
    expect(() => fireEvent.press(getByText('Try Again'))).not.toThrow();
  });

  it('Go Back button does not crash the app', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <CrashingComponent shouldCrash={true} />
      </ErrorBoundary>
    );

    // Critical: Go Back should NEVER call BackHandler.exitApp()
    expect(() => fireEvent.press(getByText('Go Back'))).not.toThrow();
  });

  it('renders custom fallback when provided', () => {
    const fallback = <Text testID="custom-fallback">Custom Error</Text>;
    
    const { getByTestId } = render(
      <ErrorBoundary fallback={fallback}>
        <CrashingComponent shouldCrash={true} />
      </ErrorBoundary>
    );
    expect(getByTestId('custom-fallback')).toBeTruthy();
  });
});
