import { test, expect } from '@playwright/test'
import { launchShell, closeAndSaveVideo, screenshotPath } from './helpers'

test.describe('home screen', () => {
  test('shows hero, quick-create cards and tab bar', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      recordVideo: false,
      videoDir: 'home-basics',
    })
    const { page } = launched
    try {
      await expect(page.locator('.home-hero')).toBeVisible()
      // five AI quick-create cards plus the "Open file" browse card
      await expect(page.locator('.quick-card')).toHaveCount(6)
      await expect(page.locator('.quick-card').first()).toContainText('AI Docs')
      await expect(page.locator('.quick-card').nth(1)).toContainText('AI Sheets')
      await expect(page.locator('.quick-card').nth(2)).toContainText('AI Slides')
      await expect(page.locator('.quick-card').nth(3)).toContainText('AI Markdown')
      await expect(page.locator('.quick-card').nth(4)).toContainText('AI PDF')
      await expect(page.locator('.tab-bar .tab-item.tab-home')).toBeVisible()
      await page.screenshot({ path: screenshotPath('home-overview') })
    } finally {
      await closeAndSaveVideo(launched, 'home-basics')
    }
  })

  test('renders localized UI when GENOFFICE_LANG=zh-CN', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      lang: 'zh-CN',
      recordVideo: false,
      videoDir: 'home-zh-cn',
    })
    const { page } = launched
    try {
      await expect(page.locator('.nav-item .nav-label').first()).toHaveText('最近')
      await page.screenshot({ path: screenshotPath('home-zh-cn') })
    } finally {
      await closeAndSaveVideo(launched, 'home-zh-cn')
    }
  })

  test('checks for updates automatically when About is opened', async () => {
    const launched = await launchShell({
      onboardingSeen: true,
      lang: 'zh-CN',
      recordVideo: false,
      videoDir: 'about-update-check',
    })
    const { app, page } = launched
    try {
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('home:check-for-updates')
        ipcMain.handle('home:check-for-updates', () => ({
          status: 'current',
          currentVersion: '0.6.82',
          latestVersion: '0.6.82',
        }))
      })
      await page.locator('.account-btn').click()
      await page.getByRole('button', { name: '关于', exact: true }).click()
      await expect(page.getByRole('status')).toContainText('当前已是最新版本')
      await expect(page.getByRole('status')).toContainText('稳定版')
      await expect(page.getByRole('button', { name: '重新检查', exact: true })).toBeVisible()
      await page.screenshot({ path: screenshotPath('about-update-check') })
    } finally {
      await closeAndSaveVideo(launched, 'about-update-check')
    }
  })
})
