import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const app = fs.readFileSync('public/music/app.js', 'utf8')
const ast = ts.createSourceFile('app.js', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const declaration = (name: string) => {
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert.ok(node, name)
  return node.getText(ast)
}

test('both source lists show update checks for uploaded and disabled sources, but not shared sources', async () => {
  const containers = new Map(['custom-sources-list', 'settings-custom-sources-list'].map(id => [id, {
    innerHTML: '', children: [] as any[], appendChild(child: any) { this.children.push(child) },
  }]))
  const context = vm.createContext({
    window: {}, isUserLoggedIn: () => true,
    localStorage: { getItem: () => 'owner' },
    fetchCustomSources: async () => [
      { id: 'uploaded.js', name: 'Uploaded', enabled: false },
      { id: 'url.js', name: 'URL', enabled: false, sourceUrl: 'https://example.com/source.js' },
      { id: 'shared.js', name: 'Shared', enabled: false, readOnly: true },
    ],
    createMarqueeHtml: (text: string) => text, escapeHtmlText: (text: unknown) => String(text),
    document: {
      getElementById: (id: string) => containers.get(id),
      createElement: () => ({
        dataset: {}, innerHTML: '', className: '',
        querySelector: () => null, querySelectorAll: () => [],
      }),
    },
  })
  vm.runInContext(declaration('renderCustomSources'), context)
  await vm.runInContext('renderCustomSources()', context)
  for (const container of containers.values()) {
    assert.equal(container.children.length, 3)
    assert.match(container.children[0].innerHTML, /data-check-source-update="uploaded.js"/)
    assert.match(container.children[1].innerHTML, /data-check-source-update="url.js"/)
    assert.doesNotMatch(container.children[2].innerHTML, /data-check-source-update=/)
  }
})

test('missing update URL prompts once, cancellation sends no request, existing URL checks directly', async () => {
  const requests: any[] = []
  const messages: string[] = []
  let input: string | null = null
  let prompts = 0
  const context = vm.createContext({
    window: { customSourceShareSources: { uploaded: {} } },
    localStorage: { getItem: (key: string) => key === 'lx_sync_user' ? 'owner' : '' },
    isUserLoggedIn: () => true, getUserAuthHeaders: () => ({}),
    showInput: async () => { prompts++; return input },
    showSuccess: (text: string) => messages.push(text), showInfo: () => {},
    showError: (text: string) => messages.push(text), console: { error() {} },
    renderCustomSources: async () => {},
    fetch: async (_: string, options: any) => {
      requests.push(JSON.parse(options.body))
      return { ok: true, status: 200, json: async () => ({ success: true, available: false }) }
    },
  })
  vm.runInContext(declaration('checkCustomSourceUpdate'), context)
  assert.equal(await vm.runInContext("checkCustomSourceUpdate('uploaded')", context), false)
  assert.equal(requests.length, 0)
  assert.equal(messages.length, 0)
  input = ' https://example.com/source.js '
  assert.equal(await vm.runInContext("checkCustomSourceUpdate('uploaded')", context), true)
  assert.equal(requests[0].sourceUrl, input.trim())
  context.window.customSourceShareSources.uploaded = { sourceUrl: input.trim() } as any
  await vm.runInContext("checkCustomSourceUpdate('uploaded')", context)
  assert.equal(prompts, 2)
  assert.equal(requests[1].sourceUrl, undefined)
  assert.equal(messages.length, 2)
})
