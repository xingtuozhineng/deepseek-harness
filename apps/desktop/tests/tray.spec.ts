import type { MenuItemConstructorOptions } from 'electron'
import { afterEach, expect, it, vi } from 'vitest'
import { resolveDesktopLocale } from '../src/locale.ts'
import { DesktopTray } from '../src/tray.ts'

const native = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  const trays: FakeTray[] = []
  class FakeTray extends EventEmitter {
    readonly setToolTip = vi.fn()
    readonly setContextMenu = vi.fn()
    readonly destroy = vi.fn()
    constructor(readonly image: unknown) { super(); trays.push(this) }
  }
  const menus: MenuItemConstructorOptions[][] = []
  return {
    trays, FakeTray, menus, app: { isPackaged: false, getName: vi.fn(() => 'DeepSeek Harness') },
    createFromPath: vi.fn((path: string) => ({ path })),
    buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => { menus.push(template); return { template } }),
  }
})
vi.mock('electron', () => ({
  app: native.app,
  Tray: native.FakeTray,
  nativeImage: { createFromPath: native.createFromPath },
  Menu: { buildFromTemplate: native.buildFromTemplate },
}))

afterEach(() => { native.trays.length = 0; native.menus.length = 0; native.app.isPackaged = false; native.app.getName.mockReturnValue('DeepSeek Harness'); vi.clearAllMocks() })

function setup(locale = 'en') {
  let current = resolveDesktopLocale(locale)
  const open = vi.fn()
  const quit = vi.fn()
  const tray = new DesktopTray({ iconPath: 'C:/app/resources/tray.ico', locale: () => current, open, quit })
  return { tray, open, quit, native: native.trays[0]!, setLocale: (next: string) => { current = resolveDesktopLocale(next) } }
}

function labels(menu: MenuItemConstructorOptions[]): (string | undefined)[] {
  return menu.map(item => item.type === 'separator' ? 'separator' : item.label)
}

it('shows the application icon with its name as the tooltip and an Open / Quit menu', () => {
  const f = setup()
  expect(native.createFromPath).toHaveBeenCalledWith('C:/app/resources/tray.ico')
  expect(f.native.image).toEqual({ path: 'C:/app/resources/tray.ico' })
  expect(f.native.setToolTip).toHaveBeenCalledWith('DeepSeek Harness')
  expect(labels(native.menus[0]!)).toEqual(['Open DeepSeek Harness', 'separator', 'Quit DeepSeek Harness'])
  expect(f.native.setContextMenu).toHaveBeenCalledWith({ template: native.menus[0] })
})

it('opens the window on a single click and routes menu entries to the open and quit actions', () => {
  const f = setup()
  f.native.emit('click')
  expect(f.open).toHaveBeenCalledOnce()
  const menu = native.menus[0]!
  ;(menu[0] as { click: () => void }).click()
  ;(menu[2] as { click: () => void }).click()
  expect(f.open).toHaveBeenCalledTimes(2)
  expect(f.quit).toHaveBeenCalledOnce()
})

it('relabels the menu in the current locale and ignores relabel after disposal', () => {
  const f = setup()
  f.setLocale('zh')
  f.tray.relabel()
  expect(labels(native.menus[1]!)).toEqual(['打开 DeepSeek Harness', 'separator', '退出 DeepSeek Harness'])
  f.tray.dispose()
  f.tray.dispose()
  expect(f.native.destroy).toHaveBeenCalledOnce()
  f.tray.relabel()
  expect(native.menus).toHaveLength(2)
})

it('uses the packaged product name for the tooltip and both localized actions', () => {
  native.app.isPackaged = true
  native.app.getName.mockReturnValue('ZYH Agent')
  const f = setup()
  expect(f.native.setToolTip).toHaveBeenLastCalledWith('ZYH Agent')
  expect(labels(native.menus[0]!)).toEqual(['Open ZYH Agent', 'separator', 'Quit ZYH Agent'])
  f.setLocale('zh')
  f.tray.relabel()
  expect(f.native.setToolTip).toHaveBeenLastCalledWith('ZYH Agent')
  expect(labels(native.menus[1]!)).toEqual(['打开 ZYH Agent', 'separator', '退出 ZYH Agent'])
  expect(native.createFromPath).toHaveBeenCalledWith('C:/app/resources/tray.ico')
})

it('preserves the normal packaged product and ignores the npm name during source development', () => {
  native.app.isPackaged = true
  const packaged = setup()
  expect(packaged.native.setToolTip).toHaveBeenLastCalledWith('DeepSeek Harness')
  native.app.isPackaged = false
  native.app.getName.mockReturnValue('@deepseek-ai/dsh-desktop')
  const development = setup('zh')
  expect(development.native.setToolTip).toHaveBeenLastCalledWith('DeepSeek Harness')
  expect(labels(native.menus.at(-1)!)).toEqual(['打开 DeepSeek Harness', 'separator', '退出 DeepSeek Harness'])
})
