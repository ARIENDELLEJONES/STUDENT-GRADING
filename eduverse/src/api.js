const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('eduverse_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  return res.json();
}

export const api = {
  get: (endpoint) => request(endpoint),
  post: (endpoint, data) => request(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  put: (endpoint, data) => request(endpoint, { method: 'PUT', body: JSON.stringify(data) }),
  del: (endpoint) => request(endpoint, { method: 'DELETE' }),
};

export function setToken(token) {
  if (token) localStorage.setItem('eduverse_token', token);
  else localStorage.removeItem('eduverse_token');
}

export function getToken() {
  return localStorage.getItem('eduverse_token');
}

export function setUser(user) {
  if (user) localStorage.setItem('eduverse_user', JSON.stringify(user));
  else localStorage.removeItem('eduverse_user');
}

export function getUser() {
  try { return JSON.parse(localStorage.getItem('eduverse_user')); } catch { return null; }
}

export function logout() {
  api.post('/auth/logout');
  localStorage.removeItem('eduverse_token');
  localStorage.removeItem('eduverse_user');
  localStorage.removeItem('eduverse_mode');
}
