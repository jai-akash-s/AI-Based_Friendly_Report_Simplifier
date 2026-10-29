let cachedCsrfToken = null;

const API_BASE_URL = (
  (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL)) ||
  ''
).replace(/\/$/, '');

export const getApiUrl = (path = '') => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${cleanPath}` : cleanPath;
};

if (typeof window !== 'undefined' && !API_BASE_URL && window.location.hostname.endsWith('vercel.app')) {
  console.warn(
    '[MedReport] VITE_API_URL is not set! Vercel is only hosting frontend static files. Database operations require a running backend server (e.g. Render). Please set VITE_API_URL in your Vercel Project Settings.'
  );
}

export const fetchCsrfToken = async () => {
  try {
    const res = await fetch(getApiUrl('/api/auth/csrf'), { credentials: 'include' });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && !contentType.includes('text/html')) {
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

  const response = await fetch(getApiUrl(path), {
    credentials: 'include',
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error(
      'Backend server is unreachable or returned HTML. If running on Vercel, please set the VITE_API_URL environment variable to your backend server URL (e.g. on Render).'
    );
  }

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
