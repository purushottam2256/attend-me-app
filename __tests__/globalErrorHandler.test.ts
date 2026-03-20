import { setupGlobalErrorHandlers } from '../src/utils/globalErrorHandler';

// Mock the React Native globals
(globalThis as any).ErrorUtils = {
  setGlobalHandler: jest.fn(),
  getGlobalHandler: jest.fn(() => jest.fn()),
};

describe('Global Error Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets up the global unhandled promise rejection tracker', () => {
    const mockSetUnhandledPromiseRejectionTracker = jest.fn();
    (globalThis as any).setUnhandledPromiseRejectionTracker = mockSetUnhandledPromiseRejectionTracker;

    setupGlobalErrorHandlers();

    expect(mockSetUnhandledPromiseRejectionTracker).toHaveBeenCalled();
  });

  it('overrides the default React Native ErrorUtils handler', () => {
    setupGlobalErrorHandlers();
    expect((globalThis as any).ErrorUtils.setGlobalHandler).toHaveBeenCalled();
  });
});
