import type { Config } from 'tailwindcss';

export default {
	darkMode: 'class',
	content: [
		'./index.html',
		'./src/**/*.{ts,tsx}',
	],
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px',
			},
		},
		extend: {
			fontFamily: {
				sans: ['Averta', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
				// 'Averta' before Georgia: Aleo has no Greek and only partial latin-ext,
				// so Greek names in headings fell through to a system serif. Must stay in
				// sync with --font-display in src/index.css.
				display: ['Aleo', 'Averta', 'Georgia', 'Times New Roman', 'serif'],
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))',
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))',
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))',
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))',
				},
				amber: {
					DEFAULT: 'hsl(var(--amber))',
					bg: 'hsl(var(--amber-bg))',
					foreground: 'hsl(var(--amber-foreground))',
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))',
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))',
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))',
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))',
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))',
				},
				error: {
					DEFAULT: 'hsl(var(--error))',
					foreground: 'hsl(var(--error-foreground))',
				},
				info: {
					DEFAULT: 'hsl(var(--info))',
					foreground: 'hsl(var(--info-foreground))',
				},
				// Surface system. `hairline` is the single rule/edge colour —
				// header underlines, row separators, panel borders, input outlines
				// are ALL this one value, which is most of what makes a dense
				// interface read as tidy rather than busy.
				hairline: 'hsl(var(--hairline))',
				surface: {
					hover: 'hsl(var(--surface-hover))',
					sunken: 'hsl(var(--surface-sunken))',
				},
			},
			// Product-UI corner scale. `xl`/`2xl`/`3xl` are OVERRIDDEN (Tailwind
			// ships 12/16/24px) because they are used on hundreds of containers
			// across the app and the old values rounded a data panel harder than
			// an OS window. Redefining them here re-shapes every one of those call
			// sites at once instead of editing them; the names still read as "a
			// step rounder than the last", which is all a consumer needs.
			borderRadius: {
				xs: 'var(--radius-xs)',   // 2px  — tag, checkbox
				sm: 'var(--radius-sm)',   // 4px  — button, input, select, tag
				DEFAULT: 'var(--radius-sm)',
				md: 'var(--radius-md)',   // 6px  — card, panel, table container
				lg: 'var(--radius-md)',   // 6px  — `rounded-lg` is the app's most-used
				                          //        container radius; it maps to panel.
				xl: 'var(--radius-lg)',   // 8px  — dialog, popover, dropdown
				'2xl': 'var(--radius-xl)',// 10px — modal, sheet
				'3xl': 'var(--radius-2xl)',// 12px — full-bleed hero panel
			},
			// Elevation is a ladder with four rungs and a hard ceiling. `xl` and
			// `2xl` are overridden rather than left at Tailwind's defaults so that
			// the ~12 call sites reaching for a dramatic shadow land on the same
			// overlay value everything else floats at — the alternative is one
			// modal in the app casting a 25px-blur shadow nothing else casts.
			boxShadow: {
				xs: 'var(--shadow-xs)',
				sm: 'var(--shadow-sm)',
				DEFAULT: 'var(--shadow)',
				md: 'var(--shadow-md)',
				lg: 'var(--shadow-lg)',
				xl: 'var(--shadow-overlay)',
				'2xl': 'var(--shadow-overlay)',
				// Floating layers only — dropdown, popover, dialog, toast.
				overlay: 'var(--shadow-overlay)',
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0',
					},
					to: {
						height: 'var(--radix-accordion-content-height)',
					},
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)',
					},
					to: {
						height: '0',
					},
				},
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
			},
		},
	},
	plugins: [require('tailwindcss-animate')],
} satisfies Config;
