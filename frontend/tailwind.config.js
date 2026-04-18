/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		fontFamily: {
  			geist: ['Geist', 'Inter', 'sans-serif'],
  		},
  		colors: {
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-bg))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			// --- Material Design 3 token aliases ---
  			// Surface family — maps onto existing shadcn vars so AMOLED palette
  			// continues to drive both naming systems.
  			surface: 'hsl(var(--background))',
  			'surface-bright': 'hsl(var(--card))',
  			'surface-dim': 'hsl(var(--muted))',
  			'surface-tint': 'hsl(var(--primary))',
  			'surface-container-lowest': 'hsl(var(--background))',
  			'surface-container-low': 'hsl(var(--card))',
  			'surface-container': 'hsl(var(--muted))',
  			'surface-container-high': 'hsl(var(--accent))',
  			'surface-container-highest': 'hsl(var(--accent))',
  			'on-surface': 'hsl(var(--foreground))',
  			'on-surface-variant': 'hsl(var(--muted-foreground))',
  			'on-background': 'hsl(var(--foreground))',
  			// Primary container family — distinct from solid primary
  			'primary-container': 'hsl(var(--primary) / 0.18)',
  			'on-primary-container': 'hsl(var(--foreground))',
  			'primary-fixed': '#d8e2ff',
  			'primary-fixed-dim': '#adc6ff',
  			'on-primary-fixed': '#001a41',
  			'on-primary-fixed-variant': '#004493',
  			// Secondary container
  			'secondary-container': 'hsl(var(--secondary) / 0.25)',
  			'on-secondary-container': 'hsl(var(--foreground))',
  			'secondary-fixed': '#d8e2ff',
  			'secondary-fixed-dim': '#adc6ff',
  			'on-secondary-fixed': '#001a41',
  			'on-secondary-fixed-variant': '#26467d',
  			// Tertiary (warm orange in MD3 reference) — kept as literal to
  			// avoid polluting the shadcn palette
  			tertiary: '#9e3d00',
  			'on-tertiary': '#ffffff',
  			'tertiary-container': '#c64f00',
  			'on-tertiary-container': '#fffbff',
  			'tertiary-fixed': '#ffdbcc',
  			'tertiary-fixed-dim': '#ffb595',
  			'on-tertiary-fixed': '#351000',
  			'on-tertiary-fixed-variant': '#7c2e00',
  			// Error family — alias destructive
  			error: 'hsl(var(--destructive))',
  			'on-error': 'hsl(var(--destructive-foreground))',
  			'error-container': 'hsl(var(--destructive) / 0.18)',
  			'on-error-container': 'hsl(var(--destructive))',
  			// Outline family
  			outline: 'hsl(var(--border))',
  			'outline-variant': 'hsl(var(--border) / 0.6)',
  			// Inverse family
  			'inverse-surface': 'hsl(var(--foreground))',
  			'inverse-on-surface': 'hsl(var(--background))',
  			'inverse-primary': 'hsl(var(--primary) / 0.7)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};