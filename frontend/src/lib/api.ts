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

export interface ScriptFileUploadResult {
  message: string;
  fileName: string;
  wordCount: number;
  suggestedTitle: string;
  detectedGenre: string;
  extractedText: string;
}

export async function uploadScriptFile(file: File): Promise<ApiResponse<ScriptFileUploadResult>> {
  const token = getStoredToken();
  const url = `${API_BASE_URL}/scripts/upload-file`;
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await response.json();
    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? data : undefined,
      error: !response.ok ? data?.error : undefined,
    };
  } catch (err: any) {
    return { ok: false, status: 0, error: err.message };
  }
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

export async function deleteCharacter(id: number) {
  return apiRequest<{ message: string }>(`/characters/${id}`, {
    method: 'DELETE',
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

export async function updateAsset(id: number, data: {
  asset_type?: string;
  character_id?: number | null;
  animation_id?: number | null;
  metadata?: Record<string, any>;
  file_name?: string;
}) {
  return apiRequest<{ message: string; asset: Asset }>(`/assets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function getAssetUrl(assetId: number): string {
  return `${API_BASE_URL}/assets/${assetId}/file`;
}

// ─── Phase 7: Timeline & Assembly Endpoints ─────────────────────

export interface TimelineData {
  id: number;
  project_id: number;
  animation_id: number | null;
  name: string;
  status: 'draft' | 'assembling' | 'completed' | 'failed';
  total_duration_seconds: number;
  output_path: string | null;
  output_size_bytes: number | null;
  output_resolution: string;
  assembly_started_at: string | null;
  assembly_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineClipData {
  id: number;
  timeline_id: number;
  scene_id: number | null;
  clip_source: string | null;
  clip_order: number;
  label: string | null;
  duration_seconds: number | null;
  trim_start_seconds: number;
  trim_end_seconds: number | null;
  volume: number;
  transition_type: 'cut' | 'fade' | 'dissolve' | 'wipe';
  transition_duration_ms: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface TimelineWithClips extends TimelineData {
  clips: TimelineClipData[];
}

export interface AssemblyJobResult {
  jobId: string;
  timelineId: number;
  status: string;
  outputPath: string;
  clipCount: number;
  estimatedDuration: number;
}

export async function createTimeline(data: {
  project_id: number;
  name?: string;
  animation_id?: number;
  output_resolution?: string;
}) {
  return apiRequest<{ timeline: TimelineData }>('/timelines', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getTimelines(projectId: number) {
  return apiRequest<{ timelines: TimelineData[] }>(`/timelines/project/${projectId}`);
}

export async function getTimeline(id: number) {
  return apiRequest<{ timeline: TimelineWithClips }>(`/timelines/${id}`);
}

export async function deleteTimeline(id: number) {
  return apiRequest<{ message: string }>(`/timelines/${id}`, { method: 'DELETE' });
}

export async function addClipToTimeline(timelineId: number, data: {
  scene_id?: number;
  clip_source?: string;
  clip_order: number;
  label?: string;
  duration_seconds?: number;
  transition_type?: string;
  transition_duration_ms?: number;
}) {
  return apiRequest<{ clip: TimelineClipData }>(`/timelines/${timelineId}/clips`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateClip(timelineId: number, clipId: number, data: any) {
  return apiRequest<{ clip: TimelineClipData }>(`/timelines/${timelineId}/clips/${clipId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function removeClip(timelineId: number, clipId: number) {
  return apiRequest<{ message: string }>(`/timelines/${timelineId}/clips/${clipId}`, {
    method: 'DELETE',
  });
}

export async function reorderClips(timelineId: number, order: Array<{ id: number; clip_order: number }>) {
  return apiRequest<{ clips: TimelineClipData[] }>(`/timelines/${timelineId}/clips/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ order }),
  });
}

export async function bulkSetClips(timelineId: number, clips: any[]) {
  return apiRequest<{ clips: TimelineClipData[] }>(`/timelines/${timelineId}/clips/bulk`, {
    method: 'PUT',
    body: JSON.stringify({ clips }),
  });
}

export async function startAssembly(timelineId: number) {
  return apiRequest<AssemblyJobResult>(`/timelines/${timelineId}/assemble`, {
    method: 'POST',
  });
}

export async function getAssemblyStatus(timelineId: number) {
  return apiRequest<{ timelineId: number; timelineStatus: string; latestLog: any }>(`/timelines/${timelineId}/assembly-status`);
}

// ─── Phase 11: Analytics ─────────────────────────────────────────

export interface UsageStats {
  totalUsers: number;
  activeUsersToday: number;
  activeUsersThisMonth: number;
  totalProjects: number;
  projectsCreatedToday: number;
  totalVideoGenerations: number;
  videoGenerationsToday: number;
  totalApiCalls: number;
  apiCallsToday: number;
  averageSessionTime: number;
}

export interface CostMetrics {
  totalSpent: number;
  spentToday: number;
  spentThisMonth: number;
  byProvider: Record<string, number>;
  byProject: Array<{ projectId: number; projectTitle: string; cost: number }>;
  projectedMonthly: number;
}

export interface DAUTrend {
  date: string;
  count: number;
}

export async function getUsageStats() {
  return apiRequest<UsageStats>('/analytics/usage');
}

export async function getCostMetrics() {
  return apiRequest<CostMetrics>('/analytics/costs');
}

export async function getDAUTrend(days: number = 7) {
  return apiRequest<DAUTrend[]>(`/analytics/dau?days=${days}`);
}

export async function getTopEndpoints(days: number = 7) {
  return apiRequest<Array<{ endpoint: string; count: number }>>(`/analytics/endpoints?days=${days}`);
}

export async function trackPageView(page: string, referrer?: string) {
  return apiRequest('/analytics/pageview', {
    method: 'POST',
    body: JSON.stringify({ page, referrer }),
  });
}

export async function trackAnalyticsEvent(eventType: string, metadata?: any) {
  return apiRequest('/analytics/track', {
    method: 'POST',
    body: JSON.stringify({ eventType, metadata }),
  });
}

export { API_BASE_URL };

// ─── Phase 8: Export & Rendering ─────────────────────────────────

export interface ExportRecord {
  id: number;
  name: string;
  resolution: string;
  format: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'expired';
  progress: number;
  duration: number | null;
  durationFormatted: string | null;
  fileSize: number | null;
  fileSizeFormatted: string | null;
  outputFilename: string | null;
  expiresAt: string | null;
  downloadCount: number;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface ExportStats {
  total: number;
  completed: number;
  processing: number;
  failed: number;
  totalStorageBytes: number;
}

export interface ExportDetail extends ExportRecord {
  input_path: string;
  output_path: string | null;
  bitrate: string;
  framerate: number;
  include_audio: boolean;
  compression_level: string;
  job_id: string | null;
  ffmpeg_command: string | null;
  logs: ExportLog[];
  shareLinks: ShareLinkData[];
}

export interface ExportLog {
  id: number;
  export_id: number;
  job_id: string | null;
  status: string;
  progress: number;
  stage: string | null;
  message: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface ShareLinkData {
  id: number;
  shareUrl?: string;
  urlToken: string;
  isActive: boolean;
  downloadCount: number;
  maxDownloads: number | null;
  hasPassword: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface CreateExportParams {
  timeline_id?: number;
  project_id?: number;
  name?: string;
  input_path: string;
  resolution?: '720p' | '1080p' | '4k';
  format?: 'mp4' | 'mov' | 'webm';
  bitrate?: string;
  framerate?: number;
  compression_level?: 'fast' | 'medium' | 'slow';
  expiration_hours?: number;
}

export interface ResolutionOption {
  id: string;
  label: string;
  width: number;
  height: number;
  defaultBitrate: string;
}

export interface FormatOption {
  id: string;
  extension: string;
  mimeType: string;
  videoCodec: string;
  audioCodec: string;
}

export interface ShareLinkCreateResult {
  message: string;
  shareUrl: string;
  share: {
    id: number;
    urlToken: string;
    expiresAt: string;
    maxDownloads: number | null;
    hasPassword: boolean;
  };
}

export interface SharedExportInfo {
  export: {
    id: number;
    name: string;
    resolution: string;
    format: string;
    durationFormatted: string | null;
    fileSizeFormatted: string | null;
    createdAt: string;
  };
  share: {
    expiresAt: string;
    downloadCount: number;
    maxDownloads: number | null;
    hasPassword: boolean;
  };
}

// Create a new export

export async function createExport(params: CreateExportParams) {
  return apiRequest<{ message: string; export: ExportRecord; jobId: string }>('/exports', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// List user's exports

export async function listExports(params?: { timeline_id?: number; limit?: number; offset?: number }) {
  const query = new URLSearchParams();
  if (params?.timeline_id) query.set('timeline_id', String(params.timeline_id));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiRequest<{ exports: ExportRecord[]; stats: ExportStats }>(`/exports${qs ? '?' + qs : ''}`);
}

// Get export details

export async function getExport(id: number) {
  return apiRequest<{ export: ExportDetail }>(`/exports/${id}`);
}

// Delete an export

export async function deleteExport(id: number) {
  return apiRequest<{ message: string }>(`/exports/${id}`, { method: 'DELETE' });
}

// Get export download URL

export function getExportDownloadUrl(exportId: number): string {
  return `${API_BASE_URL}/exports/${exportId}/download`;
}

// Create a share link for an export

export async function createShareLink(exportId: number, options?: {
  max_downloads?: number;
  password?: string;
  expiration_hours?: number;
}) {
  return apiRequest<ShareLinkCreateResult>(`/exports/${exportId}/share`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
  });
}

// Get share links for an export

export async function getShareLinks(exportId: number) {
  return apiRequest<{ links: ShareLinkData[] }>(`/exports/${exportId}/shares`);
}

// Revoke a share link

export async function revokeShareLink(exportId: number, token: string) {
  return apiRequest<{ message: string }>(`/exports/${exportId}/shares/${token}`, { method: 'DELETE' });
}

// Get resolution/format options

export async function getExportOptions() {
  return apiRequest<{ resolutions: ResolutionOption[]; formats: FormatOption[] }>('/exports/options');
}

// Get export queue status

export async function getExportQueueStatus() {
  return apiRequest<{ queue: { waiting: number; active: number; completed: number; failed: number; delayed: number } }>('/exports/queue/status');
}

// Access shared export (public)

export async function accessSharedExport(token: string) {
  return apiRequest<SharedExportInfo>(`/exports/share/${token}`);
}

// Download shared export (public)
// Returns a URL for direct download

export function getSharedDownloadUrl(token: string, password?: string): string {
  const base = `${API_BASE_URL}/exports/share/${token}/download`;
  return password ? `${base}?password=${encodeURIComponent(password)}` : base;
}
