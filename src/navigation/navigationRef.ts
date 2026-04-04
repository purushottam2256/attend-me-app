/**
 * Navigation Reference Utility
 * 
 * Provides a navigation ref that can be used outside of React components.
 * This is useful for navigating from contexts that render before NavigationContainer.
 * 
 * CRASH-PROOF: All navigation calls are wrapped in try-catch.
 * If navigation isn't ready, calls are queued safely with a max retry limit.
 */

import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';

// Create a navigation ref that can be used anywhere
export const navigationRef = createNavigationContainerRef<any>();

// Maximum number of queued navigation retries before giving up
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

/**
 * Navigate to a screen from anywhere in the app
 * Safe to call even before navigation is ready
 */
export function navigate(name: string, params?: any) {
  try {
    if (navigationRef.isReady()) {
      navigationRef.navigate(name, params);
    } else {
      // Queue navigation for when ready — with retry limit
      console.log('[NavigationRef] Navigation not ready, queuing:', name);
      retryNavigation(() => navigationRef.navigate(name, params));
    }
  } catch (error) {
    console.warn('[NavigationRef] navigate() failed:', error);
  }
}

/**
 * Navigate to a nested screen
 */
export function navigateNested(parentName: string, screenName: string, params?: any) {
  try {
    if (navigationRef.isReady()) {
      navigationRef.navigate(parentName, { screen: screenName, params });
    } else {
      console.log('[NavigationRef] Navigation not ready, queuing nested:', parentName, screenName);
      retryNavigation(() => navigationRef.navigate(parentName, { screen: screenName, params }));
    }
  } catch (error) {
    console.warn('[NavigationRef] navigateNested() failed:', error);
  }
}

/**
 * Reset navigation state
 */
export function resetTo(name: string) {
  try {
    if (navigationRef.isReady()) {
      navigationRef.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name }],
        })
      );
    }
  } catch (error) {
    console.warn('[NavigationRef] resetTo() failed:', error);
  }
}

/**
 * Go back
 */
export function goBack() {
  try {
    if (navigationRef.isReady() && navigationRef.canGoBack()) {
      navigationRef.goBack();
    }
  } catch (error) {
    console.warn('[NavigationRef] goBack() failed:', error);
  }
}

/**
 * Internal: Retry navigation with a max attempt limit.
 * Prevents infinite setTimeout chains and ensures stale navigations are dropped.
 */
function retryNavigation(action: () => void, attempt: number = 0) {
  if (attempt >= MAX_RETRY_ATTEMPTS) {
    console.warn('[NavigationRef] Max retry attempts reached, dropping navigation.');
    return;
  }
  setTimeout(() => {
    try {
      if (navigationRef.isReady()) {
        action();
      } else {
        retryNavigation(action, attempt + 1);
      }
    } catch (error) {
      console.warn('[NavigationRef] Retry navigation failed:', error);
    }
  }, RETRY_DELAY_MS);
}
