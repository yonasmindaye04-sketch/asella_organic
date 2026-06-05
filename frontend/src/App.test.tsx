import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Provider } from 'react-redux';
import { store } from './store';
import App from './App';

describe('App', () => {
  it('renders Storefront view', () => {
    render(
      <Provider store={store}>
        <App />
      </Provider>
    );
    expect(screen.getAllByText('Asella Organic')[0]).toBeInTheDocument();
  });
});
