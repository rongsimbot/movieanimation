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

// ─── Phase 3: Script Endpoints ──────────────────────────────────

export interface Script {
  id: number;
  script_title: string;
  script_content: string;
  version: string;
  author: string | null;
  genre: string | null;
  word_count: number | null;
  status: 'draft' | 'review' | 'approved' | 'archived';
  created_at: string;
  last_modified: string;
  animation_id: number | null;
}

export interface ScriptParseResult {
  message: string;
  usedAI: boolean;
  animationId: number;
  script: Script;
  characters: Array<{
    id: number;
    character_name: string;
    character_type: string;
    description: string;
  }>;
  scenesCount: number;
  chaptersCount: number;
}

export interface ScriptBreakdown {
  script: Script;
  parsed: boolean;
  animationId?: number;
  chapters: Array<{
    id: number;
    chapter_number: number;
    chapter_title: string;
    content_summary: string;
  }>;
  scenes: Array<{
    id: number;
    chapter_id: number;
    scene_number: number;
    scene_title: string;
    description: string;
    duration_seconds: number;
    location: string;
  }>;
  characters: Array<{
    id: number;
    character_name: string;
    character_type: string;
    description: string;
    image_url: string | null;
  }>;
}

export async function createScript(data: {
  script_title: string;
  script_content: string;
  genre?: string;
  source_filename?: string;
}) {
  return apiRequest<{ message: string; script: Script }>('/scripts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listScripts(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiRequest<{ scripts: Script[]; total: number }>(`/scripts${qs ? '?' + qs : ''}`);
}

export async function getScript(id: number) {
  return apiRequest<{ script: Script }>(`/scripts/${id}`);
}

export async function updateScript(id: number, data: {
  script_title?: string;
  script_content?: string;
  genre?: string;
  status?: string;
}) {
  return apiRequest<{ message: string; script: Script }>(`/scripts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteScript(id: number) {
  return apiRequest<{ message: string }>(`/scripts/${id}`, {
    method: 'DELETE',
  });
}

export async function parseScript(id: number) {
  return apiRequest<ScriptParseResult>(`/scripts/${id}/parse`, {
    method: 'POST',
  });
}

export async function getScriptBreakdown(id: number) {
  return apiRequest<ScriptBreakdown>(`/scripts/${id}/breakdown`);
}

// ─── Phase 3: Character Endpoints ───────────────────────────────

export interface Character {
  id: number;
  character_name: string;
  character_type: string | null;
  description: string | null;
  appearance_notes: string | null;
  voice_notes: string | null;
  image_url: string | null;
  created_at: string;
  last_modified: string;
}

export async function listCharacters(search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiRequest<{ characters: Character[] }>(`/characters${query}`);
}

export async function getCharacter(id: number) {
  return apiRequest<{ character: Character }>(`/characters/${id}`);
}

export async function updateCharacter(id: number, data: {
  character_name?: string;
  character_type?: string;
  description?: string;
  appearance_notes?: string;
  image_url?: string;
}) {
  return apiRequest<{ message: string; character: Character }>(`/characters/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function assignImageToCharacter(characterId: number, assetId: number) {
  return apiRequest<{ message: string; character: Character }>(`/characters/${characterId}/assign-image`, {
    method: 'POST',
    body: JSON.stringify({ asset_id: assetId }),
  });
}

// ─── Phase 3: Asset Endpoints ───────────────────────────────────

export interface Asset {
  id: number;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  asset_type: string;
  character_id: number | null;
  created_at: string;
  url: string;
  fileSizeFormatted: string;
}

export interface AssetStats {
  totalAssets: number;
  totalSize: number;
  characterPhotos: number;
  props: number;
  backgrounds: number;
}

export async function uploadAssets(formData: FormData) {
  const token = getStoredToken();
  const url = `${API_BASE_URL}/assets/upload`;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });
    const data = await response.json();
    return {
      ok: response.ok,
      status: response.status,
      data,
      error: !response.ok ? data?.error : undefined,
    };
  } catch (err: any) {
    return { ok: false, status: 0, error: err.message };
  }
}

export async function uploadAssetBase64(data: {
  file_name: string;
  file_data: string;
  mime_type?: string;
  asset_type?: string;
  character_id?: number;
}) {
  return apiRequest<{ message: string; asset: Asset }>('/assets/upload-base64', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listAssets(params?: {
  asset_type?: string;
  character_id?: number;
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams();
  if (params?.asset_type) query.set('asset_type', params.asset_type);
  if (params?.character_id) query.set('character_id', String(params.character_id));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiRequest<{ assets: Asset[]; stats: AssetStats }>(`/assets${qs ? '?' + qs : ''}`);
}

export async function deleteAsset(id: number) {
  return apiRequest<{ message: string }>(`/assets/${id}`, {
    method: 'DELETE',
  });
}

export function getAssetUrl(assetId: number): string {
  return `${API_BASE_URL}/assets/${assetId}/file`;
}

export { API_BASE_URL };
