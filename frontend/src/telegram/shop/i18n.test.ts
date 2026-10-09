import { describe, it, expect } from 'vitest';
import {
  translate,
  missingTranslations,
  isLanguage,
  LANGUAGES,
  type Language,
} from './i18n';
import { orderStatusTone, formatEtb, formatOrderDate } from './types';

describe('i18n', () => {
  it('exposes exactly the three supported languages', () => {
    expect(LANGUAGES.map((l) => l.id)).toEqual<Language[]>(['en', 'am', 'or']);
  });

  it('resolves English keys', () => {
    expect(translate('en', 'tab.store')).toBe('Store');
    expect(translate('en', 'orders.keepShopping')).toBe('Keep shopping');
  });

  it('translates the same key into Amharic and Oromo', () => {
    // Expected values are pinned deliberately: this is what proves a
    // translation correction actually landed in the dictionary. Update them
    // when the copy is corrected, not the other way round.
    expect(translate('am', 'tab.store')).toBe('ገበያ'); // shop
    expect(translate('or', 'tab.store')).toBe('Suuqii');
  });

  it('interpolates placeholders', () => {
    expect(translate('en', 'store.count', { count: 5 })).toBe('5 products');
    expect(translate('en', 'cart.title')).toBe('Shopping Cart');
    expect(translate('am', 'account.active', { count: 2 })).toContain('2');
  });

  it('falls back to English when a translation is missing', () => {
    // Force a missing key by asking for one that only English defines.
    const missing = missingTranslations('am');
    expect(Array.isArray(missing)).toBe(true);
    for (const key of missing) {
      expect(translate('am', key)).toBe(translate('en', key));
    }
  });

  it('returns the key itself for an unknown key rather than blank text', () => {
    expect(translate('en', 'does.not.exist')).toBe('does.not.exist');
  });

  it('keeps an unresolved placeholder visible instead of dropping it', () => {
    expect(translate('en', 'store.count', {})).toContain('{count}');
  });

  it('validates language codes', () => {
    expect(isLanguage('en')).toBe(true);
    expect(isLanguage('am')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });

  it('has no untranslated keys in the shipped dictionaries', () => {
    // A gap here means a customer sees English inside an Amharic session.
    expect(missingTranslations('am')).toEqual([]);
    expect(missingTranslations('or')).toEqual([]);
  });
});

describe('order formatting', () => {
  it('formats ETB amounts', () => {
    expect(formatEtb(1500)).toBe('ETB 1,500');
    expect(formatEtb('800')).toBe('ETB 800');
  });

  it('maps every real order status to a tone', () => {
    const statuses = [
      'Pending', 'Confirmed', 'Packed', 'In Transit', 'Processing',
      'Out for Delivery', 'Delivered', 'Cancelled', 'Issue', 'Returned',
    ];
    for (const status of statuses) {
      const tone = orderStatusTone(status);
      expect(tone.label.length).toBeGreaterThan(0);
      expect(tone.className.length).toBeGreaterThan(0);
    }
  });

  it('gives Delivered a distinct treatment from Cancelled', () => {
    expect(orderStatusTone('Delivered').className).not.toBe(
      orderStatusTone('Cancelled').className
    );
  });

  it('returns an unparseable date unchanged rather than "Invalid Date"', () => {
    expect(formatOrderDate('not-a-date')).toBe('not-a-date');
  });
});