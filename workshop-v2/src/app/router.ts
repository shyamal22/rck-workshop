/* Hash routing: #/path/with/segments. */
import { useEffect, useState } from 'preact/hooks';

export interface Route { path: string; parts: string[] }

export function parseHash(hash = location.hash): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const path = raw.startsWith('/') ? raw : '/' + raw;
  return { path, parts: path.split('/').filter(Boolean) };
}

export function go(hash: string): void {
  if (location.hash === hash) return;
  location.hash = hash;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parseHash());
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
