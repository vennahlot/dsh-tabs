/**
 * dsh-tabs, Host half: where the tabs are kept.
 *
 * The Client half (client.js, the Tabs page) keeps its tabs (which sessions sit in which panes,
 * the groups, the strip settings) in one JSON file on the Host, so they survive a page reload, a
 * DSH restart and a second browser. The page reads it once on load and writes the whole document back after each change
 * (debounced). The file is the plugin's own data: nothing goes into session logs.
 *
 *   GET /dsh-tabs/state   → {ok, value: <document> | null}
 *   PUT /dsh-tabs/state   {<document>} → {ok}
 *
 * The routes answer only trusted, authenticated requests (`connection.requestRejection`, the same
 * fence as DSH's own /api). Writes are atomic (temp file + rename). No imports beyond Node built-ins.
 *
 * Design: DESIGN.md
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'dsh-tabs'

const DEFAULTS = {
  /** The tabs, groups and strip settings, written by the page. `~` expands to the home directory. */
  stateFile: '~/.dsh/dsh-tabs/state.json',
}

const ROUTE_STATE = '/dsh-tabs/state'
const MAX_BODY_BYTES = 256 * 1024

const message = (error) => (error instanceof Error ? error.message : String(error))
const expand = (p) => (p.startsWith('~/') ? join(homedir(), p.slice(2)) : p)

export function apply(ctx, rawConfig = {}) {
  const config = { ...DEFAULTS, ...rawConfig }
  const file = expand(config.stateFile)

  async function load() {
    try { return JSON.parse(await readFile(file, 'utf8')) }
    catch (error) { if (error?.code === 'ENOENT') return null; throw error }
  }

  // One write at a time, last one wins: a write that arrives while another runs replaces the queued one.
  let writing = Promise.resolve()
  async function save(doc) {
    const run = writing.then(async () => {
      await mkdir(dirname(file), { recursive: true })
      const tmp = `${file}.${process.pid}.tmp`
      await writeFile(tmp, JSON.stringify(doc, null, 2) + '\n', 'utf8')
      await rename(tmp, file)
    })
    writing = run.catch(() => {})
    return run
  }

  ctx.inject(['webServer', 'connection'], (web) => {
    const sendJson = (res, status, payload) => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(JSON.stringify(payload))
    }
    const readJson = (req) => new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) { reject(new Error('request body too large')); req.destroy(); return }
        chunks.push(chunk)
      })
      req.on('end', () => {
        try { resolve(chunks.length === 0 ? null : JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
        catch (error) { reject(new Error(`malformed JSON body: ${message(error)}`)) }
      })
      req.on('error', reject)
    })

    web.effect(() => web.webServer.register({
      kind: 'exact',
      path: ROUTE_STATE,
      async handler(req, res) {
        const rejection = web.connection.requestRejection(req)
        if (rejection !== undefined) { res.statusCode = rejection; res.end(); return }
        try {
          if (req.method === 'GET') { sendJson(res, 200, { ok: true, value: await load() }); return }
          if (req.method === 'PUT') {
            const doc = await readJson(req)
            if (doc === null || typeof doc !== 'object' || !Array.isArray(doc.tabs)) {
              sendJson(res, 400, { ok: false, error: 'expected {tabs: [...]}' })
              return
            }
            await save(doc)
            sendJson(res, 200, { ok: true })
            return
          }
          res.statusCode = 405
          res.setHeader('allow', 'GET, PUT')
          res.end()
        } catch (error) {
          sendJson(res, 200, { ok: false, error: message(error) })
        }
      },
    }), `dsh-tabs: ${ROUTE_STATE}`)
  })
}
