import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

async function loginWithDemo(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Inloggen met demo-account' }).click();
  await expect(page.getByRole('heading', { name: 'Je interieurprojecten' })).toBeVisible();
}

/** Removes the throwaway project so repeated runs keep the demo account tidy. */
async function deleteCurrentProject(page: import('@playwright/test').Page): Promise<void> {
  const match = page.url().match(/#\/project\/([^/?]+)/);
  if (!match) return;
  const response = await page.request.delete(`/api/projects/${match[1]}`);
  expect(response.status()).toBe(204);
}

async function createProject(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '+ Nieuw ontwerp' }).click();
  await page.getByLabel('Naam').fill(name);
  await page.getByRole('button', { name: 'Ontwerp aanmaken' }).click();
  await expect(page.getByRole('tab', { name: 'Catalogus' })).toBeVisible();
}

test('project aanmaken, meubel plaatsen, ongedaan maken, opslaan en exporteren', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await loginWithDemo(page);
  await createProject(page, `E2E woonkamer ${Date.now()}`);

  const statusbar = page.locator('.statusbar');
  await expect(statusbar).toContainText('0 meubels');
  await expect(page.locator('#roomcraft-2d canvas').first()).toBeVisible();
  await expect(page.locator('#roomcraft-3d canvas').first()).toBeVisible();

  // Place a sofa from the demo catalog.
  await page.getByRole('textbox', { name: 'Producten zoeken' }).fill('Bank Neso 3');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Plaatsen', exact: true }).click();
  await expect(statusbar).toContainText('1 meubels');

  // Undo and redo are real history operations.
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(statusbar).toContainText('0 meubels');
  await page.getByRole('button', { name: 'Opnieuw' }).click();
  await expect(statusbar).toContainText('1 meubels');

  // Save, then reload to prove persistence through PostgreSQL.
  await page.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Project opgeslagen.');
  await page.reload();
  await expect(page.locator('.statusbar')).toContainText('1 meubels');

  // The budget panel knows the item; clicking the line selects it in 2D and 3D.
  await page.getByRole('tab', { name: 'Budget' }).click();
  await page.getByText('Bank Neso 3-zits').first().click();
  await page.getByRole('tab', { name: /Meubel/ }).click();
  await expect(page.getByText('Afmetingen komen uit de productdata')).toBeVisible();

  // Export the project as JSON and the plan as a composed PNG.
  await page.getByRole('tab', { name: 'Project' }).click();
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Ontwerp als JSON', exact: true }).click();
  expect((await jsonDownload).suggestedFilename()).toMatch(/\.json$/);

  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Plattegrond als PNG' }).click();
  expect((await pngDownload).suggestedFilename()).toMatch(/-2d\.png$/);

  expect(pageErrors).toEqual([]);
  await deleteCurrentProject(page);
});

test('exporteert en importeert een ontwerp (round-trip)', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('dialog', (dialog) => void dialog.accept());

  await loginWithDemo(page);
  await createProject(page, `E2E import ${Date.now()}`);

  const statusbar = page.locator('.statusbar');
  await page.getByRole('textbox', { name: 'Producten zoeken' }).fill('Bank Neso 3');
  await page.getByRole('button', { name: 'Plaatsen', exact: true }).click();
  await expect(statusbar).toContainText('1 meubels');

  // Export the design and keep the downloaded file.
  await page.getByRole('tab', { name: 'Project' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Ontwerp als JSON', exact: true }).click();
  const jsonPath = await (await download).path();
  expect(jsonPath).toBeTruthy();
  const exported = JSON.parse(readFileSync(jsonPath as string, 'utf8')) as {
    name: string;
    design: { placements: { productId: string }[] };
  };
  expect(exported.design.placements).toHaveLength(1);

  // Remove the sofa, then restore it by importing the exported file.
  await page.getByRole('tab', { name: 'Budget' }).click();
  await page.getByText('Bank Neso 3-zits').first().click();
  await page.keyboard.press('Delete');
  await expect(statusbar).toContainText('0 meubels');

  await page.getByRole('tab', { name: 'Project' }).click();
  const fileInput = page.getByLabel('Ontwerpbestand kiezen');
  await fileInput.setInputFiles(jsonPath as string);
  await expect(statusbar).toContainText('1 meubels');
  await expect(page.getByRole('status')).toContainText('Ontwerp geïmporteerd');

  // A design that references unknown products is rejected with a clear message.
  const unknown = structuredClone(exported) as typeof exported & { app?: string };
  for (const placement of unknown.design.placements) placement.productId = 'bestaat-niet-42';
  const unknownPath = testInfo.outputPath('onbekend-product.json');
  writeFileSync(unknownPath, JSON.stringify(unknown, null, 2));
  await fileInput.setInputFiles(unknownPath);
  await expect(page.getByRole('status')).toContainText(
    "Onbekende product-ID's: bestaat-niet-42",
  );
  await expect(statusbar).toContainText('1 meubels');

  // Structurally invalid files are rejected by the schema.
  const brokenPath = testInfo.outputPath('ongeldig.json');
  writeFileSync(brokenPath, JSON.stringify({ design: { schemaVersion: 9 } }));
  await fileInput.setInputFiles(brokenPath);
  await expect(page.getByRole('status')).toContainText('Het ontwerp is ongeldig');
  await expect(statusbar).toContainText('1 meubels');

  // The import is a normal edit: undo removes it again.
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(statusbar).toContainText('0 meubels');

  expect(pageErrors).toEqual([]);
  await deleteCurrentProject(page);
});

test('AI-voorstel bekijken en pas na goedkeuring toepassen', async ({ page }) => {
  await loginWithDemo(page);
  await createProject(page, `E2E AI kamer ${Date.now()}`);

  const statusbar = page.locator('.statusbar');
  await expect(statusbar).toContainText('0 meubels');

  await page.getByRole('tab', { name: 'AI' }).click();
  await page.getByRole('button', { name: 'Voorstellen genereren' }).click();

  await expect(page.getByText(/Voorstellen \(3\)/)).toBeVisible({ timeout: 30_000 });

  // Reviewing shows a ghost layer; nothing is applied yet.
  await page.getByRole('button', { name: 'Bekijken in 2D' }).first().click();
  const banner = page.locator('.proposal-banner');
  await expect(banner).toBeVisible();
  await expect(statusbar).toContainText('0 meubels');

  await banner.getByRole('button', { name: 'Goedkeuren' }).click();
  await expect(page.locator('.proposal-banner')).toHaveCount(0);
  await expect(statusbar).not.toContainText('0 meubels');

  // The applied layout is a normal, editable design.
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(statusbar).toContainText('0 meubels');

  await deleteCurrentProject(page);
});
