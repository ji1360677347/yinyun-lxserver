import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('file-imported sources can save a validated update URL and update in place', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yinyun-source-update-'))
  const sourceDir = path.join(root, 'users', 'source', 'owner')
  fs.mkdirSync(sourceDir, { recursive: true })
  global.lx = {
    dataPath: root, userPath: path.join(root, 'users'),
    config: { users: [{ name: 'owner' }, { name: 'recipient' }], 'proxy.customSource.mode': 'direct' } as LX.Config,
  }
  // This test reloads sources explicitly; no background file watcher is needed.
  t.mock.method(fs, 'watch', () => ({ close() {} }))
  const handlers = await import('../src/server/customSourceHandlers')
  const makeScript = (version: string, name = 'Test source') =>
    `/**\n * @name ${name}\n * @version ${version}\n */\nlx.send('inited', { sources: { tx: { name: 'QQ', type: 'music', actions: ['musicUrl'], qualitys: ['128k'] } } });\n`
  const current = makeScript('1.0.0')
  let remote = current
  const stored = {
    id: 'Test source.js', name: 'Test source', version: '1.0.0', enabled: false,
    supportedSources: ['tx'], allowUnsafeVM: false, requireUnsafe: false,
  }
  const metadataPath = path.join(sourceDir, 'sources.json')
  const scriptPath = path.join(sourceDir, stored.id)
  fs.writeFileSync(metadataPath, JSON.stringify([stored]))
  fs.writeFileSync(scriptPath, current)
  const metadata = () => JSON.parse(fs.readFileSync(metadataPath, 'utf8'))[0]
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost')
    if (url.pathname === '/script.js' || decodeURIComponent(url.pathname) === '/Test source.js') return void res.end(remote)
    if (url.pathname === '/missing.js') { res.writeHead(404); return void res.end() }
    const username = url.searchParams.get('username') || 'owner'
    if (url.pathname === '/check') return void handlers.handleCheckUpdate(req, res, username)
    if (url.pathname === '/update') return void handlers.handleUpdate(req, res, username)
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  const sourceUrl = origin + '/script.js'
  const request = async (endpoint: string, body: object, username = 'owner') => {
    const response = await fetch(`${origin}/${endpoint}?username=${username}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: stored.id, ...body }),
    })
    return { status: response.status, ...await response.json() as any }
  }
  try {
    const missing = await request('check', {})
    assert.equal(missing.needsSourceUrl, true)
    assert.equal(metadata().sourceUrl, undefined)

    for (const url of ['file:///tmp/source.js', origin + '/missing.js']) {
      assert.equal((await request('check', { sourceUrl: url })).success, false)
      assert.equal(metadata().sourceUrl, undefined)
    }
    remote = makeScript('2.0.0', 'Unrelated source')
    assert.equal((await request('check', { sourceUrl })).success, false)
    assert.equal((await request('check', { sourceUrl: origin + '/Test%20source.js' })).success, false)
    assert.equal(metadata().sourceUrl, undefined)
    assert.equal(fs.readFileSync(scriptPath, 'utf8'), current)

    remote = makeScript('2.0.0').replace("tx: { name: 'QQ', type: 'music', actions: ['musicUrl'], qualitys: ['128k'] }", '')
    assert.equal((await request('check', { sourceUrl })).success, false)
    assert.equal(metadata().sourceUrl, undefined)

    remote = current
    const same = await request('check', { sourceUrl })
    assert.equal(same.success, true)
    assert.equal(same.available, false)
    assert.equal(metadata().sourceUrl, sourceUrl)
    assert.equal(fs.readFileSync(scriptPath, 'utf8'), current)

    assert.equal((await request('check', { sourceUrl }, 'recipient')).success, false)
    assert.equal(fs.existsSync(path.join(root, 'users', 'source', 'recipient', 'sources.json')), false)

    remote = makeScript('2.0.0')
    const changed = await request('check', {})
    assert.equal(changed.available, true)
    assert.equal(changed.updateAlert.updateUrl, sourceUrl)
    assert.equal(fs.readFileSync(scriptPath, 'utf8'), current)
    const updated = await request('update', {})
    assert.equal(updated.success, true)
    assert.equal(updated.updated, true)
    assert.equal(metadata().version, '2.0.0')
    assert.equal(metadata().enabled, false)
    assert.equal(metadata().sourceUrl, sourceUrl)
    assert.equal(fs.readFileSync(scriptPath, 'utf8'), remote)
    assert.equal(fs.readFileSync(path.join(sourceDir, updated.backup), 'utf8'), current)
    assert.equal((await request('check', {})).available, false)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    fs.rmSync(root, { recursive: true, force: true })
  }
})
