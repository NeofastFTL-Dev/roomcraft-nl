import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../server/generated/prisma/client';
import { DEMO_CATALOG } from '../shared/catalog';
import { createDefaultRoom, newId } from '../shared/geometry';
import { createDesign } from '../shared/design';
import type { DesignDoc, Placement } from '../shared/types';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Start the database with `npm run db:start`.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function seedCatalog(): Promise<void> {
  for (const product of DEMO_CATALOG) {
    const data = {
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      retailerId: product.retailerId,
      retailerName: product.retailerName,
      category: product.category,
      priceCents: Math.round(product.price * 100),
      currency: product.currency,
      widthM: product.dimensions.width,
      depthM: product.dimensions.depth,
      heightM: product.dimensions.height,
      color: product.color,
      materials: product.materials,
      styles: product.styles,
      modelUrl: product.modelUrl,
      imageUrl: product.imageUrl,
      dataSource: product.dataSource,
      externalUrl: product.externalUrl,
      inStock: product.inStock,
      deliveryWeeks: product.deliveryWeeks,
      allowsOverlap: product.allowsOverlap,
      wallMounted: product.wallMounted,
      tags: product.tags,
    };
    await prisma.product.upsert({
      where: { id: product.id },
      create: { id: product.id, ...data },
      update: data,
    });
  }
  console.log(`[seed] ${DEMO_CATALOG.length} demo products upserted`);
}

function demoDesign(): DesignDoc {
  const room = createDefaultRoom(5.2, 4.2, 2.6);
  room.name = 'Woonkamer — voorbeeld';

  const place = (productId: string, x: number, z: number, rotation: number): Placement => {
    const product = DEMO_CATALOG.find((item) => item.id === productId);
    if (!product) throw new Error(`Unknown product ${productId}`);
    return {
      id: newId('plc'),
      productId,
      label: product.name,
      position: { x, z },
      rotation,
      dimensions: { ...product.dimensions },
      elevation: product.wallMounted ? 1.4 : 0,
      color: null,
      material: product.materials[0] ?? null,
      wallId: null,
      locked: false,
    };
  };

  const design = createDesign(room);
  design.budget = { limit: 2500, currency: 'EUR' };
  design.placements = [
    place('demo-bank-neso-3z', 0.6, 2.2, 270),
    place('demo-salontafel-steen', 1.6, 2.2, 90),
    place('demo-vloerkleed-wol-200', 1.65, 2.2, 90),
    place('demo-tv-meubel-lijn-180', 4.86, 2.1, 90),
    place('demo-plant-monstera', 4.6, 3.6, 0),
    place('demo-vloerlamp-poot', 0.6, 3.85, 0),
  ];
  return design;
}

function bedroomDesign(): DesignDoc {
  const room = createDefaultRoom(3.6, 3.2, 2.6);
  room.name = 'Slaapkamer — voorbeeld';
  room.wallColor = '#d9c7b8';
  room.floor = { finish: 'laminate-light', color: '#cfae86' };

  const place = (productId: string, x: number, z: number, rotation: number): Placement => {
    const product = DEMO_CATALOG.find((item) => item.id === productId);
    if (!product) throw new Error(`Unknown product ${productId}`);
    return {
      id: newId('plc'),
      productId,
      label: product.name,
      position: { x, z },
      rotation,
      dimensions: { ...product.dimensions },
      elevation: product.wallMounted ? 1.4 : 0,
      color: null,
      material: product.materials[0] ?? null,
      wallId: null,
      locked: false,
    };
  };

  const design = createDesign(room);
  design.budget = { limit: 1800, currency: 'EUR' };
  design.placements = [
    place('demo-bed-nordic-160', 1.15, 1.9, 270),
    place('demo-kledingkast-ward-180', 2.9, 1.3, 90),
    place('demo-ladekast-klein-80', 2.5, 0.55, 0),
  ];
  return design;
}

async function seedDemoUser(): Promise<void> {
  const email = 'demo@roomcraft.nl';
  const password = 'Roomcraft123!';
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: 'Demo gebruiker', passwordHash },
    update: {},
  });

  const existing = await prisma.project.findFirst({ where: { userId: user.id } });
  if (existing) {
    console.log('[seed] demo user already has projects, skipping sample projects');
    return;
  }

  const living = await prisma.project.create({
    data: {
      userId: user.id,
      name: 'Woonkamer Amsterdam',
      description: 'Voorbeeldproject met een complete woonkamerindeling.',
      design: demoDesign() as unknown as object,
    },
  });
  await prisma.projectVersion.create({
    data: {
      projectId: living.id,
      label: 'Eerste opzet',
      design: demoDesign() as unknown as object,
    },
  });
  await prisma.project.create({
    data: {
      userId: user.id,
      name: 'Slaapkamer Utrecht',
      description: 'Compacte slaapkamer met bed, kast en ladekast.',
      design: bedroomDesign() as unknown as object,
    },
  });

  console.log(`[seed] demo account ${email} / ${password} with 2 projects`);
}

async function main(): Promise<void> {
  await seedCatalog();
  await seedDemoUser();
}

main()
  .catch((error) => {
    console.error('[seed] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
