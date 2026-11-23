import type {
  DesignBrief,
  DesignDoc,
  LayoutProposal,
  Product,
  RetailerStatus,
} from '@shared/types';
import { localApi } from '@/local/api';
import { ApiError } from './apiError';

export { ApiError };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: init.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Verzoek mislukt (${response.status}).`;
    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  roomName: string;
  budgetLimit: number | null;
}

export interface ProjectDetail extends ProjectSummary {
  design: DesignDoc;
}

export interface VersionInfo {
  id: string;
  label: string;
  createdAt: string;
}

export interface ProposalResponse {
  engine: string;
  generatedAt: string;
  proposals: LayoutProposal[];
}

const remoteApi = {
  me: () => request<{ user: User | null; desktop?: boolean }>('/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (name: string, email: string, password: string) =>
    request<{ user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  listProjects: () => request<{ projects: ProjectSummary[] }>('/projects'),
  getProject: (id: string) => request<{ project: ProjectDetail }>(`/projects/${id}`),
  createProject: (body: { name: string; description?: string; design: DesignDoc }) =>
    request<{ project: ProjectDetail }>('/projects', { method: 'POST', body: JSON.stringify(body) }),
  updateProject: (
    id: string,
    body: { name?: string; description?: string; design?: DesignDoc; thumbnail?: string | null },
  ) => request<{ project: ProjectDetail }>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  duplicateProject: (id: string) =>
    request<{ project: ProjectSummary }>(`/projects/${id}/duplicate`, { method: 'POST' }),

  listVersions: (id: string) => request<{ versions: VersionInfo[] }>(`/projects/${id}/versions`),
  createVersion: (id: string, label: string) =>
    request<{ version: VersionInfo }>(`/projects/${id}/versions`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),
  restoreVersion: (id: string, versionId: string) =>
    request<{ project: ProjectDetail }>(`/projects/${id}/versions/${versionId}/restore`, {
      method: 'POST',
    }),

  catalog: (params: Record<string, string | number | undefined> = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query.set(key, String(value));
    }
    return request<{ products: Product[] }>(`/catalog?${query.toString()}`);
  },
  facets: () =>
    request<{
      categories: { category: string; count: number }[];
      retailers: RetailerStatus[];
      retailersAvailable: number;
    }>('/catalog/facets'),
  retailers: () => request<{ retailers: RetailerStatus[] }>('/retailers'),
  syncRetailer: (id: string) =>
    request<{ imported: number; retailer: RetailerStatus }>(`/retailers/${id}/sync`, { method: 'POST' }),

  suggest: (body: { design: DesignDoc; brief: DesignBrief }) =>
    request<ProposalResponse>('/ai/suggest', { method: 'POST', body: JSON.stringify(body) }),
};

export type ApiClient = typeof remoteApi;

/**
 * The bundled Android app has no server: `VITE_OFFLINE=1` swaps the HTTP client
 * for the on-device store. Every other build keeps using the Express API.
 */
export const api: ApiClient = import.meta.env.VITE_OFFLINE === '1' ? localApi : remoteApi;
