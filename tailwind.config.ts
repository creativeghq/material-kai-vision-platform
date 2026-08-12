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
				display: ['Aleo', 'Georgia', 'Times New Roman', 'serif'],
				// Numerals + display metrics. The slab (Aleo) reads editorial at large
				// sizes; instrumentation wants the grotesque.
				metric: ['Averta', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
			},
			fontSize: {
				// Display tier — the platform previously topped out at text-4xl (36px),
				// which is why page titles, card titles and body all sat in one band.
				'metric-sm': ['1.75rem', { lineHeight: '0.92', letterSpacing: '-0.04em' }],
				'metric-md': ['2.75rem', { lineHeight: '0.92', letterSpacing: '-0.04em' }],
				'metric-lg': ['4rem', { lineHeight: '0.92', letterSpacing: '-0.04em' }],
				'metric-xl': ['5.5rem', { lineHeight: '0.92', letterSpacing: '-0.045em' }],
				'display-sm': ['2rem', { lineHeight: '1.05', letterSpacing: '-0.025em' }],
				'display-md': ['2.75rem', { lineHeight: '1', letterSpacing: '-0.028em' }],
				'display-lg': ['3.75rem', { lineHeight: '0.95', letterSpacing: '-0.03em' }],
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
				// The acid data accent. `--primary` has to stay legible as TEXT in both
				// themes (1024 `text-primary` call sites cap how acid it can go in light
				// mode); `vivid` is the uncapped FILL accent — meters, sparklines,
				// positive deltas, the one primary CTA. Always near-black ink on top.
				vivid: {
					DEFAULT: 'hsl(var(--vivid))',
					foreground: 'hsl(var(--vivid-foreground))',
				},
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
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
