import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#F0F7F4',
          100: '#DCEDE6',
          200: '#BBDACE',
          300: '#8FC0AF',
          400: '#5F9F8B',
          500: '#40836F',
          600: '#2F6D5C',
          700: '#28594C',
          800: '#224840',
          900: '#1E3C36',
          950: '#0F211D',
        },
        canvas: '#F8F8F6',
        card: '#FFFFFF',
        line: '#E9E7E2',
        ink: {
          DEFAULT: '#1C1917',
          muted: '#78716C',
          faint: '#A8A29E',
        },
        accent: '#F59E0B',
        success: '#16A34A',
        warning: '#D97706',
        danger: '#DC2626',
        info: '#2563EB',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(28 25 23 / 0.04)',
      },
    },
  },
  plugins: [],
};
export default config;
