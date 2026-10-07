import { useEffect } from 'react';

/** Sets the browser tab title, e.g. "Inventory · VaxTrack" (also read out when navigating) */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · VaxTrack` : 'VaxTrack';
  }, [title]);
}
