import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, type AuthedRequest } from '../auth';
import { HttpError } from '../http';
import {
  designDocSchema,
  projectCreateSchema,
  projectUpdateSchema,
  versionCreateSchema,
} from '../../shared/validation';
import { validateRoomGeometry } from '../../shared/geometry';
import type { DesignDoc } from '../../shared/types';

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  design: unknown;
  thumbnail: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function designOf(record: { design: unknown }): DesignDoc {
  return record.design as DesignDoc;
}

function summarize(record: ProjectRecord) {
  const design = designOf(record);
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    thumbnail: record.thumbnail,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    itemCount: Array.isArray(design?.placements) ? design.placements.length : 0,
    roomName: design?.room?.name ?? 'Kamer',
    budgetLimit: design?.budget?.limit ?? null,
  };
}

async function assertProductsExist(design: DesignDoc): Promise<void> {
  const ids = [...new Set(design.placements.map((p) => p.productId))];
  if (ids.length === 0) return;
  const found = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const foundIds = new Set(found.map((row) => row.id));
  const missing = ids.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new HttpError(400, `Onbekende producten in het ontwerp: ${missing.join(', ')}`);
  }
}

function parseDesign(input: unknown): DesignDoc {
  const design = designDocSchema.parse(input) as DesignDoc;
  const roomErrors = validateRoomGeometry(design.room);
  if (roomErrors.length > 0) {
    throw new HttpError(400, roomErrors[0], roomErrors);
  }
  return design;
}

projectsRouter.get('/', async (req, res) => {
  const { userId } = req as AuthedRequest;
  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      design: true,
      thumbnail: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json({ projects: projects.map((project) => summarize(project as ProjectRecord)) });
});

projectsRouter.post('/', async (req, res) => {
  const { userId } = req as AuthedRequest;
  const input = projectCreateSchema.parse(req.body);
  const design = parseDesign(input.design);
  await assertProductsExist(design);
  const project = await prisma.project.create({
    data: {
      userId: userId as string,
      name: input.name,
      description: input.description ?? '',
      design: design as unknown as object,
    },
  });
  res.status(201).json({ project: { ...summarize(project as ProjectRecord), design } });
});

projectsRouter.get('/:id', async (req, res) => {
  const { userId } = req as AuthedRequest;
  const project = await prisma.project.findFirst({ where: { id: req.params.id, userId } });
  if (!project) throw new HttpError(404, 'Project niet gevonden.');
  res.json({
    project: {
      ...summarize(project as ProjectRecord),
      design: designOf(project),
    },
  });
});

projectsRouter.patch('/:id', async (req, res) => {
  const { userId } = req as AuthedRequest;
  const input = projectUpdateSchema.parse(req.body);
  const existing = await prisma.project.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) throw new HttpError(404, 'Project niet gevonden.');

  let design: DesignDoc | undefined;
  if (input.design !== undefined) {
    design = parseDesign(input.design);
    await assertProductsExist(design);
  }

  const project = await prisma.project.update({
    where: { id: existing.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.thumbnail !== undefined ? { thumbnail: input.thumbnail } : {}),
      ...(design ? { design: design as unknown as object } : {}),
    },
  });
  res.json({ project: { ...summarize(project as ProjectRecord), design: designOf(project) } });
});

projectsRouter.delete('/:id', async (req, res) => {
  const { userId } = req as AuthedRequest;
  const existing = await prisma.project.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) throw new HttpError(404, 'Project niet gevonden.');
  await prisma.project.delete({ where: { id: existing.id } });
  res.status(204).end();
});

projectsRouter.post('/:id/duplicate', async (req, res) => {
  const { userId } = req as AuthedRequest;
  const existing = await prisma.project.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) throw new HttpError(404, 'Project niet gevonden.');
  const copy = await prisma.project.create({
    data: {
      userId: userId as string,
      name: `${existing.name} (kopie)`,
      description: existing.description,
      design: existing.design as object,
      thumbnail: existing.thumbnail,
    },
  });
  res.status(201).json({ project: summarize(copy as ProjectRecord) });
});

projectsRouter.get('/:id/versions', async (req, res) => {
  const { userId } = req as AuthedRequest;
  const existing = await prisma.project.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) throw new HttpError(404, 'Project niet gevonden.');
  const versions = await prisma.projectVersion.findMany({
    where: { projectId: existing.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, createdAt: true },
  });
  res.json({
    versions: versions.map((version) => ({
      id: version.id,
      label: version.label,
      createdAt: version.createdAt.toISOString(),
    })),
  });
});

projectsRouter.post('/:id/versions', async (req, res) => {
  const { userId } = req as AuthedRequest;
  const input = versionCreateSchema.parse(req.body);
  const existing = await prisma.project.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) throw new HttpError(404, 'Project niet gevonden.');
  const version = await prisma.projectVersion.create({
    data: { projectId: existing.id, label: input.label, design: existing.design as object },
  });
  res.status(201).json({
    version: { id: version.id, label: version.label, createdAt: version.createdAt.toISOString() },
  });
});

projectsRouter.post('/:id/versions/:versionId/restore', async (req, res) => {
  const { userId } = req as AuthedRequest;
  const existing = await prisma.project.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) throw new HttpError(404, 'Project niet gevonden.');
  const version = await prisma.projectVersion.findFirst({
    where: { id: req.params.versionId, projectId: existing.id },
  });
  if (!version) throw new HttpError(404, 'Versie niet gevonden.');
  const project = await prisma.project.update({
    where: { id: existing.id },
    data: { design: version.design as object },
  });
  res.json({ project: { ...summarize(project as ProjectRecord), design: designOf(project) } });
});
