import assert from 'node:assert/strict'
import test from 'node:test'
import { isCustomSourceUpdateAvailable, normalizeCustomSourceUpdateUrl, parseCustomSourceUpdateResponse } from '../src/server/customSourceUpdate'

test('resolves JSON update manifests, relative download links and explicit current-version replies', () => {
    const base = 'https://example.com/api/update'
    assert.deepEqual(parseCustomSourceUpdateResponse('{"code":200,"data":{"url":"../source.js"}}', base), { downloadUrl: 'https://example.com/source.js' })
    assert.deepEqual(parseCustomSourceUpdateResponse('{"downloadUrl":"https://cdn.example.com/source.js"}', base), { downloadUrl: 'https://cdn.example.com/source.js' })
    assert.deepEqual(parseCustomSourceUpdateResponse('{"code":0,"msg":"已是最新版本"}', base), { upToDate: true })
    assert.equal(parseCustomSourceUpdateResponse('lx.send("inited", {});', base), undefined)
    assert.throws(() => parseCustomSourceUpdateResponse('{"code":403,"msg":"denied"}', base))
    assert.throws(() => parseCustomSourceUpdateResponse('{"code":0,"msg":"ok"}', base))
    assert.throws(() => parseCustomSourceUpdateResponse('{"url":"file:///tmp/source.js"}', base))
    assert.equal(normalizeCustomSourceUpdateUrl('javascript:alert(1)'), undefined)
})

test('ignores generated ISO timestamps in script comments', () => {
    const current = '/*\n * Generated at 2026-10-07T10:12:30.001Z\n */\nconst version = 1;\n'
    const remote = '/*\n * Generated at 2026-10-07T10:12:30.987Z\n */\nconst version = 1;\n'

    assert.equal(isCustomSourceUpdateAvailable(current, remote, 'v1.0.0', 'v1.0.0'), false)
})

test('still detects source code and metadata version changes', () => {
    const current = '// Generated at 2026-10-07T10:12:30.001Z\nconst quality = 1;\n'
    const timestampOnly = '// Generated at 2026-10-07T10:12:30.987Z\nconst quality = 1;\n'
    const codeChanged = '// Generated at 2026-10-07T10:12:30.987Z\nconst quality = 2;\n'

    assert.equal(isCustomSourceUpdateAvailable(current, timestampOnly, 'v1.0.0', 'v1.0.0'), false)
    assert.equal(isCustomSourceUpdateAvailable(current, codeChanged, 'v1.0.0', 'v1.0.0'), true)
    assert.equal(isCustomSourceUpdateAvailable(current, timestampOnly, 'v1.0.0', 'v1.0.1'), true)
})

test('does not normalize timestamps in executable code', () => {
    const current = 'const build = "2026-10-07T10:12:30.001Z";\n'
    const remote = 'const build = "2026-10-07T10:12:30.987Z";\n'

    assert.equal(isCustomSourceUpdateAvailable(current, remote, 'v1.0.0', 'v1.0.0'), true)
})
