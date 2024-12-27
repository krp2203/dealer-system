/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import App from './App.tsx';

test('renders KPM Dealer System header', () => {
  render(<App />);
  const headerElement = screen.getByText(/KPM Dealer System/i);
  expect(headerElement).toBeInTheDocument();
});
