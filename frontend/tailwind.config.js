/** @type {import('tailwindcss').Config} */
import forms from '@tailwindcss/forms';
import containerQueries from '@tailwindcss/container-queries';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "surface-bright": "#fafaf4",
        "primary": "#001803",
        "inverse-primary": "#aad1a5",
        "tertiary-fixed-dim": "#7ddc7a",
        "on-background": "#1a1c19",
        "surface-tint": "#446743",
        "surface-container-high": "#e8e8e3",
        "surface-variant": "#e2e3dd",
        "surface-container-lowest": "#ffffff",
        "on-error": "#ffffff",
        "on-tertiary-fixed": "#002204",
        "surface-dim": "#dadad5",
        "primary-fixed": "#c6edbf",
        "tertiary-fixed": "#98f994",
        "secondary-container": "#a0f399",
        "on-primary-container": "#749870",
        "error-container": "#ffdad6",
        "on-secondary": "#ffffff",
        "on-primary-fixed-variant": "#2d4e2d",
        "surface": "#fafaf4",
        "on-secondary-fixed-variant": "#005312",
        "tertiary": "#001702",
        "on-error-container": "#93000a",
        "outline-variant": "#c2c8be",
        "on-secondary-container": "#217128",
        "tertiary-container": "#002f07",
        "error": "#ba1a1a",
        "on-primary-fixed": "#012105",
        "secondary": "#1b6d24",
        "on-surface": "#1a1c19",
        "outline": "#73796f",
        "on-tertiary-container": "#44a148",
        "on-tertiary": "#ffffff",
        "on-secondary-fixed": "#002204",
        "surface-container-highest": "#e2e3dd",
        "surface-container": "#eeeee9",
        "secondary-fixed-dim": "#88d982",
        "on-tertiary-fixed-variant": "#005313",
        "on-surface-variant": "#424840",
        "inverse-on-surface": "#f1f1ec",
        "on-primary": "#ffffff",
        "secondary-fixed": "#a3f69c",
        "background": "#fafaf4",
        "inverse-surface": "#2f312e",
        "primary-fixed-dim": "#aad1a5",
        "surface-container-low": "#f4f4ee",
        "surface-container-low": "#f4f4ee",
        "primary-container": "#a3f69c",
        "obsidian": "var(--obsidian)",
        "obsidian-mid": "var(--obsidian-mid)",
        "highland-gold": "var(--highland-gold)",
        "highland-gold-light": "var(--highland-gold-light)",
        "parchment": "var(--parchment)",
        "parchment-mid": "var(--parchment-mid)",
        "clay": "var(--clay)",
        "forest-mid": "var(--forest-mid)",
        "cream": "var(--cream)",
        "border": "var(--border)",
        "ink": "var(--ink)"
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-100%)' },
        },
        neonPulse: {
          '0%, 100%': { boxShadow: '0 0 10px #39ff14, 0 0 20px #39ff14, 0 0 30px #39ff14' },
          '50%': { boxShadow: '0 0 20px #39ff14, 0 0 30px #39ff14, 0 0 40px #39ff14' }
        },
        'pulse-gold': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(197,160,89,0.4)' },
          '50%': { boxShadow: '0 0 0 12px rgba(197,160,89,0)' }
        },
        'fade-up': {
          'from': { transform: 'translateY(24px)', opacity: '0' },
          'to': { transform: 'translateY(0)', opacity: '1' }
        },
        breathe: {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' }
        }
      },
      animation: {
        marquee: 'marquee 25s linear infinite',
        neonPulse: 'neonPulse 2s ease-in-out infinite',
        'pulse-gold': 'pulse-gold 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-up': 'fade-up 0.6s ease-out forwards',
        breathe: 'breathe 3s ease-in-out infinite'
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      spacing: {
        "md": "16px",
        "container-max": "1280px",
        "base": "8px",
        "sm": "12px",
        "xs": "4px",
        "lg": "24px",
        "xl": "48px",
        "admin-sidebar": "280px"
      },
      fontFamily: {
        "sans": ["Poppins", "sans-serif"],
        "display-lg": ["Outfit"],
        "data-mono": ["DM Mono"],
        "display-lg-mobile": ["Outfit"],
        "body-lg": ["Poppins", "sans-serif"],
        "body-md": ["Poppins", "sans-serif"],
        "headline-md": ["Outfit"],
        "label-caps": ["Outfit"],
        "headline-lg": ["Outfit"],
        "body-sm": ["Poppins", "sans-serif"],
        "bebas": ["Bebas Neue", "sans-serif"],
        "comfortaa": ["Comfortaa", "sans-serif"],
        "heading": ["Outfit", "sans-serif"],
        "body": ["DM Sans", "sans-serif"],
        "mono": ["DM Mono", "monospace"]
      },
      fontSize: {
        "display-lg": ["48px", {"lineHeight": "56px", "letterSpacing": "-0.02em", "fontWeight": "900"}],
        "data-mono": ["14px", {"lineHeight": "20px", "letterSpacing": "0.02em", "fontWeight": "500"}],
        "display-lg-mobile": ["32px", {"lineHeight": "40px", "fontWeight": "900"}],
        "body-lg": ["18px", {"lineHeight": "28px", "fontWeight": "400"}],
        "body-md": ["16px", {"lineHeight": "24px", "fontWeight": "400"}],
        "headline-md": ["24px", {"lineHeight": "32px", "fontWeight": "800"}],
        "label-caps": ["12px", {"lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "700"}],
        "headline-lg": ["32px", {"lineHeight": "40px", "fontWeight": "800"}],
        "body-sm": ["14px", {"lineHeight": "20px", "fontWeight": "400"}]
      }
    },
  },
  plugins: [
    forms,
    containerQueries,
  ],
}