// Mock the React Native globals
(globalThis as any).ErrorUtils = {
  setGlobalHandler: jest.fn(),
  getGlobalHandler: jest.fn(() => jest.fn()),
};

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
}));

describe('Global Error Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('sets up the global unhandled promise rejection tracker', () => {
    const mockSetUnhandledPromiseRejectionTracker = jest.fn();
    (globalThis as any).setUnhandledPromiseRejectionTracker = mockSetUnhandledPromiseRejectionTracker;

    const { setupGlobalErrorHandlers } = require('../src/utils/globalErrorHandler');
    setupGlobalErrorHandlers();

    expect(mockSetUnhandledPromiseRejectionTracker).toHaveBeenCalled();
  });

  it('overrides the default React Native ErrorUtils handler', () => {
    const { setupGlobalErrorHandlers } = require('../src/utils/globalErrorHandler');
    setupGlobalErrorHandlers();
    expect((globalThis as any).ErrorUtils.setGlobalHandler).toHaveBeenCalled();
  });
});
