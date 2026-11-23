import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { createDesign } from '@shared/design';

const THUMBNAIL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** A fresh module instance, the way a page reload or app restart starts anew. */
async function appAfterReload() {
  vi.resetModules();
  const { localApi } = await import('@/local/api');
  return localApi;
}

type PutFn = (this: IDBObjectStore, value: unknown, key?: IDBValidKey) => IDBRequest<IDBValidKey>;

it('meldt opslaan pas als de IndexedDB-transactie is gecommit', async () => {
  const api = await appAfterReload();
  const store = IDBObjectStore.prototype as unknown as { put: PutFn };
  const originalPut = store.put;

  // Abort the transaction after the write request succeeds, but before it can
  // commit. Resolving on the request instead of the commit hides this failure.
  store.put = function (value, key) {
    const request = originalPut.call(this, value, key);
    request.addEventListener('success', () => this.transaction.abort());
    return request;
  };

  try {
    await expect(
      api.createProject({ name: `commit-check-${Date.now()}`, design: createDesign() }),
    ).rejects.toThrow();
  } finally {
    store.put = originalPut;
  }
});

it('bewaart projecten, versies en thumbnails over een herstart', async () => {
  const name = `duurzaam-${Date.now()}`;
  const first = await appAfterReload();
  const created = await first.createProject({
    name,
    description: 'Blijft staan na herladen',
    design: createDesign(),
  });
  await first.updateProject(created.project.id, { thumbnail: THUMBNAIL });
  const version = await first.createVersion(created.project.id, 'Momentopname');

  // Reload/restart: a new app instance reads the same on-device database.
  const restarted = await appAfterReload();

  const projects = await restarted.listProjects();
  const summary = projects.projects.find((project) => project.id === created.project.id);
  expect(summary?.name).toBe(name);
  expect(summary?.thumbnail).toBe(THUMBNAIL);

  const detail = await restarted.getProject(created.project.id);
  expect(detail.project.design.room.walls.length).toBeGreaterThan(0);

  const versions = await restarted.listVersions(created.project.id);
  expect(versions.versions.map((entry) => entry.id)).toContain(version.version.id);
});
