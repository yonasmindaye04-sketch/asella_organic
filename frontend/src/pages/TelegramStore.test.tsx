/**
 * frontend/src/pages/TelegramStore.test.tsx
 * Asella Organic — Telegram Mini App Store Unit Tests
 */

import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { TelegramStore } from './TelegramStore';
import { TelegramProvider } from '../context/TelegramContext';
import { MiniAppI18nProvider } from '../telegram/shop/MiniAppI18n';

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

// The Mini App talks to the backend over fetch; stub the two customer-facing
// endpoints so the Orders and Account tabs resolve deterministically.
const fetchMock = vi.fn();

const TEST_INIT_DATA = 'query_id=TEST&user=%7B%22id%22%3A987654321%7D&hash=deadbeef';

/**
 * Minimal WebApp surface. The Mini App treats a present Telegram client as the
 * only way to authenticate, so the Orders and Account tabs stay closed without
 * a signed `initData` payload.
 */
function installTelegramWebApp() {
  const noop = vi.fn();
  const button = {
    setText: vi.fn(),
    onClick: vi.fn(),
    offClick: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    showProgress: vi.fn(),
    hideProgress: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
  };

  (window as any).Telegram = {
    WebApp: {
      initData: TEST_INIT_DATA,
      initDataUnsafe: {
        user: { id: 987654321, first_name: 'Yonael', username: 'yonael' },
      },
      version: '8.0',
      platform: 'android',
      colorScheme: 'light',
      themeParams: {},
      MainButton: { ...button },
      BackButton: { ...button },
      SecondaryButton: { ...button },
      HapticFeedback: {
        impactOccurred: noop,
        notificationOccurred: noop,
        selectionChanged: noop,
      },
      ready: noop,
      expand: noop,
      onEvent: noop,
      offEvent: noop,
      openLink: noop,
      openTelegramLink: noop,
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  installTelegramWebApp();
  fetchMock.mockReset();
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    const json = (data: unknown) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(data),
      } as Response);

    if (url.includes('/my-orders')) {
      return json({
        success: true,
        data: [
          {
            id: 'ORD-20261007-ABCD',
            status: 'Delivered',
            total: 350,
            order_type: 'delivery',
            city: 'Addis Ababa',
            location: 'Bole',
            created_at: '2026-10-07T09:00:00.000Z',
            payment_status: 'Paid',
            items: [
              {
                item_name: 'Moringa Powder',
                package_size: '250g',
                quantity: 1,
                unit_price: 350,
              },
            ],
          },
        ],
        meta: { total: 1, page: 1, limit: 20, pages: 1 },
      });
    }

    if (url.includes('/profile')) {
      return json({
        success: true,
        data: {
          chat_id: 987654321,
          telegram: {
            username: 'yonael',
            first_name: 'Yonael',
            last_name: null,
            photo_url: null,
            is_premium: false,
          },
          profile: {
            display_name: 'Yonael',
            phone: '+251900000000',
            city: 'Addis Ababa',
            location: 'Bole',
            updated_at: null,
          },
          stats: {
            order_count: 3,
            delivered_count: 2,
            active_count: 1,
            total_spent: 1050,
          },
        },
      });
    }

    return json({ success: true, data: {} });
  });

  vi.stubGlobal('fetch', fetchMock);
});

function renderStore() {
  return render(
    <TelegramProvider>
      <MiniAppI18nProvider>
        <TelegramStore />
      </MiniAppI18nProvider>
    </TelegramProvider>
  );
}

async function renderStoreAsync() {
  let result!: ReturnType<typeof renderStore>;
  await act(async () => {
    result = renderStore();
  });
  return result;
}

/** Renders the Mini App with a specific starting language. */
function renderStoreIn(language: 'en' | 'am' | 'or') {
  return render(
    <TelegramProvider>
      <MiniAppI18nProvider forceLanguage={language}>
        <TelegramStore />
      </MiniAppI18nProvider>
    </TelegramProvider>
  );
}

async function renderStoreInAsync(language: 'en' | 'am' | 'or') {
  let result!: ReturnType<typeof renderStoreIn>;
  await act(async () => {
    result = renderStoreIn(language);
  });
  return result;
}

/** jsdom has no layout engine, so window.scrollTo is not implemented. */
beforeAll(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

describe('TelegramStore Store tab', () => {
  it('renders store header, categories, and organic products', async () => {
    await renderStoreAsync();

    // Store branding — "Highland Ethiopia" was removed from the Mini App header
    expect(screen.getByText('Asella Organic')).toBeInTheDocument();
    expect(screen.queryByText('Highland Ethiopia')).not.toBeInTheDocument();

    // Category circles
    expect(screen.getByText('All products')).toBeInTheDocument();
    expect(screen.getByText('Oils')).toBeInTheDocument();
    expect(screen.getByText('Best Sellers')).toBeInTheDocument();
    // "Superfood" appears both as a category circle and as the product tag.
    expect(screen.getAllByText('Superfood').length).toBeGreaterThan(0);

    // Product name, price and action
    expect(screen.getByText('Moringa Powder')).toBeInTheDocument();
    expect(screen.getByText('ETB 350')).toBeInTheDocument();
    expect(screen.getByText('Add to Cart')).toBeInTheDocument();
  });

  it('renders the bottom tab bar with all four sections', async () => {
    await renderStoreAsync();

    const nav = screen.getByRole('navigation', { name: /store sections/i });
    expect(nav).toBeInTheDocument();

    for (const label of ['Store', 'Discover', 'Orders', 'Account']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}$`) })).toBeInTheDocument();
    }
  });

  it('filters the grid by search query', async () => {
    const user = userEvent.setup();
    await renderStoreAsync();

    expect(screen.getByText('Moringa Powder')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/search organic products/i), 'shilajit');

    await waitFor(() => {
      expect(screen.queryByText('Moringa Powder')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/no products match your search/i)).toBeInTheDocument();
  });

  it('adds a product to the cart and shows it in the cart overlay', async () => {
    const user = userEvent.setup();
    await renderStoreAsync();

    await user.click(screen.getByText('Add to Cart'));

    await user.click(screen.getByRole('button', { name: /open cart/i }));

    expect(await screen.findByText('Shopping Cart')).toBeInTheDocument();
    expect(screen.getByText('Moringa Powder')).toBeInTheDocument();
  });
});

describe('TelegramStore language selection', () => {
  // The expected copy below is pinned on purpose: it is what proves a
  // translation correction landed. Values track src/telegram/shop/i18n.ts.
  it('renders the store shell, tabs and categories in Amharic', async () => {
    await renderStoreInAsync('am');

    expect(screen.getByText('ለእርስዎ')).toBeInTheDocument();
    // store.searchLabel — a descriptive accessible name, not a bare "search".
    expect(screen.getByRole('searchbox', { name: 'የተፈጥሮ ምርት ይፈልጉ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ትዕዛዞች' })).toBeInTheDocument();
    expect(screen.getByText('ሁሉም ምርቶች')).toBeInTheDocument();
  });

  it('renders the store shell, tabs and categories in Oromo', async () => {
    await renderStoreInAsync('or');

    expect(screen.getByText('Siif')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Barbaadi' })).toBeInTheDocument();
    expect(screen.getByText('Oomishaalee hunda')).toBeInTheDocument();
  });

  it('translates the cart flow and keeps product data untranslated', async () => {
    const user = userEvent.setup();
    await renderStoreInAsync('am');

    await user.click(screen.getByRole('button', { name: /ወደ ቅርጫት ጨምር/i }));
    await user.click(screen.getByRole('button', { name: /ቅርጫት ክፈት/i }));

    expect(await screen.findByText('የግዢ ቅርጫት')).toBeInTheDocument();
    expect(screen.getByText('ወደ ክፍያ ይቀጥሉ')).toBeInTheDocument();
    // Product names come from the catalogue and must not be translated.
    expect(screen.getByText('Moringa Powder')).toBeInTheDocument();
  });

  it('persists the chosen language and reflects it in the document lang', async () => {
    const user = userEvent.setup();
    await renderStoreAsync();

    await user.selectOptions(screen.getByLabelText('Language'), 'am');

    await waitFor(() => expect(document.documentElement.lang).toBe('am'));
    expect(localStorage.getItem('asella_tma_language')).toBe('am');
  });
});

describe('TelegramStore navigation', () => {
  it('hides the back button until there is somewhere to go back to', async () => {
    await renderStoreAsync();

    expect(screen.queryByRole('button', { name: /go back/i })).not.toBeInTheDocument();
  });

  it('opens a product, shows the back button, and returns to the grid', async () => {
    const user = userEvent.setup();
    await renderStoreAsync();

    await user.click(screen.getByRole('button', { name: /view moringa powder/i }));

    const back = await screen.findByRole('button', { name: /go back/i });
    expect(back).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to cart & checkout/i })).toBeInTheDocument();

    await user.click(back);

    expect(await screen.findByRole('button', { name: /view moringa powder/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /go back/i })).not.toBeInTheDocument();
  });

  it('remembers a tab switch so back returns to the previous tab', async () => {
    const user = userEvent.setup();
    await renderStoreAsync();

    await user.click(screen.getByRole('button', { name: /^Discover$/ }));
    expect(await screen.findByText('Discover', { selector: 'h1' })).toBeInTheDocument();

    const back = await screen.findByRole('button', { name: /go back/i });
    await user.click(back);

    expect(await screen.findByText('For you')).toBeInTheDocument();
  });
});

describe('TelegramStore theme', () => {
  it('toggles the dark class on the document root and persists the choice', async () => {
    const user = userEvent.setup();
    await renderStoreAsync();

    expect(document.documentElement.classList.contains('dark')).toBe(false);

    await user.click(screen.getByRole('button', { name: /switch to dark theme/i }));

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
    expect(localStorage.getItem('asella_tma_theme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: /switch to light theme/i }));

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
    expect(localStorage.getItem('asella_tma_theme')).toBe('light');
  });
});

describe('TelegramStore Orders tab', () => {
  it('loads the authenticated customer orders with filters applied', async () => {
    const user = userEvent.setup();
    await renderStoreAsync();

    await user.click(screen.getByRole('button', { name: /^Orders$/ }));

    expect(await screen.findByText('My orders')).toBeInTheDocument();
    expect(screen.getByText('ORD-20261007-ABCD')).toBeInTheDocument();

    const ordersCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/my-orders'));
    expect(ordersCall).toBeDefined();
    expect(String(ordersCall?.[0])).not.toContain('chat_id=');
  });

  it('filters orders by status', async () => {
    const user = userEvent.setup();
    await renderStoreAsync();

    await user.click(screen.getByRole('button', { name: /^Orders$/ }));
    await screen.findByText('My orders');

    await user.click(screen.getByRole('button', { name: 'Delivered' }));

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls
        .filter(([url]) => String(url).includes('/my-orders'))
        .pop();
      expect(String(lastCall?.[0])).toContain('status=delivered');
    });
  });
});

describe('TelegramStore Account tab', () => {
  it('loads the profile and renders order stats', async () => {
    const user = userEvent.setup();
    await renderStoreAsync();

    await user.click(screen.getByRole('button', { name: /^Account$/ }));

    expect(await screen.findByText('Your profile')).toBeInTheDocument();
    expect(screen.getByText('Your orders')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Yonael');
  });

  it('saves an updated profile', async () => {
    const user = userEvent.setup();
    await renderStoreAsync();

    await user.click(screen.getByRole('button', { name: /^Account$/ }));
    const nameInput = await screen.findByLabelText(/display name/i);

    await user.clear(nameInput);
    await user.type(nameInput, 'Yonael Bekele');
    await user.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes('/profile') && (init as RequestInit | undefined)?.method === 'PUT'
      );
      expect(putCall).toBeDefined();
      expect(JSON.parse(String((putCall?.[1] as RequestInit).body)).display_name).toBe(
        'Yonael Bekele'
      );
    });

    expect(await screen.findByText(/profile saved at/i)).toBeInTheDocument();
  });
});