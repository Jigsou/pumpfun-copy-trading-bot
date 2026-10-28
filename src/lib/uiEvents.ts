export const openSettings = (section?: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('open-settings', { detail: { section: section ?? null } }));
};
