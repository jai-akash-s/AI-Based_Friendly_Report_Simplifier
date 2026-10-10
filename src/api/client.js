let cachedCsrfToken = null;

export const fetchCsrfToken = async () => {
  try {
    const res = await fetch('/api/auth/csrf', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      cachedCsrfToken = data.csrf_token || null;
      return cachedCsrfToken;
    }
  } catch (err) {
    console.warn('Could not retrieve CSRF token:', err);
  }
  return null;
};

export const api = async (path, options = {}) => {
  const headers = new Headers(options.headers || {});

  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    if (!cachedCsrfToken) {
      await fetchCsrfToken();
    }
    if (cachedCsrfToken && !headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', cachedCsrfToken);
    }
  }

  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong.');
  }
  return data;
};

export const go = (path) => {
  const target = path.startsWith('/') ? path : `/${path}`;
  window.location.hash = `#${target}`;
};

export const cleanPath = (hash = window.location.hash) => {
  const p = (hash || '').replace(/^#\/?/, '').split('?')[0].split('#')[0].trim();
  if (!p || p === 'dashboard' || p === 'upload') return '/dashboard';
  return '/' + p;
};
