import type { CapturedPage } from './camera';

export type AuthUser = {
  email: string;
  name?: string;
  picture?: string;
};

export type AuthState =
  | { authenticated: false }
  | { authenticated: true; user: AuthUser; apoloFolderResolved: boolean };

export type FoldersResponse = {
  apoloFolderId: string;
  folders: { id: string; name: string }[];
  cached: boolean;
};

export async function fetchAuthState(): Promise<AuthState> {
  const response = await fetch('/api/auth/me', { credentials: 'include' });
  if (response.status === 401) return { authenticated: false };
  if (!response.ok) throw new Error(`auth_check_failed:${response.status}`);
  return (await response.json()) as AuthState;
}

export async function fetchFolders(reload = false): Promise<FoldersResponse> {
  const url = reload ? '/api/folders?reload=1' : '/api/folders';
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    let body: AnalyzeError = { error: 'http_error', message: `HTTP ${response.status}` };
    try { body = await response.json(); } catch { /* ignore */ }
    throw new ApiError(response.status, body);
  }
  return (await response.json()) as FoldersResponse;
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}

export type AnalyzeResult = {
  patient_name: string;
  document_type: 'guia_internacao' | 'descricao_cirurgica' | null;
  confidence_name: number;
  confidence_type: number;
  error: 'not_recognized' | 'multiple_documents' | null;
  elapsedMs: number;
};

export type AnalyzeError = {
  error: string;
  message?: string;
  details?: string[];
};

const API_BASE = import.meta.env.DEV ? '' : '';

export async function analyzePages(pages: CapturedPage[]): Promise<AnalyzeResult> {
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: pages.map((p) => p.dataUrl) }),
  });

  if (!response.ok) {
    let body: AnalyzeError;
    try {
      body = await response.json();
    } catch {
      body = { error: 'http_error', message: `HTTP ${response.status}` };
    }
    throw new ApiError(response.status, body);
  }

  return (await response.json()) as AnalyzeResult;
}

export class ApiError extends Error {
  status: number;
  body: AnalyzeError;
  constructor(status: number, body: AnalyzeError) {
    super(body.message || body.error);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export function formatDocumentType(type: AnalyzeResult['document_type']): string {
  if (type === 'guia_internacao') return 'Guia de internação';
  if (type === 'descricao_cirurgica') return 'Descrição cirúrgica';
  return 'Não identificado';
}

export function confidenceLabel(value: number): { label: string; tone: 'high' | 'medium' | 'low' } {
  if (value >= 0.95) return { label: 'Alta', tone: 'high' };
  if (value >= 0.75) return { label: 'Média', tone: 'medium' };
  return { label: 'Baixa', tone: 'low' };
}
