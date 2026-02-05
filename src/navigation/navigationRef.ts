/**
 * Navigation Reference Utility
 * 
 * Provides a navigation ref that can be used outside of React components
 * This is useful for navigating from contexts that render before NavigationContainer
 */

import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';

// Create a navigation ref that can be used anywhere
export const navigationRef = createNavigationContainerRef<any>();

/**
 * Navigate to a screen from anywhere in the app
 * Safe to call even before navigation is ready
 */
export function navigate(name: string, params?: any) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  } else {
    // Queue navigation for when ready
    console.log('[NavigationRef] Navigation not ready, queuing:', name);
    setTimeout(() => {
      if (navigationRef.isReady()) {
        navigationRef.navigate(name, params);
      }
    }, 500);
  }
}

/**
 * Navigate to a nested screen
 */
export function navigateNested(parentName: string, screenName: string, params?: any) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(parentName, { screen: screenName, params });
  } else {
    console.log('[NavigationRef] Navigation not ready, queuing nested:', parentName, screenName);
    setTimeout(() => {
      if (navigationRef.isReady()) {
        navigationRef.navigate(parentName, { screen: screenName, params });
      }
    }, 500);
  }
}

/**
 * Reset navigation state
 */
export function resetTo(name: string) {
  if (navigationRef.isReady()) {
    navigationRef.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name }],
      })
    );
  }
}

/**
 * Go back
 */
export function goBack() {
  if (navigationRef.isReady() && navigationRef.canGoBack()) {
    navigationRef.goBack();
  }
}
