import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Provider } from 'react-redux';
import { store } from './store';
import App from './App';

describe('App', () => {
  it('renders Storefront view', async () => {
    await act(async () => {
      render(
        <Provider store={store}>
          <App />
        </Provider>
      );
    });
    expect(screen.getAllByText('Asella')[0]).toBeInTheDocument();
  });
});