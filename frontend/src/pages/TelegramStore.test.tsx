/**
 * frontend/src/pages/TelegramStore.test.tsx
 * Asella Organic — Telegram Mini App Store Unit Tests
 */

import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TelegramStore } from './TelegramStore';
import { TelegramProvider } from '../context/TelegramContext';
import { LanguageProvider } from '../LanguageContext';

// Mock useGroupedProducts hook
vi.mock('../hooks/useProducts', () => ({
  useGroupedProducts: () => ({
    groupedProducts: [
      {
        name: 'Moringa Powder',
        description: 'Highland organic moringa leaf powder.',
        image_url: '/image/products/moringa.png',
        featured: 1,
        tag: 'Superfood',
        active: 1,
        variants: [
          {
            id: 'variant-1',
            package_size: '250g',
            price: '350',
            inventory_quantity: 25,
            low_stock_threshold: 5,
            active: 1,
          },
          {
            id: 'variant-2',
            package_size: '500g',
            price: '650',
            inventory_quantity: 15,
            low_stock_threshold: 5,
            active: 1,
          },
        ],
      },
    ],
    loading: false,
    error: null,
  }),
}));

describe('TelegramStore Component', () => {
  it('renders store header, categories, and organic products', async () => {
    await act(async () => {
      render(
        <LanguageProvider>
          <TelegramProvider>
            <TelegramStore />
          </TelegramProvider>
        </LanguageProvider>
      );
    });

    // Check store branding
    expect(screen.getByText('Asella Organic')).toBeInTheDocument();
    expect(screen.getByText('Highland Ethiopia')).toBeInTheDocument();

    // Check category pills
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Superfood')).toBeInTheDocument();
    expect(screen.getByText('Oils')).toBeInTheDocument();
    expect(screen.getByText('Best Sellers')).toBeInTheDocument();

    // Check product name and price
    expect(screen.getByText('Moringa Powder')).toBeInTheDocument();
    expect(screen.getByText('ETB 350')).toBeInTheDocument();
    expect(screen.getByText('Add to Cart')).toBeInTheDocument();
  });
});
