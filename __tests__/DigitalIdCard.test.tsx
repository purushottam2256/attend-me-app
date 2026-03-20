import React from 'react';
import { render } from '@testing-library/react-native';
import { DigitalIdCard } from '../src/features/profile/components/DigitalIdCard';

// Mock expo-image since it's used inside DigitalIdCard potentially
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return {
    Image: View,
  };
});

// Mock react-native-qrcode-svg
jest.mock('react-native-qrcode-svg', () => {
  const { View } = require('react-native');
  return View;
});

describe('DigitalIdCard Component', () => {
  const mockUser = {
    userId: '123-abc',
    name: 'John Doe',
    role: 'faculty',
    dept: 'Computer Science',
    email: 'john.doe@mrce.in',
  };

  it('renders correctly with user details', () => {
    const { getByText } = render(<DigitalIdCard user={mockUser} />);
    
    // Assert names and departments render
    expect(getByText('John Doe')).toBeTruthy();
    expect(getByText('Computer Science')).toBeTruthy();
    
    // Assert role translates properly (typically upper-cased or formatted)
    expect(getByText('FACULTY')).toBeTruthy();
  });

  it('renders safely when optional data is missing', () => {
    // Exclude dept to ensure it doesn't crash on null renders
    const minimalUser = {
      userId: '456-def',
      name: 'Jane Smith',
      role: 'management',
      email: 'jane@mrce.in',
    };

    const { getByText } = render(<DigitalIdCard user={minimalUser as any} />);
    
    expect(getByText('Jane Smith')).toBeTruthy();
    expect(getByText('MANAGEMENT')).toBeTruthy();
  });
});
