/**
 * withSafeScreen — Higher-Order Component that crash-proofs any screen.
 * 
 * Wraps the screen in an ErrorBoundary so render crashes show
 * a recovery UI instead of killing the app.
 * 
 * Usage in navigator:
 *   <Stack.Screen component={withSafeScreen(HomeScreen)} />
 */

import React from 'react';
import ErrorBoundary from './ErrorBoundary';

export function withSafeScreen<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  displayName?: string
): React.FC<P> {
  const SafeScreen: React.FC<P> = (props) => (
    <ErrorBoundary>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  SafeScreen.displayName = displayName || `Safe(${WrappedComponent.displayName || WrappedComponent.name || 'Screen'})`;

  return SafeScreen;
}

export default withSafeScreen;
