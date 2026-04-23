const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface FetchOptions extends RequestInit {
  token?: string;
}

export async function api(path: string, options: FetchOptions = {}) {
  const { token, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('cz_token') : null);
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('cz_token');
      localStorage.removeItem('cz_user');
      window.location.href = '/login';
    }
    throw new Error('Sessão expirada');
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || 'Erro na requisição');
  }

  return data;
}

export const apiClient = {
  // Auth
  login: (email: string, password: string) =>
    api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  me: () => api('/api/auth/me'),

  // Dashboard
  getMetrics: () => api('/api/dashboard/metrics'),

  // Radar
  startSearch: (query: string, location: string) =>
    api('/api/radar/search', { method: 'POST', body: JSON.stringify({ query, location }) }),

  getSearchStatus: (jobId: string) => api(`/api/radar/status/${jobId}`),

  getLeads: () => api('/api/radar/leads'),

  // Cofre
  getScripts: () => api('/api/cofre/scripts'),

  getScript: (id: string) => api(`/api/cofre/scripts/${id}`),

  // Forja
  getModules: () => api('/api/forja/modules'),

  updateProgress: (lessonId: string, completed: boolean) =>
    api('/api/forja/progress', { method: 'POST', body: JSON.stringify({ lessonId, completed }) }),

  getProgress: () => api('/api/forja/progress'),

  // QG
  getQGInfo: () => api('/api/qg/info'),
};
