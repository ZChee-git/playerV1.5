// Minimal in-app toast utility. Injects a simple toast container and exposes
// a global helper `window.showToast(message: string)` for ease of use across
// the app. This keeps changes minimal while replacing blocking `alert()` calls.

export function initToast() {
  if (typeof window === 'undefined') return;
  const win: any = window;
  if (win.showToast) return; // already initialized

  const container = document.createElement('div');
  container.id = 'app-toast-container';
  container.style.position = 'fixed';
  container.style.right = '16px';
  container.style.bottom = '16px';
  container.style.zIndex = '9999';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '8px';
  document.body.appendChild(container);

  win.showToast = (message: string, ttl: number = 4000) => {
    try {
      const toast = document.createElement('div');
      toast.textContent = message;
      toast.style.background = 'rgba(0,0,0,0.85)';
      toast.style.color = 'white';
      toast.style.padding = '10px 14px';
      toast.style.borderRadius = '8px';
      toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
      toast.style.maxWidth = '320px';
      toast.style.fontSize = '14px';
      toast.style.lineHeight = '1.2';
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 200ms ease, transform 200ms ease';
      toast.style.transform = 'translateY(6px)';
      container.appendChild(toast);

      // trigger enter
      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      });

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(6px)';
        setTimeout(() => {
          try { container.removeChild(toast); } catch (e) { /* ignore */ }
        }, 220);
      }, ttl);
    } catch (e) {
      console.error('showToast error', e);
    }
  };
}

export function showToast(message: string, ttl?: number) {
  const win: any = window;
  if (win && typeof win.showToast === 'function') {
    win.showToast(message, ttl);
  } else {
    // fallback
    alert(message);
  }
}
