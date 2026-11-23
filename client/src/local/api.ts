/**
 * Offline client for the bundled Android app.
 *
 * The Android APK ships the whole web app; there is no RoomCraft server on the
 * phone. This module implements the same API surface the screens use, backed by
 * IndexedDB on the device and the labelled demo catalog. It is only selected in
 * a build made with `VITE_OFFLINE=1` (see `client/src/api.ts`).
 */
import { DEMO_CATALOG } from '@shared/catalog';
import { newId } from '@shared/geometry';
import { planLayouts } from '@shared/planner';
import { RETAILER_CATALOG_NOTE, RETAILER_DEFINITIONS } from '@shared/retailers';
import type { DesignDoc } from '@shared/types';
import { ApiError } from '@/apiError';
import type {
  ApiClient,
  ProjectDetail,
  ProjectSummary,
  User,
  VersionInfo,
} from '@/api';

const DB_NAME = 'roomcraft-nl';
const DB_VERSION = 1;

interface StoredProject {
  id: string;
  name: string;
  description: string;
  design: DesignDoc;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StoredVersion {
  id: string;
  projectId: string;
  label: string;
  design: DesignDoc;
  createdAt: string;
}

type StoreName = 'projects' | 'versions';

const LOCAL_USER: User = {
  id: 'lokaal',
  name: 'Lokale gebruiker',
  email: 'lokaal@roomcraft.local',
  createdAt: new Date(0).toISOString(),
};

const DEMO_RETAILER = {
  id: 'demo-showroom',
  name: 'RoomCraft Demo Showroom',
  country: 'NL',
  status: 'configured' as const,
  feed: 'none' as const,
  message:
    'Synthetische demo-artikelen met realistische afmetingen. Geen aanbod van een echte winkel en geen live prijzen.',
  docsUrl: null,
  lastSyncAt: null,
  productCount: 0,
};

const DEMO_PRODUCT_COUNT = DEMO_CATALOG.filter((product) => product.dataSource === 'demo').length;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('De opslag van dit apparaat is niet beschikbaar.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('versions')) {
          db.createObjectStore('versions', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Opslag openen mislukt.'));
    });
    // A failed open (private mode, storage full) can be retried on the next call.
    void dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function query<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = action(transaction.objectStore(storeName));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error ?? new Error('Lezen of schrijven mislukt.'));
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('Opslaan op dit apparaat mislukt.'));
      }),
  );
}

function readAll<T>(storeName: StoreName): Promise<T[]> {
  return query<T[]>(storeName, 'readonly', (store) => store.getAll());
}

function readOne<T>(storeName: StoreName, key: string): Promise<T | undefined> {
  return query<T | undefined>(storeName, 'readonly', (store) => store.get(key));
}

function write<T>(storeName: StoreName, value: T): Promise<void> {
  return query<void>(storeName, 'readwrite', (store) => store.put(value));
}

function erase(storeName: StoreName, key: string): Promise<void> {
  return query<void>(storeName, 'readwrite', (store) => store.delete(key));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function now(): string {
  return new Date().toISOString();
}

/** Project summaries, newest edit first, exactly like `GET /api/projects`. */
function summarize(project: StoredProject): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    thumbnail: project.thumbnail,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    itemCount: project.design.placements.length,
    roomName: project.design.room.name || 'Kamer',
    budgetLimit: project.design.budget.limit,
  };
}

function detail(project: StoredProject): ProjectDetail {
  return { ...summarize(project), design: project.design };
}

async function findProject(id: string): Promise<StoredProject> {
  const project = await readOne<StoredProject>('projects', id);
  if (!project) throw new ApiError(404, 'Project niet gevonden.');
  return project;
}

function offlineVersie(): never {
  throw new ApiError(
    409,
    'Deze app werkt zonder server. Een winkel koppelen kan alleen in de desktopversie of op een RoomCraft-server.',
  );
}

const offlineRetailer = (definition: (typeof RETAILER_DEFINITIONS)[number]) => ({
  id: definition.id,
  name: definition.name,
  country: 'NL',
  status: 'not_configured' as const,
  feed: definition.feed,
  message: `${RETAILER_CATALOG_NOTE} Deze app werkt offline op dit apparaat en kan geen feed koppelen.`,
  docsUrl: definition.docsUrl,
  lastSyncAt: null,
  productCount: 0,
});

export const localApi: ApiClient = {
  // The bundled app is single-user, like the desktop build: no login screen.
  me: async () => ({ user: LOCAL_USER, desktop: true }),

  login: () =>
    Promise.reject(new ApiError(403, 'Deze app werkt zonder account; je ontwerpen staan op dit apparaat.')),
  register: () =>
    Promise.reject(new ApiError(403, 'Deze app werkt zonder account; je ontwerpen staan op dit apparaat.')),
  logout: async () => ({ ok: true as const }),

  listProjects: async () => {
    const projects = await readAll<StoredProject>('projects');
    projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { projects: projects.map(summarize) };
  },

  getProject: async (id) => ({ project: detail(await findProject(id)) }),

  createProject: async (body) => {
    const timestamp = now();
    const project: StoredProject = {
      id: newId('prj'),
      name: body.name,
      description: body.description ?? '',
      design: clone(body.design),
      thumbnail: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await write('projects', project);
    return { project: detail(project) };
  },

  updateProject: async (id, body) => {
    const existing = await findProject(id);
    const updated: StoredProject = {
      ...existing,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.design !== undefined ? { design: clone(body.design) } : {}),
      ...(body.thumbnail !== undefined ? { thumbnail: body.thumbnail } : {}),
      updatedAt: now(),
    };
    await write('projects', updated);
    return { project: detail(updated) };
  },

  deleteProject: async (id) => {
    await findProject(id);
    const versions = await readAll<StoredVersion>('versions');
    for (const version of versions) {
      if (version.projectId === id) await erase('versions', version.id);
    }
    await erase('projects', id);
  },

  duplicateProject: async (id) => {
    const existing = await findProject(id);
    const timestamp = now();
    const copy: StoredProject = {
      ...existing,
      id: newId('prj'),
      name: `${existing.name} (kopie)`,
      design: clone(existing.design),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await write('projects', copy);
    return { project: summarize(copy) };
  },

  listVersions: async (id) => {
    await findProject(id);
    const versions = (await readAll<StoredVersion>('versions'))
      .filter((version) => version.projectId === id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const result: VersionInfo[] = versions.map((version) => ({
      id: version.id,
      label: version.label,
      createdAt: version.createdAt,
    }));
    return { versions: result };
  },

  createVersion: async (id, label) => {
    const project = await findProject(id);
    const version: StoredVersion = {
      id: newId('ver'),
      projectId: id,
      label,
      design: clone(project.design),
      createdAt: now(),
    };
    await write('versions', version);
    return { version: { id: version.id, label: version.label, createdAt: version.createdAt } };
  },

  restoreVersion: async (id, versionId) => {
    const project = await findProject(id);
    const version = await readOne<StoredVersion>('versions', versionId);
    if (!version || version.projectId !== id) throw new ApiError(404, 'Versie niet gevonden.');
    const updated: StoredProject = {
      ...project,
      design: clone(version.design),
      updatedAt: now(),
    };
    await write('projects', updated);
    return { project: detail(updated) };
  },

  catalog: async (params = {}) => {
    const term = String(params.search ?? '').trim().toLowerCase();
    const category = String(params.category ?? '');
    const retailerId = String(params.retailerId ?? '');
    const style = String(params.style ?? '');
    const maxPrice =
      params.maxPrice === undefined || params.maxPrice === '' ? null : Number(params.maxPrice);
    const requestedLimit = Number(params.limit ?? 120);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 120;

    const products = DEMO_CATALOG.filter((product) => {
      if (category && product.category !== category) return false;
      if (retailerId && product.retailerId !== retailerId) return false;
      if (style && !product.styles.includes(style)) return false;
      if (maxPrice !== null && Number.isFinite(maxPrice) && product.price > maxPrice) return false;
      if (!term) return true;
      return (
        product.name.toLowerCase().includes(term) ||
        product.brand.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term)
      );
    }).slice(0, limit);

    return { products: clone(products) };
  },

  facets: async () => {
    const counts = new Map<string, number>();
    for (const product of DEMO_CATALOG) {
      counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    }
    const retailers = [
      { ...DEMO_RETAILER, productCount: DEMO_PRODUCT_COUNT },
      ...RETAILER_DEFINITIONS.map(offlineRetailer),
    ];
    return {
      categories: [...counts.entries()].map(([category, count]) => ({ category, count })),
      retailers,
      retailersAvailable: RETAILER_DEFINITIONS.length,
    };
  },

  retailers: async () => ({
    retailers: [
      { ...DEMO_RETAILER, productCount: DEMO_PRODUCT_COUNT },
      ...RETAILER_DEFINITIONS.map(offlineRetailer),
    ],
  }),

  syncRetailer: async () => offlineVersie(),

  suggest: async (body) => {
    const products = DEMO_CATALOG.filter(
      (product) =>
        body.brief.retailerIds.length === 0 || body.brief.retailerIds.includes(product.retailerId),
    );
    if (products.length === 0) {
      throw new ApiError(422, 'Geen producten beschikbaar voor deze selectie.');
    }
    return {
      engine: 'roomcraft-rule-based-v1',
      generatedAt: now(),
      proposals: planLayouts({
        room: body.design.room,
        products: clone(products),
        brief: body.brief,
      }),
    };
  },
};
