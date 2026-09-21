import { test, expect, type Page } from '@playwright/test';

async function expectContainedWorkspace(page: Page) {
  if (page.viewportSize()!.width <= 600)
    await expect(page.locator('main')).toHaveCSS('margin-left', '0px');
  await expect(page.getByRole('button', { name: 'Enregistrer', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Annuler', exact: true })).toBeInViewport();
  const sizes = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const root = document.documentElement;
    return {
      main: main.scrollHeight <= main.clientHeight + 1,
      page: root.scrollHeight <= window.innerHeight + 1,
      horizontal: root.scrollWidth <= window.innerWidth,
    };
  });
  expect(sizes).toEqual({ main: true, page: true, horizontal: true });
  const tabs = await page.getByRole('tablist').boundingBox();
  const card = await page.getByRole('tabpanel').boundingBox();
  expect(tabs!.y + tabs!.height).toBeLessThanOrEqual(card!.y);
}

test('onglets, annulation, cartes défilantes et sidebar repliable', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Utilisateur').fill('admin');
  await page.getByLabel('Mot de passe').fill('e2e-test-password');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('link', { name: 'Configuration', exact: true }).first().click();
  await page.setViewportSize({ width: 1440, height: 900 });
  const name = page.getByLabel('Nom de l’application');
  const original = await name.inputValue();
  await name.fill('Modification temporaire');
  await page.getByRole('tab', { name: 'Registries', exact: true }).click();
  await expect(name).not.toBeVisible();
  await expect(page.getByLabel('Nombre maximal de sauvegardes par Registry')).toBeVisible();
  await page.getByRole('tab', { name: 'Général', exact: true }).click();
  await expect(name).toHaveValue('Modification temporaire');
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(name).toHaveValue(original);

  await page.getByRole('tab', { name: 'Interface', exact: true }).click();
  await page.getByLabel('Thème', { exact: true }).selectOption('dark');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('tab', { name: 'Interface', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Registries', exact: true }).click();
  await expectContainedWorkspace(page);
  await page.screenshot({ path: 'test-results/configuration-tabs-desktop.png' });

  const expanded = (await page.locator('.sidebar').boundingBox())!.width;
  await page.getByRole('button', { name: 'Réduire la sidebar' }).click();
  await expect(page.locator('.sidebar')).toHaveCSS('width', '76px');
  expect(expanded).toBeGreaterThan(76);
  await expectContainedWorkspace(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Agrandir la sidebar' })).toBeVisible();
  await expect(page.locator('.sidebar')).toHaveCSS('width', '76px');
  await page.getByRole('button', { name: 'Agrandir la sidebar' }).click();
  await expect(page.locator('.sidebar')).toHaveCSS('width', `${expanded}px`);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 800, height: 500 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole('tab', { name: 'Registries', exact: true }).click();
    await expectContainedWorkspace(page);
    await page.getByRole('tabpanel').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expectContainedWorkspace(page);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expectContainedWorkspace(page);
  await page.getByRole('tabpanel').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: 'test-results/configuration-tabs-mobile.png' });

  await page.goto('/registries/new');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel('Nom', { exact: true }).fill('Saisie conservée');
  await page.getByRole('tab', { name: /Aperçu YAML/ }).click();
  await page.getByRole('tab', { name: /Document/ }).click();
  await expect(page.getByLabel('Nom', { exact: true })).toHaveValue('Saisie conservée');
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.getByLabel('Nom', { exact: true })).toHaveValue('Nouveau Registry');
  await expectContainedWorkspace(page);
  await page.screenshot({ path: 'test-results/registry-tabs-desktop.png' });
  await page.getByRole('tab', { name: /Document/ }).click();
  expect(
    await page
      .getByRole('tabpanel')
      .evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true);
  await page.getByRole('tabpanel').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expectContainedWorkspace(page);
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 800, height: 500 },
  ]) {
    await page.setViewportSize(viewport);
    await expectContainedWorkspace(page);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: /Document/ }).click();
  await page.screenshot({ path: 'test-results/registry-tabs-mobile.png' });
});
