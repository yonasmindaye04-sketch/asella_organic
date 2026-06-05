
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders Storefront view', async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.getAllByText('Asella')[0]).toBeInTheDocument();
  });
});