import { useEffect, useState } from 'react';

const storageKey = 'dtr.sidebar.collapsed';
export function useSidebarState() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(collapsed));
    } catch {
      /* The menu still works when browser storage is unavailable. */
    }
  }, [collapsed]);
  return { collapsed, toggle: () => setCollapsed((value) => !value) };
}
