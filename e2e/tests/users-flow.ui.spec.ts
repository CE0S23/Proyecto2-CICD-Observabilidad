import { expect, test } from '@playwright/test';

/**
 * Flujo E2E completo en navegador:
 * registro -> login -> crear usuario -> editar -> eliminar -> logout.
 */
test.describe('Flujo de usuario en el navegador', () => {
  const stamp = Date.now();
  const owner = { name: 'E2E Owner', email: `e2e.owner.${stamp}@test.com`, password: 'Password123' };
  const target = { name: 'E2E Creado', email: `e2e.crud.${stamp}@test.com`, password: 'Password123' };

  test('registro, login, CRUD y logout', async ({ page }) => {
    await test.step('rutas protegidas redirigen a /login sin sesion', async () => {
      await page.goto('/users');
      await expect(page).toHaveURL(/\/login/);
    });

    await test.step('registro de cuenta nueva', async () => {
      await page.getByTestId('go-register').click();
      await expect(page).toHaveURL(/\/register/);
      await page.getByTestId('register-name').fill(owner.name);
      await page.getByTestId('register-email').fill(owner.email);
      await page.getByTestId('register-password').fill(owner.password);
      await page.getByTestId('register-submit').click();
      await expect(page).toHaveURL(/\/users$/);
      await expect(page.getByTestId('current-user')).toHaveText(owner.name);
    });

    await test.step('logout y login con la cuenta registrada', async () => {
      await page.getByTestId('logout').click();
      await expect(page).toHaveURL(/\/login/);
      await page.getByTestId('login-email').fill(owner.email);
      await page.getByTestId('login-password').fill('incorrecta');
      await page.getByTestId('login-submit').click();
      await expect(page.getByTestId('login-error')).toContainText('Credenciales invalidas');
      await page.getByTestId('login-password').fill(owner.password);
      await page.getByTestId('login-submit').click();
      await expect(page).toHaveURL(/\/users$/);
      await expect(page.getByTestId('users-table')).toBeVisible();
    });

    await test.step('crear usuario desde el formulario', async () => {
      await page.getByTestId('users-new').click();
      await page.getByTestId('user-name').fill(target.name);
      await page.getByTestId('user-email').fill(target.email);
      await page.getByTestId('user-password').fill(target.password);
      await page.getByTestId('user-role').selectOption('USER');
      await page.getByTestId('user-save').click();
      await expect(page).toHaveURL(/\/users$/);
      await expect(page.getByTestId('users-notice')).toContainText('creado');
      await expect(page.getByTestId(`user-row-${target.email}`)).toContainText(target.name);
    });

    await test.step('editar el usuario creado', async () => {
      await page.getByTestId(`user-row-${target.email}`).getByTestId('edit-user').click();
      await expect(page.getByTestId('user-name')).toHaveValue(target.name);
      await page.getByTestId('user-name').fill('E2E Editado');
      await page.getByTestId('user-role').selectOption('ADMIN');
      await page.getByTestId('user-save').click();
      await expect(page).toHaveURL(/\/users$/);
      const row = page.getByTestId(`user-row-${target.email}`);
      await expect(row).toContainText('E2E Editado');
      await expect(row).toContainText('ADMIN');
    });

    await test.step('eliminar el usuario', async () => {
      const row = page.getByTestId(`user-row-${target.email}`);
      await row.getByTestId('delete-user').click();
      await row.getByTestId('confirm-delete').click();
      await expect(page.getByTestId('users-notice')).toContainText('eliminado');
      await expect(page.getByTestId(`user-row-${target.email}`)).toHaveCount(0);
    });

    await test.step('logout', async () => {
      await page.getByTestId('logout').click();
      await expect(page).toHaveURL(/\/login/);
      await page.goto('/users');
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test('el registro valida los campos en el formulario', async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId('register-email').fill('no-es-email');
    await page.getByTestId('register-password').fill('123');
    await page.getByTestId('register-submit').click();
    await expect(page.getByText('Escribe un email valido')).toBeVisible();
    await expect(page.getByText('Minimo 8 caracteres')).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });
});
