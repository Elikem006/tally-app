import axios from 'axios';

const BASE_URL = 'http://172.20.10.4:8082';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const authAPI = {
  register: (name: string, email: string, password: string) =>
    api.post('/api/auth/register', { name, email, password }),

  login: (email: string, password: string) =>
    api.post('/api/auth/login', { email, password }),
};

export default api;