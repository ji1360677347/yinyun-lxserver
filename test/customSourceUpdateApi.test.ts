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
  let audioRequested = false
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
    if (url.pathname === '/manifest') return void res.end(JSON.stringify(url.searchParams.get('version') === '2.0.0'
      ? { code: 0, msg: '已是最新版本' }
      : { code: 200, data: { url: './script.js', name: stored.name, version: '2.0.0' } }))
    if (url.pathname === '/runtime') return void res.end(JSON.stringify({ data: { log: 'new update', downloadUrl: origin + '/script.js' } }))
    if (url.pathname === '/audio') return void res.end(JSON.stringify({ msg: 'ok', url: origin + '/audio.mp3' }))
    if (url.pathname === '/audio.mp3') { audioRequested = true; return void res.end('audio data') }
    if (url.pathname === '/loop') return void res.end(JSON.stringify({ url: './loop' }))
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

    // An existing uploaded source discovers its declared update API, without a saved URL.
    fs.writeFileSync(metadataPath, JSON.stringify([stored]))
    const withEndpoint = (version: string) => makeScript(version).replace(' */', ` * @updateUrl ${origin}/manifest?version=${version}\n */`)
    fs.writeFileSync(scriptPath, withEndpoint('1.0.0'))
    remote = withEndpoint('2.0.0')
    const automatic = await request('check', {})
    assert.equal(automatic.available, true)
    assert.equal(automatic.needsSourceUrl, undefined)
    assert.equal(metadata().sourceUrl, undefined)
    assert.equal((await request('update', {})).updated, true)
    assert.equal(metadata().sourceUrl, undefined)
    assert.equal(fs.readFileSync(scriptPath, 'utf8'), remote)
    assert.equal((await request('check', {})).available, false)
    assert.equal((await request('update', {})).updated, false)
    assert.equal((await request('check', { sourceUrl: origin + '/loop' })).success, false)
    assert.equal(metadata().sourceUrl, undefined)

    // Invalid saved URLs fall back to the script's own valid endpoint.
    fs.writeFileSync(metadataPath, JSON.stringify([{ ...stored, sourceUrl: origin + '/missing.js' }]))
    assert.equal((await request('check', {})).available, false)
    assert.equal(metadata().sourceUrl, origin + '/missing.js')

    // Both LX updateAlert events and JSON response announcements can supply a download link.
    fs.writeFileSync(metadataPath, JSON.stringify([stored]))
    for (const announce of [
      `lx.send('updateAlert', { updateUrl: '${sourceUrl}' });`,
      `lx.request('${origin}/runtime', {}, () => lx.send('inited', { sources: { tx: {} } }));`,
    ]) {
      fs.writeFileSync(scriptPath, `/**\n * @name Test source\n * @version 1.0.0\n */\n${announce}`)
      const detected = await request('check', {})
      assert.equal(detected.available, true)
      assert.equal(detected.needsSourceUrl, undefined)
      assert.equal(metadata().sourceUrl, undefined)
    }
    fs.writeFileSync(scriptPath, makeScript('1.0.0').replace("lx.send('inited',", `lx.request('${origin}/audio', {}, () => lx.send('inited',`).replace('});\n', '}));\n'))
    assert.equal((await request('check', {})).needsSourceUrl, true)
    assert.equal(audioRequested, false)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    fs.rmSync(root, { recursive: true, force: true })
  }
})
