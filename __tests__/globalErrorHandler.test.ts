/**
 * globalErrorHandler.test.ts — Tests for global crash prevention
 */

// Mock Sentry
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

import { setupGlobalErrorHandlers } from '../src/utils/globalErrorHandler';

describe('Global Error Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('setupGlobalErrorHandlers runs without crashing', () => {
    expect(() => setupGlobalErrorHandlers()).not.toThrow();
  });

  it('can be called multiple times safely (idempotent)', () => {
    expect(() => {
      setupGlobalErrorHandlers();
      setupGlobalErrorHandlers();
      setupGlobalErrorHandlers();
    }).not.toThrow();
  });
});
