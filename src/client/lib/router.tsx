import { useSyncExternalStore } from "react";

const subscribe = (listener: () => void) => {
	window.addEventListener("popstate", listener);
	return () => window.removeEventListener("popstate", listener);
};

const getPathname = () => window.location.pathname;
const getServerPathname = () => "/";

export function usePathname() {
	return useSyncExternalStore(subscribe, getPathname, getServerPathname);
}

export function navigate(path: string, options: { replace?: boolean } = {}) {
	if (path === window.location.pathname) return;
	const method = options.replace ? "replaceState" : "pushState";
	window.history[method](null, "", path);
	window.dispatchEvent(new PopStateEvent("popstate"));
	window.scrollTo({ top: 0 });
}
