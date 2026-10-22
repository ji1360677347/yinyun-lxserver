'use strict'

const { spawnSync } = require('child_process')

const electronBinary = require('electron')
const result = spawnSync(electronBinary, ['-p', 'process.versions.node'], {
  encoding: 'utf8',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  timeout: 15000,
})

if (result.error) throw result.error
if (result.status !== 0) {
  throw new Error(`Electron runtime probe failed: ${result.stderr || result.stdout}`)
}

const runtimeVersion = result.stdout.trim().replace(/^v/, '')
const [major, minor, patch] = runtimeVersion.split('.').map(Number)
const minimums = { 22: [23, 4], 24: [22, 1], 26: [12, 1] }
const minimum = minimums[major]
const isPatched = minimum && (minor > minimum[0] || (minor === minimum[0] && patch >= minimum[1]))

if (!isPatched) {
  throw new Error(`Electron bundles Node.js ${runtimeVersion}; use a patched Electron runtime (Node.js 22.23.4+, 24.22.1+, or 26.12.1+).`)
}

console.log(`Electron runtime Node.js ${runtimeVersion} includes the required security release.`)
