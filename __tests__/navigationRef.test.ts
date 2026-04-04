/**
 * navigationRef.test.ts — Tests for crash-proof navigation functions
 * 
 * These tests verify that navigation functions never throw,
 * even when the navigation ref isn't ready.
 */

describe('Navigation Ref — Crash Safety', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('navigate() does NOT throw even when ref is not ready', () => {
    // Mock createNavigationContainerRef to return a ref that is not ready
    jest.mock('@react-navigation/native', () => ({
      createNavigationContainerRef: () => ({
        isReady: () => false,
        navigate: jest.fn(),
        goBack: jest.fn(),
        canGoBack: () => false,
        dispatch: jest.fn(),
      }),
      CommonActions: {
        reset: jest.fn((config: any) => ({ type: 'RESET', ...config })),
      },
    }));

    const { navigate } = require('../src/navigation/navigationRef');
    expect(() => navigate('Home')).not.toThrow();
    expect(() => navigate('Detail', { id: 123 })).not.toThrow();
  });

  it('goBack() does NOT throw even when ref is not ready', () => {
    jest.mock('@react-navigation/native', () => ({
      createNavigationContainerRef: () => ({
        isReady: () => false,
        navigate: jest.fn(),
        goBack: jest.fn(),
        canGoBack: () => false,
        dispatch: jest.fn(),
      }),
      CommonActions: { reset: jest.fn() },
    }));

    const { goBack } = require('../src/navigation/navigationRef');
    expect(() => goBack()).not.toThrow();
  });

  it('resetTo() does NOT throw even when ref is not ready', () => {
    jest.mock('@react-navigation/native', () => ({
      createNavigationContainerRef: () => ({
        isReady: () => false,
        dispatch: jest.fn(),
      }),
      CommonActions: { reset: jest.fn() },
    }));

    const { resetTo } = require('../src/navigation/navigationRef');
    expect(() => resetTo('Auth')).not.toThrow();
  });

  it('navigateNested() does NOT throw even when ref is not ready', () => {
    jest.mock('@react-navigation/native', () => ({
      createNavigationContainerRef: () => ({
        isReady: () => false,
        navigate: jest.fn(),
      }),
      CommonActions: { reset: jest.fn() },
    }));

    const { navigateNested } = require('../src/navigation/navigationRef');
    expect(() => navigateNested('Main', 'Home')).not.toThrow();
  });

  it('navigate() calls navigate on the ref when ready', () => {
    const mockNavigate = jest.fn();
    jest.mock('@react-navigation/native', () => ({
      createNavigationContainerRef: () => ({
        isReady: () => true,
        navigate: mockNavigate,
      }),
      CommonActions: { reset: jest.fn() },
    }));

    const { navigate } = require('../src/navigation/navigationRef');
    navigate('Home', { tab: 1 });
    expect(mockNavigate).toHaveBeenCalledWith('Home', { tab: 1 });
  });

  it('goBack() calls goBack when canGoBack returns true', () => {
    const mockGoBack = jest.fn();
    jest.mock('@react-navigation/native', () => ({
      createNavigationContainerRef: () => ({
        isReady: () => true,
        canGoBack: () => true,
        goBack: mockGoBack,
      }),
      CommonActions: { reset: jest.fn() },
    }));

    const { goBack } = require('../src/navigation/navigationRef');
    goBack();
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('goBack() does NOT call goBack when canGoBack returns false', () => {
    const mockGoBack = jest.fn();
    jest.mock('@react-navigation/native', () => ({
      createNavigationContainerRef: () => ({
        isReady: () => true,
        canGoBack: () => false,
        goBack: mockGoBack,
      }),
      CommonActions: { reset: jest.fn() },
    }));

    const { goBack } = require('../src/navigation/navigationRef');
    goBack();
    expect(mockGoBack).not.toHaveBeenCalled();
  });
});
