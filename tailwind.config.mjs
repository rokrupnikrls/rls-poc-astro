/** Tailwind config tuned to match the visual style of
 *  the RLS AksIM‑2 product page:
 *  https://www.rls.si/eng/aksim-2-off-axis-rotary-absolute-encoder
 */

export default {
	content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
	theme: {
		container: {
			center: true,
			padding: {
				DEFAULT: "1.5rem",
				lg: "3rem",
				"2xl": "4rem",
			},
			screens: {
				sm: "640px",
				md: "900px",
				lg: "1120px",
				xl: "1280px",
				"2xl": "1360px",
			},
		},
		extend: {
			fontFamily: {
				sans: ['system-ui', 'ui-sans-serif', 'Segoe UI', 'sans-serif'],
			},
			colors: {
				brand: {
					// Header / top nav
					headerBg: "#ffffff",
					headerBorder: "#e5e7eb",
					// Left sidebar
					sidebarBg: "#f6f4f2",
					sidebarText: "#4b5563",
					sidebarActive: "#f97316",
					// Main content
					pageBg: "#f8fafc",
					surface: "#ffffff",
					surfaceBorder: "#e5e7eb",
					title: "#111827",
					body: "#374151",
					muted: "#6b7280",
					// Accent buttons & links (orange)
					accent: "#f97316",
					accentHover: "#ea580c",
				},
			},
			boxShadow: {
				"card-soft": "0 18px 45px rgba(15, 23, 42, 0.06)",
			},
			borderRadius: {
				lg: "0.75rem",
				xl: "1rem",
				"2xl": "1.25rem",
			},
			letterSpacing: {
				wide: "0.08em",
				wider: "0.14em",
			},
		},
	},
	plugins: [],
};

