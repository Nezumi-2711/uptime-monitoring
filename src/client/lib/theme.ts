import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'upwatch-theme';
const listeners = new Set<() => void>();
let currentTheme: Theme = 'light';

function getPreferredTheme(): Theme {
	try {
		const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
		if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;
	} catch {
		// Storage can be unavailable in privacy or sandboxed contexts.
	}

	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
	document.documentElement.classList.toggle('dark', theme === 'dark');
	document.documentElement.style.colorScheme = theme;
	document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171717' : '#ffffff');
}

export function initializeTheme() {
	currentTheme = getPreferredTheme();
	applyTheme(currentTheme);
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function getThemeSnapshot() {
	return currentTheme;
}

export function useTheme() {
	const theme = useSyncExternalStore(subscribe, getThemeSnapshot, () => 'light');
	function toggleTheme() {
		const nextTheme = theme === 'dark' ? 'light' : 'dark';
		currentTheme = nextTheme;
		applyTheme(nextTheme);
		listeners.forEach((listener) => listener());
		try {
			window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
		} catch {
			// The active theme still works for this page when persistence is unavailable.
		}
	}

	return { theme, toggleTheme };
}
