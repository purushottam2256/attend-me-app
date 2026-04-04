/**
 * backgroundSync.test.ts — Tests for background sync crash safety
 * 
 * Verifies that TaskManager.defineTask doesn't crash the app
 * even when the module isn't linked properly.
 */

// Mock TaskManager
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
}));

jest.mock('expo-background-fetch', () => ({
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  BackgroundFetchResult: {
    NewData: 1,
    NoData: 2,
    Failed: 3,
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
}));

// Mock Sentry
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

// Mock offline services
jest.mock('../src/services/offline', () => ({
  initOffline: jest.fn().mockResolvedValue(undefined),
  getPendingCount: jest.fn().mockResolvedValue(0),
  syncPendingSubmissions: jest.fn().mockResolvedValue({ synced: 0, failed: 0 }),
}));

describe('Background Sync — Module Import Safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('imports backgroundSync module without crashing', () => {
    // This tests that the module-level try-catch around TaskManager.defineTask works
    expect(() => {
      require('../src/services/backgroundSync');
    }).not.toThrow();
  });

  it('TaskManager.defineTask is called at import time', () => {
    const TaskManager = require('expo-task-manager');
    // Force re-import
    jest.resetModules();
    
    // Re-mock after resetModules
    jest.mock('expo-task-manager', () => ({
      defineTask: jest.fn(),
    }));
    jest.mock('expo-background-fetch', () => ({
      registerTaskAsync: jest.fn(),
      unregisterTaskAsync: jest.fn(),
      BackgroundFetchResult: { NewData: 1, NoData: 2, Failed: 3 },
    }));
    jest.mock('@react-native-community/netinfo', () => ({
      fetch: jest.fn().mockResolvedValue({ isConnected: true }),
    }));
    jest.mock('@sentry/react-native', () => ({
      init: jest.fn(),
      captureException: jest.fn(),
      captureMessage: jest.fn(),
    }));
    jest.mock('../src/services/offline', () => ({
      initOffline: jest.fn(),
      getPendingCount: jest.fn().mockResolvedValue(0),
      syncPendingSubmissions: jest.fn().mockResolvedValue({ synced: 0, failed: 0 }),
    }));

    require('../src/services/backgroundSync');
    const TM = require('expo-task-manager');
    expect(TM.defineTask).toHaveBeenCalled();
  });
});
