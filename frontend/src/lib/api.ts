/**
 * api.ts - Frontend API Client
 * MovieAnimation - Phase 2 Auth
 * 
 * Handles communication with the MovieAnimation backend API.
 * Auto-attaches JWT tokens from localStorage.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  details?: Array<{ field: string; message: string }>;
}

/**
 * Make an authenticated API request
 */
async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Attach auth token if available
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    let data: any;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: data?.error || response.statusText,
        details: data?.details,
      };
    }

    return {
      ok: true,
      status: response.status,
      data: data as T,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      error: err.message || 'Network error — is the backend running?',
    };
  }
}

// ─── Auth Endpoints ──────────────────────────────────────────────

export interface RegisterParams {
  name: string;
  email: string;
  password: string;
}

export interface LoginParams {
  email: string;
  password: string;
}

export interface AuthResult {
  message: string;
  user: {
    id: number;
    name: string;
    email: string;
    created_at: string;
  };
  tokens: {
    accessToken: string;
    expiresIn: string;
  };
}

export interface DashboardData {
  user: {
    id: number;
    name: string;
    email: string;
    joinedAt: string;
  };
  stats: {
    scriptsUploaded: number;
    animationsGenerated: number;
    storageUsed: string;
    creditsRemaining: number;
    activeJobs: number;
  };
  recentActivity: Array<{
    type: string;
    description: string;
    date: string;
  }>;
}

export async function registerUser(params: RegisterParams) {
  return apiRequest<AuthResult>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function loginUser(params: LoginParams) {
  return apiRequest<AuthResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getCurrentUser() {
  return apiRequest<{ user: AuthResult['user'] }>('/auth/me');
}

export async function updateProfile(params: { name?: string; email?: string }) {
  return apiRequest<{ message: string; user: AuthResult['user'] }>('/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(params),
  });
}

export async function deleteAccount() {
  return apiRequest<{ message: string }>('/auth/account', {
    method: 'DELETE',
  });
}

export async function getDashboard() {
  return apiRequest<DashboardData>('/users/dashboard');
}

// ─── Token Management ───────────────────────────────────────────

const TOKEN_KEY = 'movieanimation_token';
const USER_KEY = 'movieanimation_user';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function storeAuth(result: AuthResult): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, result.tokens.accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(result.user));
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): AuthResult['user'] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getStoredToken();
}

export { API_BASE_URL };
