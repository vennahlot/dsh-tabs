/**
 * dsh-tabs, Client half: the Tabs page. Design: DESIGN.md
 *
 * Model (Chrome's tab strip, for chat sessions):
 *   - tabs: the strip, in the user's order. A tab is one session, or a split of up to four (a
 *     tree of row / column splits). Only opening (a new tab goes at the end, ungrouped), closing
 *     and dragging change the order; showing a tab never moves one.
 *   - the active tab fills the page: its panes are live. Other tabs only read status.
 *   - groups: name, colour, collapsed; their members sit next to each other.
 *   - the drawer: DSH's own session list in the left sidebar. Closing a tab puts its sessions back
 *     there, still running.
 * The doc changes only through the pure moves in `M`, each followed by `normalize`
 * (test/moves.test.mjs runs them from this file).
 *
 * How a pane shows a session: the pane retains the session (`ctx.sessions.retain(id, {source:
 * 'tabs'})`) while mounted, wraps it in the slot kit's `SessionProvider`, and renders the child slot
 * `tabs.pane` (scope session), whose component renders the shared `conversation.content` factory
 * with `variant: 'embedded'`. Panes are laid out absolutely from the tree and keyed by session, so
 * a split, swap or resize never remounts a conversation.
 *
 * Files, Terminal and file previews need the normal conversation page (its right sidebar), so ⤢
 * and file links open the session's full page.
 *
 * State lives in the Host's JSON file (`/dsh-tabs/state`, index.js). Plain JavaScript, no JSX, no
 * Harness Client package imports (only the browser module table's React); theme tokens only.
 */
window.__ModuleLoader__.load({
  id: '@yichenwang/dsh-tabs',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useLayoutEffect, useRef, useSyncExternalStore, useCallback, useMemo } = React

    const NS = 'dshTabs'
    const PANEL_ID = 'tabs'
    const PANE_SLOT = 'tabs.pane'
    /** Extension seats other bundles fill: a keyed tool panel beside each pane, items on the menu bar. */
    const SIDE_SLOT = 'tabs.pane.side'
    const BAR_SLOT = 'tabs.menubar.item'
    const SOURCE = 'tabs'  // SessionReferenceSource for our retains (shows in retainedBy)
    const STATE_ROUTE = '/dsh-tabs/state'.slice(1)
    const MAX_PANES = 4
    const MIME = 'application/x-dsh-tabs'
    const P = 'dtab'  // css class prefix
    const EASE = 'cubic-bezier(.25,.8,.25,1)'

    const EN = {
      panel: 'Tabs',
      title: 'Tabs',
      tabs: 'Tabs',
      stripEmpty: 'No tabs yet.\nClick a row in the drawer, or + to find a chat.',
      newTab: 'Open a chat in a new tab (⌥O)',
      stripMenu: 'Tab strip options',
      split: 'Split · {n}',
      pillWait: '{n} waiting', pillRun: '{n} working',
      tabTip: '{t}\n{p}{n}\nClick: show it · drag: reorder, into a group, or onto a pane · right-click: groups',
      itemClose: 'Close: back to the drawer, still running',
      drawerZone: '↩ Drop here to close it (back to the drawer)',
      noTab: 'No tab is open.',
      noTabHint: 'Click a row in the drawer, or + on the strip, to open a chat here.',
      headTip: 'Drag onto another pane (swap or split), onto the tab strip, or back to the drawer',
      fullPage: 'Full page',
      moveOut: 'Move out of the split: its own tab, right after this one',
      separate: 'Separate: one tab per session',
      closeTab: 'Close tab',
      closeSplit: 'Close all {n}',
      newGroup: 'Add to new group',
      addTo: 'Add to “{g}”',
      ungroupTab: 'Remove from group',
      collapse: 'Collapse', expand: 'Expand',
      ungroup: 'Ungroup',
      closeGroup: 'Close group ({n} tabs)',
      groupName: 'Name this group',
      groupTip: '{n} tabs · click: collapse or expand · drag: move the group · right-click: options',
      groupUnnamed: '{n} tabs',
      groupByProject: 'Group by project (ungrouped tabs)',
      horizontal: 'Tabs on top (horizontal)',
      vertical: 'Tabs on the side (vertical)',
      reopen: 'Reopen closed tab (⌥⇧T)',
      widthTip: 'Drag to resize · double-click: reset',
      actSub: '{n} subagents',
      actSubRun: '{n} subagents running',
      actJob: '{n} jobs',
      actJobRun: '{n} jobs running',
      actTip: 'Subagents and background jobs of this chat',
      actSubs: 'Subagents (click: open beside it)',
      actJobs: 'Background jobs',
      actKill: 'Stop this job',
      sideClose: 'Close the panel',
      close: 'Close: back to the drawer, keeps running (⌥W)',
      idle: 'idle {ago}',
      idleNow: 'idle',
      running: 'Working',
      done: 'Finished, unread',
      approval: 'Needs approval',
      plan: 'Plan to review',
      question: 'Asks a question',
      waiting: 'Waiting for you',
      working: '{n} working',
      workingTip: 'Sessions working right now',
      help: 'How it works',
      catchClicks: 'Drawer clicks open in a tab',
      helpBody: 'Every session you opened has a tab in the strip, in your order; the active tab shows up to 4 sessions side by side. The drawer (left sidebar) holds everything else, still running.',
      helpTitle: 'How Tabs works',
      hr1: 'Click a tab|Show it. Switching never moves a tab: only opening, closing and dragging change the order',
      hr2: 'Drawer row  ·  +  ·  ⌥O|Opens the chat in a new tab at the end (or shows its tab when it has one)',
      hr3: '×  ·  ⌥W  ·  ⌥⇧T|Close the tab or pane: back to the drawer, it keeps running · reopen the last closed',
      hr4: 'Drag a tab or a pane header|Onto a pane\'s edge: split · its centre: replace or swap · along the strip: reorder, into or out of a group · the drawer zone: close',
      hr5: 'Right-click a tab or group|New group, add to a group, remove from it, separate a split; rename, colour, collapse, ungroup, close a group',
      hr6: '⋯ on the strip|Group by project · tabs on the side or on top · drag the strip\'s edge to widen it (double-click resets)',
      hr7: '◇ ⚙  ·  side panels  ·  ⤢|Subagents and jobs (click one to open it beside) · side panels other plugins add to a pane · the full page (Files, Terminal); ▦ Back to tabs returns',
      hr8: '🔔  ⌥N|One notification per ask from any open tab; answer short ones there; ☾ Focus stops banners',
      hr9: '⌥1 … ⌥8  ·  ⌥9  ·  ⌥[  ⌥]|Tab n · the last tab · previous / next tab',
      hr10: '⌥←↑↓→|Move focus between panes',
      hr11: '⌥F|Open the focused pane\'s full page',
      hr12: '⌥B|Show or hide the drawer',
      hr13: 'Esc|Close this, a menu or the notifications',
      openHere: 'Open it here',
      swap: 'Swap places',
      replace: 'Replace · “{t}” gets its own tab',
      left: 'Put it on the left', right: 'Put it on the right', top: 'Put it above', bottom: 'Put it below',
      full: 'A tab holds 4 panes',
      fullTab: 'A tab holds 4 panes. Click the tab to switch to it instead.',
      fullSession: 'A tab holds 4 panes. Close one (×) or move one out of the split first.',
      loading: 'Opening…',
      crashed: 'This pane could not render the conversation.',
      unknown: 'Unknown session',
      answerHint: '{what}: open it to answer.',
      loadFailed: 'Could not load the tabs: {error}',
      bell: 'Notifications (⌥N)',
      notes: 'Notifications',
      notesEmpty: 'Nothing needs you.',
      notesFoot: 'One per ask: answering, opening or dismissing it ends it.',
      clearAll: 'Clear all',
      quiet: '☾ Focus',
      quietTip: 'Focus: no banners; notifications still collect here',
      openNote: 'Open ↗',
      openNoteTip: 'Switch to it',
      dismiss: 'Dismiss (the session keeps its amber dot)',
      onActive: 'in the active tab',
      inTab: 'tab {n}',
      allow: 'Allow once',
      reject: 'Reject',
      planBody: 'A plan to read. Open it to review.',
      openToAnswer: 'Open it to answer.',
      answerFailed: 'The answer did not go through: open the session.',
      badge: '{n} need you',
      kBell: 'Tabs: notifications',
      kTab: 'Tabs: tab 1–8, 9 = the last',
      kNext: 'Tabs: previous / next tab',
      kReopen: 'Tabs: reopen the last closed tab',
      kFocus: 'Tabs: move focus between panes',
      kRecent: 'Tabs: open a recent chat',
      recent: 'Recent chats (⌥O)',
      recentFind: 'Search chats and projects…',
      recentNone: 'No chat matches.',
      recentFoot: '↑↓ to pick · ⏎ opens it in a tab · Esc closes',
      fullPageTip: 'Open its full page (⌥F)',
      kClose: 'Tabs: close the focused pane',
      kFull: 'Tabs: full page of the focused pane',
      kDrawer: 'Tabs: show or hide the drawer',
      backToTabs: 'Back to tabs',
      backTip: 'Return to your tabs as you left them',
      openInTab: 'Open in a tab',
      openInTabTip: 'Show this session in its tab (or a new one at the end) and go there',
    }

    // -- the tree --------------------------------------------------------------------------------

    const uid = () => Math.random().toString(36).slice(2, 10)
    const clone = (x) => JSON.parse(JSON.stringify(x))
    const paneNode = (sid) => ({ id: uid(), type: 'pane', sid })
    const single = (sid) => { const n = paneNode(sid); return { id: uid(), root: n, focus: n.id } }
    const panesOf = (n) => (n.type === 'pane' ? [n] : n.children.flatMap(panesOf))
    const sidsOf = (n) => panesOf(n).map((p) => p.sid).filter(Boolean)
    function findIn(root, id, parent = null) {
      if (root.id === id) return { node: root, parent }
      if (root.type === 'split') for (const c of root.children) { const r = findIn(c, id, root); if (r) return r }
      return null
    }
    const paneById = (root, id) => { const r = id && findIn(root, id); return r && r.node.type === 'pane' ? r.node : null }
    const paneOfSid = (root, sid) => panesOf(root).find((p) => p.sid === sid) || null
    /** The active tab (the one on show), or null when no tab is open. */
    const cur = (d) => d.tabs.find((x) => x.id === d.active) || null
    const tabById = (d, id) => d.tabs.find((x) => x.id === id) || null
    const tabOf = (d, sid) => d.tabs.find((x) => sidsOf(x.root).includes(sid)) || null
    /** 'active' (in the active tab), 'tab' (in another tab) or 'drawer'. */
    const where = (d, sid) => { const x = tabOf(d, sid); return !x ? 'drawer' : x.id === d.active ? 'active' : 'tab' }
    /** Shown when no tab is open: one empty pane. */
    const EMPTY_VIEW = { id: '__none', root: { id: '__none', type: 'pane', sid: null }, focus: '__none', group: null }

    /** Replace `node` (found under `root`) by `next`; returns the new root. */
    function replaceNode(root, node, next) {
      const r = findIn(root, node.id)
      if (!r || !r.parent) return next
      r.parent.children[r.parent.children.indexOf(node)] = next
      return root
    }
    /** Take a pane out of a tree: sizes renormalize, a split left with one child collapses. Null when the tree is gone. */
    function dropPane(root, paneId) {
      if (root.id === paneId) return null
      const r = findIn(root, paneId)
      if (!r || !r.parent) return root
      const p = r.parent, i = p.children.indexOf(r.node)
      p.children.splice(i, 1); p.sizes.splice(i, 1)
      const tot = p.sizes.reduce((a, b) => a + b, 0) || 1
      p.sizes = p.sizes.map((x) => x / tot)
      if (p.children.length !== 1) return root
      const only = p.children[0]
      const pr = findIn(root, p.id)
      if (!pr.parent) return only
      const g = pr.parent, gi = g.children.indexOf(p)
      if (only.type === 'split' && only.dir === g.dir) {
        const gs = g.sizes[gi]
        g.children.splice(gi, 1, ...only.children); g.sizes.splice(gi, 1, ...only.sizes.map((x) => x * gs))
      } else g.children[gi] = only
      return root
    }
    /** Put `ins` beside a pane on `side`; joins the parent split when it runs the same way. */
    function splitAt(root, paneId, side, ins) {
      const r = findIn(root, paneId)
      if (!r) return root
      const dir = side === 'left' || side === 'right' ? 'row' : 'col'
      const after = side === 'right' || side === 'bottom'
      const flat = ins.type === 'split' && ins.dir === dir
      const items = flat ? ins.children : [ins]
      const isz = flat ? ins.sizes : [1]
      if (r.parent && r.parent.dir === dir) {
        const p = r.parent, i = p.children.indexOf(r.node), share = p.sizes[i] / 2
        p.sizes[i] = share
        const at = after ? i + 1 : i
        p.children.splice(at, 0, ...items); p.sizes.splice(at, 0, ...isz.map((x) => x * share))
        return root
      }
      const half = isz.map((x) => x * 0.5)
      const wrap = { id: uid(), type: 'split', dir,
        children: after ? [r.node, ...items] : [...items, r.node],
        sizes: after ? [0.5, ...half] : [...half, 0.5] }
      return replaceNode(root, r.node, wrap)
    }

    // -- moves (each works on a clone of the doc; {} commits, false does nothing) -----------------
    // The strip's order changes only in moves the user makes on it: opening a tab (at the end),
    // closing one, dragging one, grouping. Showing a tab (activate, next, nth) never reorders.

    const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange']
    const STRIP_W = 260, STRIP_MIN = 180, STRIP_MAX = 560
    const tabNode = (sid, group = null) => ({ ...single(sid), group })
    const indexOfTab = (d, id) => d.tabs.findIndex((x) => x.id === id)
    const insertAt = (d, i, x) => d.tabs.splice(Math.max(0, Math.min(i, d.tabs.length)), 0, x)
    const focusSid = (x, sid) => { const p = sid && paneOfSid(x.root, sid); if (p) x.focus = p.id }
    const remember = (d, sids) => { d.closed = [...sids, ...d.closed.filter((s) => !sids.includes(s))].slice(0, 10) }
    const lastOfGroup = (d, gid) => { let k = -1; d.tabs.forEach((x, i) => { if (x.group === gid) k = i }); return k }

    /** Remove a tab; when it was active, the next one below becomes active (the one above if it was last). */
    function removeTab(d, id) {
      const i = indexOfTab(d, id)
      if (i < 0) return
      d.tabs.splice(i, 1)
      if (d.active === id) d.active = d.tabs.length ? d.tabs[Math.min(i, d.tabs.length - 1)].id : null
    }
    /** Take a session out of the tab that holds it; a tab left empty goes. */
    function detach(d, sid) {
      const x = tabOf(d, sid)
      if (!x) return
      const nr = dropPane(x.root, paneOfSid(x.root, sid).id)
      if (!nr || !sidsOf(nr).length) removeTab(d, x.id)
      else x.root = nr
    }
    /** Members of a group sit together (at the first member's place); empty groups go; focus and active stay valid. */
    function normalize(d) {
      const ids = new Set(d.groups.map((g) => g.id))
      for (const x of d.tabs) {
        if (x.group && !ids.has(x.group)) x.group = null
        if (!paneById(x.root, x.focus)) x.focus = panesOf(x.root)[0].id
      }
      const seen = new Set(), out = []
      for (const x of d.tabs) {
        if (!x.group) { out.push(x); continue }
        if (seen.has(x.group)) continue
        seen.add(x.group)
        for (const y of d.tabs) if (y.group === x.group) out.push(y)
      }
      d.tabs = out
      d.groups = d.groups.filter((g) => seen.has(g.id))
      if (!cur(d)) d.active = d.tabs.length ? d.tabs[0].id : null
    }

    const M = {
      /** Show a tab (and focus `sid` in it). Nothing moves. */
      activate(d, tabId, sid) {
        const x = tabById(d, tabId)
        if (!x) return false
        const same = d.active === tabId
        d.active = tabId; focusSid(x, sid)
        return same ? {} : { anim: true }
      },
      /** From the drawer, Recent or a notification: its tab, or a new tab at the end, ungrouped. */
      openSession(d, sid) {
        const x = tabOf(d, sid)
        if (x) return M.activate(d, x.id, sid)
        const n = tabNode(sid)
        d.tabs.push(n); d.active = n.id
        return { anim: true }
      },
      next(d, step) {
        if (!d.tabs.length) return false
        const i = indexOfTab(d, d.active)
        return M.activate(d, d.tabs[i < 0 ? 0 : (i + step + d.tabs.length) % d.tabs.length].id)
      },
      /** ⌥1…⌥8: tab n; ⌥9: the last tab (as Chrome). */
      nth(d, n) { const x = n === 9 ? d.tabs[d.tabs.length - 1] : d.tabs[n - 1]; return x ? M.activate(d, x.id) : false },
      focus(d, paneId) { const x = cur(d); if (!x || x.focus === paneId || !paneById(x.root, paneId)) return false; x.focus = paneId; return {} },
      closeTab(d, tabId) {
        const x = tabById(d, tabId)
        if (!x) return false
        remember(d, sidsOf(x.root)); removeTab(d, tabId)
        return { anim: true }
      },
      /** × on a pane or on a split's row: that session leaves; a tab left empty closes. No toast. */
      closeSession(d, sid) {
        const x = tabOf(d, sid)
        if (!x) return false
        if (sidsOf(x.root).length === 1) return M.closeTab(d, x.id)
        remember(d, [sid]); detach(d, sid)
        return {}
      },
      closePane(d, paneId) { const x = cur(d), p = x && paneById(x.root, paneId); return p && p.sid ? M.closeSession(d, p.sid) : false },
      reopen(d) {
        const sid = d.closed.find((s) => !tabOf(d, s))
        if (!sid) return false
        d.closed = d.closed.filter((s) => s !== sid)
        return M.openSession(d, sid)
      },
      /** A split's session gets its own tab, right after the split's tab (same group). */
      moveOut(d, sid) {
        const x = tabOf(d, sid)
        if (!x || sidsOf(x.root).length < 2) return false
        detach(d, sid)
        insertAt(d, indexOfTab(d, x.id) + 1, tabNode(sid, x.group))
        return {}
      },
      /** A split becomes one tab per session, in its place. */
      separate(d, tabId) {
        const x = tabById(d, tabId)
        const s = x ? sidsOf(x.root) : []
        if (s.length < 2) return false
        const fs = paneById(x.root, x.focus)?.sid
        const parts = s.map((sid) => tabNode(sid, x.group))
        d.tabs.splice(indexOfTab(d, tabId), 1, ...parts)
        if (d.active === tabId) d.active = (parts.find((p) => p.root.sid === fs) || parts[0]).id
        return {}
      },
      swapPanes(d, a, b) {
        const x = cur(d), pa = x && paneById(x.root, a), pb = x && paneById(x.root, b)
        if (!pa || !pb) return false
        ;[pa.sid, pb.sid] = [pb.sid, pa.sid]; x.focus = b; return {}
      },
      dropOnEmpty(d, drag) {
        if (drag.src === 'tab') return M.activate(d, drag.key)
        if (drag.src === 'session') return M.openSession(d, drag.key)
        return false
      },
      /** Drop on a pane's edge: put it beside (a dragged tab brings all its panes and leaves the strip). */
      join(d, paneId, side, drag) {
        const x = cur(d), target = x && paneById(x.root, paneId)
        if (!target || !target.sid) return M.dropOnEmpty(d, drag)
        const count = sidsOf(x.root).length
        let ins
        if (drag.src === 'tab') {
          const o = tabById(d, drag.key)
          if (!o || o === x) return false
          if (count + sidsOf(o.root).length > MAX_PANES) return { toast: ['fullTab'], keep: true }
          removeTab(d, o.id); ins = o.root
        } else if (drag.src === 'session') {
          if (target.sid === drag.key) return false
          if (!paneOfSid(x.root, drag.key) && count >= MAX_PANES) return { toast: ['fullSession'], keep: true }
          detach(d, drag.key); ins = paneNode(drag.key)
        } else return false
        x.root = splitAt(x.root, paneId, side, ins)
        x.focus = panesOf(ins)[0].id
        return {}
      },
      /** Drop on a pane's centre: it takes that place; the one it replaces gets its own tab, in the
       *  dropped tab's slot when a tab came from the strip (the two swap), else right after this tab. */
      replacePane(d, paneId, drag) {
        const x = cur(d), target = x && paneById(x.root, paneId)
        if (!target || !target.sid) return M.dropOnEmpty(d, drag)
        const out = target.sid
        let ins, slot = indexOfTab(d, x.id) + 1, group = x.group
        if (drag.src === 'tab') {
          const o = tabById(d, drag.key)
          if (!o || o === x) return false
          if (sidsOf(x.root).length - 1 + sidsOf(o.root).length > MAX_PANES) return { toast: ['fullTab'], keep: true }
          slot = indexOfTab(d, o.id); group = o.group; d.tabs.splice(slot, 1); ins = o.root
        } else if (drag.src === 'session') {
          if (drag.key === out) return false
          const op = paneOfSid(x.root, drag.key)
          if (op) return M.swapPanes(d, op.id, paneId)
          const o = tabOf(d, drag.key)
          if (o && sidsOf(o.root).length === 1) { slot = indexOfTab(d, o.id); group = o.group }
          detach(d, drag.key); ins = paneNode(drag.key)
        } else return false
        x.root = replaceNode(x.root, paneById(x.root, paneId), ins)
        x.focus = panesOf(ins)[0].id
        insertAt(d, slot, tabNode(out, group))
        return {}
      },
      /** Drop on the strip: before tab index `i`, into `group` (null: ungrouped). A session from a split
       *  gets its own tab there; one from the drawer opens there. A group moves as a whole. */
      toStrip(d, drag, i, group) {
        if (group && !d.groups.some((g) => g.id === group)) group = null
        if (drag.src === 'group') {
          if (!d.groups.some((g) => g.id === drag.key)) return false
          const members = d.tabs.filter((x) => x.group === drag.key)
          const anchor = d.tabs.slice(i).find((x) => x.group !== drag.key) || null
          d.tabs = d.tabs.filter((x) => x.group !== drag.key)
          d.tabs.splice(anchor ? d.tabs.indexOf(anchor) : d.tabs.length, 0, ...members)
          return {}
        }
        let anchor = d.tabs[i] || null, x = null, fresh = false
        if (drag.src === 'tab') x = tabById(d, drag.key)
        else if (drag.src === 'session') {
          const o = tabOf(d, drag.key)
          if (o && sidsOf(o.root).length === 1) x = o
          else { if (o) detach(d, drag.key); x = tabNode(drag.key); fresh = !o }
        }
        if (!x) return false
        if (anchor === x) anchor = d.tabs[d.tabs.indexOf(x) + 1] || null
        const k = d.tabs.indexOf(x)
        if (k >= 0) d.tabs.splice(k, 1)
        const at = anchor ? d.tabs.indexOf(anchor) : -1
        d.tabs.splice(at < 0 ? d.tabs.length : at, 0, x)
        x.group = group || null
        if (fresh) { d.active = x.id; return { anim: true } }
        return {}
      },
      toDrawer(d, drag) {
        if (drag.src === 'tab') return M.closeTab(d, drag.key)
        if (drag.src === 'group') return M.closeGroup(d, drag.key)
        if (drag.src === 'session') return M.closeSession(d, drag.key)
        return false
      },
      /** Sessions that are gone (deleted, archived): out of the strip and the reopen list. */
      forget(d, sids) {
        let any = false
        for (const s of sids) { if (tabOf(d, s)) { detach(d, s); any = true } }
        const n = d.closed.length
        d.closed = d.closed.filter((s) => !sids.includes(s))
        return any || n !== d.closed.length ? {} : false
      },
      resize(d, splitId, i, a) {
        const x = cur(d), r = x && findIn(x.root, splitId)
        if (!r || r.node.type !== 'split') return false
        const s = r.node.sizes, pair = s[i - 1] + s[i]
        s[i - 1] = a; s[i] = pair - a; return {}
      },
      // groups
      newGroup(d, tabId, gid) {
        const x = tabById(d, tabId)
        if (!x) return false
        if (x.group) M.ungroupTab(d, tabId)
        const used = new Set(d.groups.map((g) => g.color))
        const color = GROUP_COLORS.find((c) => !used.has(c)) || GROUP_COLORS[d.groups.length % GROUP_COLORS.length]
        const g = { id: gid || uid(), name: '', color, collapsed: false }
        d.groups.push(g); x.group = g.id
        return {}
      },
      addToGroup(d, tabId, gid) {
        const x = tabById(d, tabId)
        if (!x || x.group === gid || !d.groups.some((g) => g.id === gid)) return false
        d.tabs.splice(d.tabs.indexOf(x), 1)
        d.tabs.splice(lastOfGroup(d, gid) + 1, 0, x); x.group = gid
        return {}
      },
      /** Out of its group: it goes right after the group (as Chrome). */
      ungroupTab(d, tabId) {
        const x = tabById(d, tabId)
        if (!x || !x.group) return false
        const gid = x.group, k = d.tabs.indexOf(x)
        d.tabs.splice(k, 1)
        const last = lastOfGroup(d, gid)
        d.tabs.splice(last < 0 ? k : last + 1, 0, x); x.group = null
        return {}
      },
      ungroup(d, gid) {
        if (!d.groups.some((g) => g.id === gid)) return false
        for (const x of d.tabs) if (x.group === gid) x.group = null
        d.groups = d.groups.filter((g) => g.id !== gid)
        return {}
      },
      closeGroup(d, gid) {
        const ms = d.tabs.filter((x) => x.group === gid)
        if (!ms.length) return false
        remember(d, ms.flatMap((x) => sidsOf(x.root)))
        for (const x of ms) removeTab(d, x.id)
        return { anim: true }
      },
      renameGroup(d, gid, name) { const g = d.groups.find((x) => x.id === gid); if (!g) return false; g.name = String(name || '').trim().slice(0, 60); return {} },
      colorGroup(d, gid, color) { const g = d.groups.find((x) => x.id === gid); if (!g || !GROUP_COLORS.includes(color)) return false; g.color = color; return {} },
      toggleGroup(d, gid, on) { const g = d.groups.find((x) => x.id === gid); if (!g) return false; g.collapsed = on === undefined ? !g.collapsed : !!on; return {} },
      /** Each ungrouped tab joins the group named after its project (made if missing, even for one
       *  tab). A split joins only when all its sessions share one project; a mixed split stays out. */
      groupByProject(d, projOf) {
        const by = new Map()
        for (const x of d.tabs) {
          if (x.group) continue
          const ps = [...new Set(sidsOf(x.root).map((s) => projOf[s] || ''))]
          const p = ps.length === 1 && ps[0]
          if (!p) continue
          if (!by.has(p)) by.set(p, [])
          by.get(p).push(x)
        }
        let any = false
        for (const [p, xs] of by) {
          let g = d.groups.find((y) => y.name === p)
          if (!g) { M.newGroup(d, xs[0].id); g = d.groups[d.groups.length - 1]; g.name = p }
          for (const x of xs) x.group = g.id
          any = true
        }
        return any ? {} : false
      },
      setStrip(d, patch) { d.strip = { ...d.strip, ...patch }; return {} },
      setCatchClicks(d, on) { d.catchClicks = on; return {} },
      setQuiet(d, on) { d.quiet = on; return {} },
    }

    // -- store: the doc, persisted to the Host ---------------------------------------------------

    function freshDoc() {
      return { version: 3, tabs: [], active: null, groups: [], strip: { mode: 'vertical', width: STRIP_W }, closed: [], catchClicks: true, quiet: false }
    }
    const validTree = (n) => n && typeof n.id === 'string' && (n.type === 'pane'
      ? (n.sid === null || typeof n.sid === 'string')
      : n.type === 'split' && (n.dir === 'row' || n.dir === 'col') && Array.isArray(n.children) && n.children.length > 1
        && Array.isArray(n.sizes) && n.sizes.length === n.children.length && n.children.every(validTree))
    /** Empty panes out of a tree that has sessions. */
    function cleanTree(root) {
      for (const p of panesOf(root)) if (!p.sid && root) root = dropPane(root, p.id)
      return root
    }
    /** The saved doc, checked; anything else starts fresh. */
    function fromSaved(v) {
      const f = freshDoc()
      if (!v || v.version !== 3 || !Array.isArray(v.tabs)) return f
      const d = { ...f, active: v.active ?? null, catchClicks: v.catchClicks !== false, quiet: !!v.quiet }
      d.strip = { mode: v.strip?.mode === 'horizontal' ? 'horizontal' : 'vertical', width: Number(v.strip?.width) || STRIP_W }
      d.groups = Array.isArray(v.groups) ? v.groups.filter((g) => g && typeof g.id === 'string') : []
      d.closed = Array.isArray(v.closed) ? v.closed.filter((s) => typeof s === 'string') : []
      d.tabs = v.tabs.filter((x) => x && typeof x.id === 'string' && validTree(x.root) && sidsOf(x.root).length)
        .map((x) => ({ id: x.id, root: cleanTree(x.root), focus: x.focus, group: typeof x.group === 'string' ? x.group : null }))
      normalize(d)
      return d
    }

    function createStore() {
      let doc = freshDoc()
      let loaded = false, error = null, seq = 0, toast = null
      const listeners = new Set()
      let snapshot = { doc, loaded, error, seq, toast }
      const publish = () => { snapshot = { doc, loaded, error, seq, toast }; for (const fn of listeners) fn() }
      let saveTimer
      const save = () => {
        clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          fetch(STATE_ROUTE, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(doc) })
            .then((r) => r.json()).then((r) => { if (!r.ok) console.warn('dsh-tabs: save failed', r.error) })
            .catch((e) => console.warn('dsh-tabs: save failed', e))
        }, 400)
      }
      return {
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
        get: () => snapshot,
        doc: () => doc,
        async load() {
          try {
            const r = await (await fetch(STATE_ROUTE, { headers: { accept: 'application/json' } })).json()
            if (!r.ok) throw new Error(r.error)
            if (r.value) doc = fromSaved(r.value)
          } catch (e) { error = e instanceof Error ? e.message : String(e) }
          loaded = true
          publish()
        },
        dispose() { clearTimeout(saveTimer) },
        /** Run one move on a clone; commit unless it returned false (or only a refusal toast). */
        run(name, ...args) {
          const d = clone(doc)
          const r = M[name](d, ...args)
          if (r === false) return
          if (r.toast) toast = { key: r.toast[0], vars: r.toast[1] || {}, id: uid() }
          if (r.keep) { publish(); return }
          normalize(d)
          doc = d
          if (r.anim) seq++
          publish(); save()
        },
        clearToast(id) { if (toast && toast.id === id) { toast = null; publish() } },
        toast(key, vars) { toast = { key, vars: vars || {}, id: uid() }; publish() },
      }
    }

    // -- styles (theme tokens only; project colours are data) ------------------------------------

    const mix = (v, pct) => `color-mix(in srgb, var(${v}) ${pct}%, transparent)`
    const BRAND = '--dsw-alias-brand-primary', WARN = '--dsw-alias-state-warn-primary', OK = '--dsw-alias-state-success-primary', ERR = '--dsw-alias-state-error-primary'
    const CSS = `
.${P}-page{display:flex;flex-direction:column;height:100%;min-height:0;min-width:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;position:relative;overflow:hidden}
.${P}-bar{display:flex;align-items:center;gap:4px;height:38px;padding:0 8px 0 14px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none;min-width:0}
.${P}-name{font-weight:600;margin-right:8px;white-space:nowrap}
.${P}-cur{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;white-space:nowrap}
.${P}-cur .${P}-pj{color:var(--dsw-alias-label-secondary)}
.${P}-cur .${P}-sep2{color:var(--dsw-alias-label-tertiary)}
.${P}-cur b{font-weight:600;overflow:hidden;text-overflow:ellipsis}
.${P}-grow{flex:1;min-width:8px}
.${P}-x{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 8px;border-radius:6px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap;cursor:pointer;font-variant-numeric:tabular-nums}
.${P}-x:hover,.${P}-x[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.${P}-x.${P}-plain{cursor:default}.${P}-x.${P}-plain:hover{background:transparent;color:var(--dsw-alias-label-secondary)}
.${P}-rpop{position:absolute;top:44px;left:8px;z-index:46;width:400px;max-width:calc(100% - 16px);max-height:min(520px,calc(100% - 60px));display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l3);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.3);overflow:hidden;animation:${P}-popin .12s ease-out}
.${P}-rpop input{margin:10px 10px 6px;padding:6px 10px;border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;outline:none}
.${P}-rpop input:focus{border-color:var(${BRAND})}
.${P}-rlist{overflow-y:auto;overflow-x:hidden;padding:0 6px 6px}
.${P}-rrow{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:7px;cursor:pointer;min-width:0}
.${P}-rrow.${P}-on{background:var(--dsw-alias-interactive-bg-hover)}
.${P}-rrow b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}
.${P}-rrow .${P}-rp{color:var(--dsw-alias-label-tertiary);font-size:11.5px;white-space:nowrap;max-width:40%;overflow:hidden;text-overflow:ellipsis}
.${P}-rrow .${P}-rw{color:var(--dsw-alias-label-tertiary);font-size:10.5px;white-space:nowrap}
.${P}-scrim{position:absolute;inset:0;z-index:60;background:rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;animation:${P}-in .16s ease-out}
.${P}-pop{width:600px;max-width:calc(100% - 32px);max-height:calc(100% - 48px);overflow:auto;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l3);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.3);padding:16px 20px;line-height:1.5;color:var(--dsw-alias-label-secondary);animation:${P}-popin .12s ease-out}
.${P}-pop h3{margin:0 0 6px;font-size:15px;color:var(--dsw-alias-label-primary)}
.${P}-pop table{border-collapse:collapse;width:100%;margin-top:10px;font-size:12.5px}
.${P}-pop td{padding:5px 8px;border-top:.5px solid var(--dsw-alias-border-l1);vertical-align:top}
.${P}-pop td:first-child{white-space:nowrap;color:var(--dsw-alias-label-primary);font-weight:500;width:1%}
.${P}-pop b{color:var(--dsw-alias-label-primary)}
.${P}-pop label{display:flex;gap:8px;align-items:center;margin-top:10px;color:var(--dsw-alias-label-primary);cursor:pointer}
.${P}-body{flex:1;display:flex;gap:6px;padding:6px;min-height:0;min-width:0}
.${P}-body.${P}-hz{padding-top:4px}
.${P}-strip{flex:none;display:flex;flex-direction:column;min-height:0;border-radius:8px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l2);box-sizing:border-box;position:relative}
.${P}-shead{display:flex;align-items:center;gap:4px;padding:6px 6px 4px 10px;color:var(--dsw-alias-label-secondary);font-size:12px;flex:none}
.${P}-shead b{color:var(--dsw-alias-label-primary)}
.${P}-slist{flex:1;overflow-y:auto;overflow-x:hidden;padding:2px 6px 8px;display:flex;flex-direction:column;gap:2px;position:relative}
.${P}-strip.${P}-drag .${P}-slist{background:${mix(BRAND, 5)}}
.${P}-wgrip{position:absolute;top:0;bottom:0;right:-5px;width:8px;cursor:col-resize;z-index:5;border-radius:3px}
.${P}-wgrip:hover,.${P}-wgrip.${P}-on{background:${mix(BRAND, 22)}}
.${P}-pempty{color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center;padding:24px 8px;white-space:pre-wrap;line-height:1.5}
.${P}-tab{position:relative;display:flex;gap:7px;padding:6px 24px 6px 6px;border-radius:7px;border:.5px solid transparent;cursor:pointer;min-width:0;flex:none}
.${P}-tab:hover{background:var(--dsw-alias-interactive-bg-hover)}
.${P}-tab.${P}-on{background:var(--dsw-alias-bg-base);border-color:var(--dsw-alias-border-l3);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.${P}-tab.${P}-on .${P}-l1 b{color:var(--dsw-alias-label-primary)}
.${P}-tab.${P}-wait{border-color:${mix(WARN, 70)}}
.${P}-tab .${P}-pm{min-width:0;flex:1}
.${P}-close{position:absolute;right:3px;top:4px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);border-radius:5px;padding:0 5px;font-size:14px;line-height:18px;cursor:pointer;opacity:0}
.${P}-tab:hover>.${P}-close,.${P}-tab.${P}-on>.${P}-close,.${P}-sub:hover>.${P}-close,.${P}-bhead:hover>.${P}-close{opacity:1}
.${P}-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.${P}-blk{padding:4px 6px 4px 6px}
.${P}-bhead{position:relative;display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--dsw-alias-label-tertiary);text-transform:uppercase;letter-spacing:.05em;padding:0 22px 3px 2px}
.${P}-bhead .${P}-close{top:-3px;right:-3px}
.${P}-subs{display:flex;flex-direction:column;gap:1px;border-left:2px solid var(--dsw-alias-border-l3);margin-left:3px;padding-left:4px}
.${P}-blk.${P}-on .${P}-subs{border-left-color:var(${BRAND})}
.${P}-sub{position:relative;display:flex;gap:6px;padding:3px 22px 3px 4px;border-radius:5px;min-width:0;cursor:pointer}
.${P}-sub:hover{background:var(--dsw-alias-interactive-bg-hover)}
.${P}-sub.${P}-fx{background:${mix(BRAND, 10)}}
.${P}-sub .${P}-close{top:2px}
.${P}-grp{display:flex;flex-direction:column;gap:2px;border-left:2px solid var(--g);border-radius:0 0 0 4px;padding-left:4px;margin:3px 0}
.${P}-ghead{display:flex;align-items:center;gap:6px;padding:3px 6px 3px 4px;border-radius:6px;cursor:pointer;font-size:12px;min-width:0;flex:none;margin-left:-6px}
.${P}-ghead:hover{background:var(--dsw-alias-interactive-bg-hover)}
.${P}-gname{background:var(--g);color:var(--dsw-alias-bg-base);font-weight:600;border-radius:5px;padding:0 7px;line-height:18px;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%}
.${P}-gname.${P}-unnamed{min-width:10px}
.${P}-gcount{color:var(--dsw-alias-label-tertiary);font-size:11px}
.${P}-chev{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:10px;transition:transform .15s}
.${P}-ghead.${P}-shut .${P}-chev{transform:rotate(-90deg)}
.${P}-ghead.${P}-wait{box-shadow:inset 0 0 0 1px var(${WARN});animation:${P}-glow 2s ease-in-out infinite}
.${P}-gw{color:var(${WARN});font-size:11px}
.${P}-cmenu{position:fixed;z-index:70;min-width:200px;max-width:280px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l3);border-radius:9px;box-shadow:0 10px 30px rgba(0,0,0,.3);padding:4px;display:flex;flex-direction:column;animation:${P}-popin .1s ease-out;font-size:12.5px}
.${P}-cmenu button{border:none;background:transparent;color:var(--dsw-alias-label-primary);text-align:left;padding:5px 10px;border-radius:5px;font-size:12.5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.${P}-cmenu button:hover{background:var(--dsw-alias-interactive-bg-hover)}
.${P}-cmenu hr{border:none;border-top:.5px solid var(--dsw-alias-border-l2);margin:4px 2px}
.${P}-cmenu input{margin:4px;padding:5px 8px;border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;outline:none}
.${P}-cmenu input:focus{border-color:var(${BRAND})}
.${P}-sw{display:flex;gap:6px;padding:4px 8px 6px}
.${P}-sw i{width:16px;height:16px;border-radius:50%;cursor:pointer;background:var(--g);box-sizing:border-box}
.${P}-sw i.${P}-on{box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1),0 0 0 3.5px var(--g)}
.${P}-hstrip{display:flex;align-items:stretch;gap:2px;height:34px;padding:4px 8px 0;border-bottom:.5px solid var(--dsw-alias-border-l2);flex:none;min-width:0;background:var(--dsw-alias-bg-layer-1)}
.${P}-hlist{flex:1;display:flex;align-items:stretch;gap:2px;min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
.${P}-hlist::-webkit-scrollbar{display:none}
.${P}-hstrip.${P}-drag .${P}-hlist{background:${mix(BRAND, 6)}}
.${P}-htab{position:relative;display:flex;align-items:center;gap:6px;flex:0 1 210px;min-width:72px;padding:0 22px 0 9px;border-radius:7px 7px 0 0;cursor:pointer;font-size:12px;color:var(--dsw-alias-label-secondary);border-top:2px solid var(--g,transparent);box-sizing:border-box}
.${P}-htab.${P}-joined{flex-basis:320px}
.${P}-htab:hover{background:var(--dsw-alias-interactive-bg-hover)}
.${P}-htab.${P}-on{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 -1px 0 .5px var(--dsw-alias-border-l2)}
.${P}-htab.${P}-wait{background:${mix(WARN, 10)}}
.${P}-htab b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}
.${P}-htab .${P}-close{top:50%;margin-top:-9px}
.${P}-htab:hover>.${P}-close,.${P}-htab.${P}-on>.${P}-close{opacity:1}
.${P}-hseg{display:flex;align-items:center;gap:5px;min-width:0;flex:1}
.${P}-hseg+.${P}-hseg{border-left:.5px solid var(--dsw-alias-border-l3);padding-left:6px}
.${P}-hseg.${P}-fx b{color:var(--dsw-alias-label-primary);font-weight:600}
.${P}-hgrp{display:flex;align-items:center;padding:0 2px 0 4px;cursor:pointer;flex:none}
.${P}-hgrp .${P}-gname{max-width:140px}
.${P}-hgrp.${P}-wait .${P}-gname{animation:${P}-glow 2s ease-in-out infinite}
.${P}-hind{width:3px;border-radius:2px;background:var(${BRAND});box-shadow:0 0 6px var(${BRAND});margin:4px -2.5px;flex:none}
.${P}-hstrip .${P}-dz{margin:2px 0 4px 6px;padding:0 10px;display:flex;align-items:center;font-size:11.5px}
.${P}-pbar{width:3px;border-radius:2px;flex:none;align-self:stretch}
.${P}-l1{display:flex;align-items:center;gap:6px;min-width:0}
.${P}-l1 b{font-weight:500;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.${P}-l2{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;padding-left:14px}
.${P}-l3{font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-top:3px;padding-left:14px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.${P}-s-waiting{color:var(${WARN})}.${P}-s-done{color:var(${OK})}
.${P}-ind{height:3px;border-radius:2px;background:var(${BRAND});box-shadow:0 0 6px var(${BRAND});margin:-2.5px 0;flex:none}
.${P}-dz{margin:0 8px 8px;padding:12px;text-align:center;border:2px dashed var(--dsw-alias-border-l3);border-radius:8px;color:var(--dsw-alias-label-secondary);font-size:12px;flex:none}
.${P}-dz.${P}-over{border-color:var(${BRAND});background:${mix(BRAND, 12)};color:var(${BRAND})}
.${P}-mini{display:inline-flex;width:22px;height:14px;border-radius:3px;overflow:hidden;gap:1px;flex:none}
.${P}-mini span{display:flex;flex:1;gap:1px}.${P}-mrow{flex-direction:row}.${P}-mcol{flex-direction:column}
.${P}-mini i{flex:1;opacity:.7}.${P}-mini i.${P}-mw{opacity:1;box-shadow:inset 0 0 0 1.5px var(${WARN})}
.${P}-pill{font-size:10.5px;padding:0 6px;border-radius:8px;line-height:16px;white-space:nowrap}
.${P}-pill.${P}-s-waiting{background:${mix(WARN, 16)}}.${P}-pill.${P}-s-running{color:var(${BRAND});background:${mix(BRAND, 12)}}
.${P}-ib{border:none;background:transparent;color:var(--dsw-alias-label-tertiary);border-radius:5px;padding:1px 6px;cursor:pointer;font-size:13px;line-height:18px}
.${P}-ib:hover,.${P}-ib[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.${P}-panes{flex:1;position:relative;min-width:0;min-height:0}
.${P}-pane{position:absolute;display:flex;flex-direction:column;min-width:0;min-height:0;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);overflow:hidden}
.${P}-pane.${P}-emptytab{border:1px dashed var(--dsw-alias-border-l3);background:transparent}
.${P}-tb{opacity:.5}.${P}-pane:hover .${P}-tb,.${P}-tb[aria-pressed=true]{opacity:1}.${P}-tb[aria-pressed=true]{color:var(${BRAND})}
.${P}-wb{font-size:15px}.${P}-xb:hover{color:var(${ERR})}
.${P}-multi .${P}-pane:not(.${P}-focus){border-color:transparent;background:var(--dsw-alias-bg-layer-1)}
.${P}-multi .${P}-pane:not(.${P}-focus) .${P}-pbody{opacity:.45;filter:saturate(.5);transition:opacity .15s}
.${P}-multi .${P}-pane:not(.${P}-focus):hover .${P}-pbody{opacity:.7}
.${P}-multi .${P}-pane:not(.${P}-focus) .${P}-head b{color:var(--dsw-alias-label-secondary);font-weight:500}
.${P}-head{display:flex;align-items:center;gap:8px;height:34px;padding:0 4px 0 10px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none;cursor:grab;color:var(--dsw-alias-label-secondary);font-size:12px;min-width:0;background:var(--dsw-alias-bg-layer-1)}
.${P}-multi .${P}-pane:not(.${P}-focus) .${P}-head{background:transparent}
.${P}-grip{color:var(--dsw-alias-label-tertiary);letter-spacing:-2px}
.${P}-head b{color:var(--dsw-alias-label-primary);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.${P}-head .${P}-proj{color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:0 1 auto}
.${P}-head .${P}-st{margin-left:auto;white-space:nowrap;color:var(--dsw-alias-label-tertiary)}
.${P}-head .${P}-pbar{height:14px;align-self:center}
.${P}-btns{display:flex;align-items:center;gap:1px;flex:none;position:relative}
.${P}-pbody{flex:1;display:flex;flex-direction:column;min-height:0;position:relative}
.${P}-fill{flex:1;min-height:0;display:flex;flex-direction:column}
.${P}-side{position:absolute;top:0;right:0;bottom:0;width:min(420px,72%);z-index:12;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);border-left:.5px solid var(--dsw-alias-border-l2);box-shadow:-10px 0 28px rgba(0,0,0,.18);animation:${P}-sidein .18s ease-out}
.${P}-sideh{display:flex;align-items:center;gap:6px;height:30px;padding:0 6px 0 12px;border-bottom:.5px solid var(--dsw-alias-border-l1);font-size:12px;font-weight:600;flex:none}
.${P}-sideb{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column}
@keyframes ${P}-sidein{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
.${P}-tool{font-size:11.5px;padding:1px 7px}
.${P}-tool[aria-pressed=true]{background:${mix(BRAND, 18)};color:var(${BRAND})}
.${P}-act{display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:1px 7px;border-radius:9px;border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);background:transparent;cursor:pointer;white-space:nowrap}
.${P}-act.${P}-live{color:var(${BRAND});border-color:${mix(BRAND, 50)};background:${mix(BRAND, 10)}}
.${P}-amenu{position:absolute;right:0;top:26px;z-index:30;width:300px;max-height:340px;overflow:auto;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l3);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);padding:6px;animation:${P}-popin .12s ease-out;cursor:default;font-size:12px}
.${P}-amenu h4{margin:4px 6px;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--dsw-alias-label-tertiary)}
.${P}-arow{display:flex;align-items:center;gap:7px;padding:5px 6px;border-radius:6px;min-width:0}
.${P}-arow.${P}-click{cursor:pointer}
.${P}-arow.${P}-click:hover{background:var(--dsw-alias-interactive-bg-hover)}
.${P}-arow b{font-weight:500;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${P}-arow i{font-style:normal;color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap}
.${P}-ext{display:inline-flex;align-items:center;gap:4px;position:relative}
.${P}-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--dsw-alias-label-tertiary);text-align:center;padding:20px;white-space:pre-wrap}
.${P}-empty button{border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:8px;padding:3px 10px;cursor:pointer}
.${P}-drop{position:absolute;z-index:25;pointer-events:none;background:${mix(BRAND, 14)};border:2px dashed var(${BRAND});border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(${BRAND});font-size:12px;font-weight:600;text-align:center;padding:6px}
.${P}-drop.${P}-no{background:${mix(ERR, 10)};border-color:var(${ERR});color:var(${ERR})}
.${P}-div{position:absolute;z-index:10}
.${P}-div.${P}-drow{cursor:col-resize}.${P}-div.${P}-dcol{cursor:row-resize}
.${P}-div:hover,.${P}-div.${P}-on{background:${mix(BRAND, 18)};border-radius:3px}
.${P}-dot{width:8px;height:8px;border-radius:50%;flex:none;box-sizing:border-box;border:1.5px solid var(--dsw-alias-label-tertiary)}
.${P}-dot.${P}-done{border:none;background:var(${OK})}
.${P}-dot.${P}-waiting{border:none;background:var(${WARN});animation:${P}-pulse 1.6s ease-in-out infinite}
.${P}-dot.${P}-running{border-color:var(${BRAND});border-top-color:transparent;animation:${P}-spin .8s linear infinite}
.${P}-toast{pointer-events:auto;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border:.5px solid var(--dsw-alias-border-l3);border-left:3px solid var(${BRAND});border-radius:8px;padding:8px 12px;font-size:12.5px;line-height:1.45;box-shadow:0 10px 30px rgba(0,0,0,.25);animation:${P}-slide .18s ease-out}
.${P}-toast.${P}-warn{border-left-color:var(${WARN})}
.${P}-error{color:var(${ERR});font-size:12px;padding:6px 12px}
.${P}-bell{position:relative;width:30px;justify-content:center;padding:0}
.${P}-bell.${P}-quiet{color:var(${BRAND})}
.${P}-bdot{position:absolute;top:1px;right:0;min-width:14px;height:14px;padding:0 3px;border-radius:7px;background:var(${WARN});color:var(--dsw-alias-bg-base);font-size:9.5px;font-weight:700;line-height:14px;text-align:center;box-sizing:border-box}
.${P}-npop{position:absolute;top:40px;right:8px;width:360px;max-width:calc(100% - 16px);max-height:min(560px,calc(100% - 56px));z-index:45;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l3);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.3);overflow:hidden;animation:${P}-popin .12s ease-out}
.${P}-nh{display:flex;align-items:center;gap:6px;padding:9px 12px 7px;font-size:12px}
.${P}-nh b{flex:1}
.${P}-chip{border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:5px;padding:1px 7px;font-size:11px;cursor:pointer}
.${P}-chip[aria-pressed=true]{color:var(${BRAND});border-color:var(${BRAND});background:${mix(BRAND, 12)}}
.${P}-link{border:none;background:none;color:var(${BRAND});font-size:11.5px;cursor:pointer;padding:0}
.${P}-nlist{overflow-y:auto;overflow-x:hidden;padding:0 8px 8px;display:flex;flex-direction:column;gap:6px}
.${P}-nempty{color:var(--dsw-alias-label-tertiary);text-align:center;padding:26px 0}
.${P}-nfoot{color:var(--dsw-alias-label-tertiary);font-size:10.5px;padding:6px 12px;border-top:.5px solid var(--dsw-alias-border-l1)}
.${P}-card{background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px 10px;min-width:0}
.${P}-card .${P}-ch{display:flex;align-items:center;gap:6px;min-width:0}
.${P}-card .${P}-ch b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.${P}-card .${P}-ct{color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap}
.${P}-card .${P}-cx{border:none;background:none;color:var(--dsw-alias-label-tertiary);padding:0 5px;border-radius:4px;cursor:pointer;opacity:0}
.${P}-card:hover .${P}-cx{opacity:1}.${P}-card .${P}-cx:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.${P}-ck{color:var(${WARN});font-size:11px;margin:1px 0 3px 9px}
.${P}-cb{color:var(--dsw-alias-label-secondary);font-size:12px;white-space:pre-wrap;word-break:break-word;margin-left:9px;max-height:54px;overflow:hidden}
.${P}-cb code{font-family:var(--ds-font-family-code);font-size:11.5px}
.${P}-ca{display:flex;flex-wrap:wrap;gap:5px;margin:7px 0 0 9px}
.${P}-ca button{border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:6px;padding:2px 9px;font-size:11.5px;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${P}-ca button:disabled{opacity:.5;cursor:default}
.${P}-ca button.${P}-pri{background:var(--dsw-alias-button-primary-fill);border-color:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.${P}-ca button.${P}-pri:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.${P}-ca button.${P}-open{margin-left:auto;background:none;color:var(--dsw-alias-label-secondary)}
.${P}-banners{position:absolute;top:48px;right:16px;z-index:44;display:flex;flex-direction:column;gap:8px;width:340px;max-width:calc(100% - 20px);pointer-events:none}
.${P}-banner{pointer-events:auto;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.3);animation:${P}-slide .18s ease-out}
.${P}-banner .${P}-card{background:var(--dsw-alias-bg-layer-3);border-color:var(--dsw-alias-border-l3)}
@keyframes ${P}-slide{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:none}}
@keyframes ${P}-popin{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
@keyframes ${P}-glow{0%,100%{box-shadow:0 0 0 2px ${mix(WARN, 22)}}50%{box-shadow:0 0 0 4px ${mix(WARN, 10)}}}
@keyframes ${P}-in{from{opacity:0}to{opacity:1}}
@keyframes ${P}-pulse{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes ${P}-spin{to{transform:rotate(360deg)}}
`

    // -- helpers ---------------------------------------------------------------------------------

    const basename = (p) => (typeof p === 'string' ? p.replace(/\/+$/, '').split('/').pop() : '')
    function hue(s) { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x % 360 }
    const pcol = (proj) => (proj ? `hsl(${hue(proj)} 55% 58%)` : 'var(--dsw-alias-border-l3)')
    function ago(t) {
      if (!t) return ''
      const m = Math.max(0, Math.round((Date.now() - t) / 60e3))
      return m < 1 ? 'now' : m < 60 ? m + ' m' : m < 1440 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' d'
    }
    const clock = () => { const d = new Date(); return d.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }
    function pendingKey(kind) {
      const k = String(kind || '').toLowerCase()
      return k.includes('approv') || k.includes('permission') ? 'approval' : k.includes('plan') ? 'plan' : k.includes('question') || k.includes('ask') ? 'question' : 'waiting'
    }

    /** Layout a tree into fractional rects: panes and the dividers between split children. */
    function layoutTree(node, x, y, w, hh, out) {
      if (node.type === 'pane') { out.panes.push({ node, x, y, w, h: hh }); return out }
      let off = 0
      node.children.forEach((c, i) => {
        const s = node.sizes[i]
        if (node.dir === 'row') {
          if (i) out.divs.push({ split: node, i, dir: 'row', at: x + off * w, x, y, w, h: hh })
          layoutTree(c, x + off * w, y, s * w, hh, out)
        } else {
          if (i) out.divs.push({ split: node, i, dir: 'col', at: y + off * hh, x, y, w, h: hh })
          layoutTree(c, x, y + off * hh, w, s * hh, out)
        }
        off += s
      })
      return out
    }
    const pct = (f) => `${(f * 100).toFixed(3)}%`

    /** Region of a pane under the pointer: centre unless within 22% of an edge; the header is centre. */
    function region(e, el) {
      const r = el.getBoundingClientRect()
      const head = el.querySelector(`.${P}-head`)
      if (head && e.clientY <= head.getBoundingClientRect().bottom) return 'center'
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height
      const dl = fx, dr = 1 - fx, dt = fy, db = 1 - fy, m = Math.min(dl, dr, dt, db)
      if (m > 0.22) return 'center'
      return m === dl ? 'left' : m === dr ? 'right' : m === dt ? 'top' : 'bottom'
    }
    const HB = 34   // pane header height: the overlay covers the body only
    const REGION_BOX = {
      center: { left: 0, top: HB, right: 0, bottom: 0 },
      left: { left: 0, top: HB, bottom: 0, width: '50%' }, right: { right: 0, top: HB, bottom: 0, width: '50%' },
      top: { left: 0, right: 0, top: HB, height: `calc((100% - ${HB}px) / 2)` }, bottom: { left: 0, right: 0, bottom: 0, height: `calc((100% - ${HB}px) / 2)` },
    }
    const EMPTY_BOX = { left: 0, top: 0, right: 0, bottom: 0 }

    // Current internal drag ({src:'session'|'tab'|'group', key}); a drawer drag has none until the drop.
    let currentDrag = null
    function dragOf(e) {
      if (currentDrag) return currentDrag
      const raw = e.dataTransfer.getData(MIME)
      if (raw) { try { return JSON.parse(raw) } catch (_) { /* fall through */ } }
      const id = e.dataTransfer.getData('text/plain')
      return id ? { src: 'session', key: id.trim() } : null
    }
    const acceptsDrag = (e) => { const ty = Array.from(e.dataTransfer.types); return ty.includes(MIME) || ty.includes('text/plain') }

    // -- components ------------------------------------------------------------------------------

    /** Fixed Chat selection inside an embedded Conversation (as the sidebar subagent chat does). */
    function FixedChatView(props) { return props.renderSlot('conversation.session', { view: 'chat' }) }

    /** `tabs.pane` occupant (scope session): the shared Conversation content, embedded. */
    function TabConversation({ useSession, useConversation, renderFactorySlot }) {
      const session = useSession((value) => value)
      const conversation = useConversation((value) => value)
      if (session === undefined) return null
      const shellPhase = (conversation?.activeTargets?.size ?? 0) > 0 || (!session.blank && !session.awaitingFirstTurn) || session.running
        ? 'active' : session.promptAttempted ? 'engaging' : 'blank'
      const settling = shellPhase === 'blank' && session.openState === 'loading'
      const hero = shellPhase === 'blank' && session.openState === 'open'
      return renderFactorySlot('conversation.content', {
        variant: 'embedded',
        phase: settling ? 'settling' : hero ? 'hero' : 'active',
        hero,
      }, { slots: { views: FixedChatView } })
    }

    /** Around optional parts (activity chip, recent list, side panel, menu-bar seat): a failure hides the part, not the page. */
    class Quiet extends React.Component {
      constructor(p) { super(p); this.state = { error: null } }
      static getDerivedStateFromError(error) { return { error } }
      componentDidCatch(error) { console.error('dsh-tabs: ' + (this.props.name || 'part') + ' failed', error) }
      render() { return this.state.error ? null : this.props.children }
    }
    /** A crash in one pane leaves the others (and the page) standing. */
    class PaneBoundary extends React.Component {
      constructor(props) { super(props); this.state = { error: null } }
      static getDerivedStateFromError(error) { return { error } }
      componentDidCatch(error) { console.error('dsh-tabs: pane crashed', error) }
      componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }) }
      render() {
        if (this.state.error === null) return this.props.children
        return h('div', { className: `${P}-empty` }, h('div', null, this.props.t('crashed')),
          h('button', { onClick: this.props.onOpenFull }, this.props.t('fullPage') + ' ⤢'))
      }
    }

    /** Hold one reference while mounted; release on unmount or when the id changes. */
    function useRetained(sessions, sessionId) {
      const [ref, setRef] = useState(null)
      useEffect(() => {
        if (!sessionId) return undefined
        let target = sessionId
        try { target = (typeof sessions.subagentAddress === 'function' && sessions.subagentAddress(sessionId)) || sessionId } catch (_) { target = sessionId }
        const reference = sessions.retain(target, { source: SOURCE })
        setRef(reference)
        return () => { setRef(null); reference.release() }
      }, [sessions, sessionId])
      return ref !== null && ref.sessionId === sessionId ? ref : null
    }

    const noSub = () => () => {}
    const noSnap = () => null
    /** Subagents and background jobs of one chat: a chip in the pane header, a list on click. */
    function PaneActivity({ sid, node, t, api }) {
      const J = api.jobsSvc()
      const JS = api.jobsState()
      const list = useSyncExternalStore(api.sessions.list.subscribe, api.sessions.list.getSnapshot)
      const jobsSnap = useSyncExternalStore(JS ? JS.subscribe : noSub, JS ? JS.getSnapshot : noSnap)
      const [open, setOpen] = useState(false)
      const boxRef = useRef(null)
      const parentRunning = !!list?.byId?.[sid]?.running
      useEffect(() => {
        if (!J || typeof J.watchRows !== 'function') return undefined
        try { return J.watchRows(sid) } catch (e) { console.warn('dsh-tabs: watchRows', e); return undefined }
      }, [J, sid])
      useEffect(() => {
        try { const r = api.sessions.refreshProjections && api.sessions.refreshProjections(sid); if (r && r.catch) r.catch(() => {}) } catch (_) { /* best effort */ }
      }, [sid, parentRunning, open])
      useEffect(() => {
        if (!open) return undefined
        const off = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
        window.addEventListener('pointerdown', off, true)
        return () => window.removeEventListener('pointerdown', off, true)
      }, [open])
      const cat = list?.projectionsBySession?.[sid]?.values?.subagentCatalog ?? []
      const jobs = jobsSnap?.rows?.[sid] ?? []
      if (!cat.length && !jobs.length) return null
      const subRun = cat.filter((c) => list.byId?.[c.id]?.running).length
      const jobRun = jobs.filter((j) => j.status === 'running' || j.status === 'stopping').length
      const parts = []
      if (cat.length) parts.push(subRun ? '◇ ' + subRun : '◇ ' + cat.length)
      if (jobs.length) parts.push(jobRun ? '⚙ ' + jobRun : '⚙ ' + jobs.length)
      const tip = [cat.length ? t(subRun ? 'actSubRun' : 'actSub', { n: subRun || cat.length }) : null,
        jobs.length ? t(jobRun ? 'actJobRun' : 'actJob', { n: jobRun || jobs.length }) : null].filter(Boolean).join(' · ')
      const live = subRun + jobRun > 0
      return h('span', { ref: boxRef, className: `${P}-ext` },
        h('button', { className: `${P}-act${live ? ` ${P}-live` : ''}`, title: tip + ' — ' + t('actTip'), 'aria-pressed': open, onClick: () => setOpen(!open) },
          live ? h(Dot, { st: { k: 'running' } }) : null, parts.join('  ')),
        open ? h('div', { className: `${P}-amenu` },
          cat.length ? h('h4', null, t('actSubs')) : null,
          ...[...cat].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map((c) => {
            const e = list.byId?.[c.id]
            const run = !!e?.running
            return h('div', { key: c.id, className: `${P}-arow ${P}-click`, title: e?.displayTitle || c.id,
              onClick: () => { setOpen(false); api.store.run('join', node.id, 'right', { src: 'session', key: c.id }) } },
            h(Dot, { st: { k: run ? 'running' : 'idle' } }),
            h('b', null, c.label || e?.displayTitle || c.id.slice(0, 8)),
            h('i', null, (c.mode && c.mode !== 'unknown' ? c.mode + ' · ' : '') + ago(c.createdAt)))
          }),
          jobs.length ? h('h4', null, t('actJobs')) : null,
          ...jobs.map((j) => {
            const run = j.status === 'running' || j.status === 'stopping'
            return h('div', { key: j.id, className: `${P}-arow`, title: [j.label, j.detail].filter(Boolean).join('\n') },
              h(Dot, { st: { k: run ? 'running' : j.status === 'failed' ? 'waiting' : 'idle' } }),
              h('b', null, j.label || j.kind || j.id),
              h('i', null, j.status + (j.progress != null && run ? ` · ${Math.round(j.progress * (j.progress <= 1 ? 100 : 1))}%` : '')),
              run && J && J.kill ? h('button', { className: `${P}-ib ${P}-xb`, title: t('actKill'), onClick: () => { try { const r = J.kill(sid, j.id); if (r && r.catch) r.catch(() => {}) } catch (_) { /* ignore */ } } }, '×') : null)
          })) : null)
    }

    /** Recent chats, searchable by title and project; a pick opens it in a tab. */
    function Recent({ list, info, t, api, doc, onClose }) {
      const [q, setQ] = useState('')
      const [sel, setSel] = useState(0)
      const inRef = useRef(null)
      useEffect(() => { inRef.current && inRef.current.focus() }, [])
      const WL = api.workspacesList()
      const wsSnap = useSyncExternalStore(WL ? WL.subscribe : noSub, WL ? WL.getSnapshot : noSnap)
      const archived = useMemo(() => new Set(wsSnap?.archivedSessionIds ?? []), [wsSnap])
      const words = q.toLowerCase().split(/\s+/).filter(Boolean)
      const rows = []
      for (const id of list?.ids ?? []) {
        const e = list.byId[id]
        if (!e || e.parentId || e.origin === 'subagent' || e.blank || archived.has(id)) continue
        const hay = (e.displayTitle + ' ' + basename(e.cwd)).toLowerCase()
        if (words.every((w) => hay.includes(w))) rows.push(e)
      }
      rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      const shown = rows.slice(0, 60)
      const cur = Math.min(sel, Math.max(0, shown.length - 1))
      const pick = (e) => { if (!e) return; onClose(); api.store.run('openSession', e.id) }
      const onKey = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(cur + 1, shown.length - 1)) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(cur - 1, 0)) }
        else if (e.key === 'Enter') { e.preventDefault(); pick(shown[cur]) }
        else if (e.key === 'Escape') { e.preventDefault(); onClose() }
      }
      const listRef = useRef(null)
      useEffect(() => { const el = listRef.current && listRef.current.children[cur]; if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }) }, [cur])
      return h('div', { className: `${P}-rpop` },
        h('input', { ref: inRef, value: q, placeholder: t('recentFind'), onChange: (e) => { setQ(e.target.value); setSel(0) }, onKeyDown: onKey }),
        h('div', { ref: listRef, className: `${P}-rlist` },
          ...shown.map((e, i) => {
            const s = info(e.id)
            const w = where(doc, e.id)
            return h('div', { key: e.id, className: `${P}-rrow${i === cur ? ` ${P}-on` : ''}`, onMouseEnter: () => setSel(i), onClick: () => pick(e) },
              h('span', { className: `${P}-pbar`, style: { background: pcol(s.proj), height: 14 } }),
              h(Dot, { st: s.st }),
              h('b', { title: e.displayTitle }, e.displayTitle),
              h('span', { className: `${P}-rp` }, s.proj),
              h('span', { className: `${P}-rw` }, w === 'active' ? t('onActive') : w === 'tab' ? t('inTab', { n: doc.tabs.indexOf(tabOf(doc, e.id)) + 1 }) : ago(e.updatedAt)))
          }),
          shown.length ? null : h('div', { className: `${P}-nempty` }, t('recentNone'))),
        h('div', { className: `${P}-nfoot` }, t('recentFoot')))
    }

    function Dot({ st }) { return h('span', { className: `${P}-dot ${P}-${st.k}` }) }

    function Mini({ node, info }) {
      const rec = (n) => n.type === 'pane'
        ? h('i', { key: n.id, className: n.sid && info(n.sid).st.k === 'waiting' ? `${P}-mw` : '', style: { background: n.sid ? pcol(info(n.sid).proj) : 'var(--dsw-alias-border-l2)' } })
        : h('span', { key: n.id, className: n.dir === 'row' ? `${P}-mrow` : `${P}-mcol` }, n.children.map(rec))
      return h('span', { className: `${P}-mini` }, rec(node))
    }

    function statusLabel(st, t, at) {
      if (st.k === 'waiting') return t(pendingKey(st.kind))
      if (st.k === 'running') return t('running')
      if (st.k === 'done') return t('done')
      return at ? t('idle', { ago: ago(at) }) : t('idleNow')
    }

    const GROUP_HSL = { grey: 'hsl(220 8% 58%)', blue: 'hsl(214 78% 62%)', red: 'hsl(2 70% 62%)', yellow: 'hsl(44 85% 55%)', green: 'hsl(142 48% 50%)', pink: 'hsl(330 68% 66%)', purple: 'hsl(268 58% 68%)', cyan: 'hsl(186 62% 50%)', orange: 'hsl(26 85% 60%)' }
    const gcol = (g) => GROUP_HSL[g && g.color] || GROUP_HSL.grey

    /** A tab's lines: title (the full title on hover), then status · project · age, then the ask when waiting. */
    function TabLines({ sid, info, t }) {
      const s = info(sid)
      return h(React.Fragment, null,
        h('div', { className: `${P}-l1` }, h(Dot, { st: s.st }), h('b', null, s.title)),
        h('div', { className: `${P}-l2` },
          h('span', { className: `${P}-s-${s.st.k}` }, statusLabel(s.st, t, s.at)), s.proj ? ' · ' + s.proj : ''),
        s.st.k === 'waiting' ? h('div', { className: `${P}-l3` }, s.ask || t('answerHint', { what: t(pendingKey(s.st.kind)) })) : null)
    }

    /** FLIP for the strip, run only when the order changes (open, close, drag, group): a moved row
     *  slides from its old place, a new one fades in. Switching tabs changes nothing, so nothing moves. */
    function useStripSlide(listRef, orderKey, horizontal) {
      const prev = useRef(null)
      const lastKey = useRef(null)
      useLayoutEffect(() => {
        const el = listRef.current
        if (!el) { prev.current = null; return }
        const changed = lastKey.current !== null && lastKey.current !== orderKey
        lastKey.current = orderKey
        const next = new Map()
        for (const node of el.querySelectorAll('[data-k]')) {
          const id = node.getAttribute('data-k'), at = horizontal ? node.offsetLeft : node.offsetTop
          next.set(id, at)
          if (!changed || prev.current === null || typeof node.animate !== 'function') continue
          const old = prev.current.get(id)
          if (old === undefined) {
            node.animate([{ opacity: 0, transform: horizontal ? 'translateY(6px)' : 'translateX(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: EASE })
            node.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          } else if (Math.abs(old - at) > 1) {
            node.animate([{ transform: horizontal ? `translateX(${old - at}px)` : `translateY(${old - at}px)` }, { transform: 'none' }], { duration: 220, easing: EASE })
          }
        }
        prev.current = next
      })
    }

    /** The right-click menu of a tab or a group (Chrome's). */
    function StripMenu({ menu, doc, info, t, api, onClose }) {
      const ref = useRef(null)
      const [pos, setPos] = useState({ left: menu.x, top: menu.y })
      useLayoutEffect(() => {
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        setPos({ left: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 6)), top: Math.max(4, Math.min(menu.y, window.innerHeight - r.height - 6)) })
      }, [menu.x, menu.y, menu.kind, menu.id])
      useEffect(() => {
        const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
        window.addEventListener('pointerdown', onDown, true)
        window.addEventListener('keydown', onKey, true)
        return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey, true) }
      }, [onClose])
      const run = (...a) => { api.store.run(...a); onClose() }
      const item = (label, fn, key) => h('button', { key: key || label, onClick: fn, title: label }, label)
      let body = []
      if (menu.kind === 'tab') {
        const x = tabById(doc, menu.id)
        if (!x) return null
        const n = sidsOf(x.root).length
        body = [
          item(t('newGroup'), () => { const gid = uid(); api.store.run('newGroup', x.id, gid); api.openMenu({ kind: 'group', id: gid, x: menu.x, y: menu.y, naming: true }) }),
          ...doc.groups.filter((g) => g.id !== x.group).map((g) => item(t('addTo', { g: g.name || t('groupUnnamed', { n: doc.tabs.filter((y) => y.group === g.id).length }) }), () => run('addToGroup', x.id, g.id), 'add-' + g.id)),
          x.group ? item(t('ungroupTab'), () => run('ungroupTab', x.id)) : null,
          n > 1 ? h('hr', { key: 'hr0' }) : null,
          n > 1 ? item(t('separate'), () => run('separate', x.id)) : null,
          h('hr', { key: 'hr1' }),
          item(n > 1 ? t('closeSplit', { n }) : t('closeTab'), () => run('closeTab', x.id)),
        ]
      } else if (menu.kind === 'group') {
        const g = doc.groups.find((y) => y.id === menu.id)
        if (!g) return null
        const n = doc.tabs.filter((y) => y.group === g.id).length
        body = [
          h('input', {
            key: 'name', defaultValue: g.name, placeholder: t('groupName'), autoFocus: true,
            onKeyDown: (e) => { if (e.key === 'Enter') { api.store.run('renameGroup', g.id, e.currentTarget.value); onClose() } },
            onBlur: (e) => { if (e.currentTarget.value !== g.name) api.store.run('renameGroup', g.id, e.currentTarget.value) },
          }),
          h('div', { key: 'sw', className: `${P}-sw` }, ...GROUP_COLORS.map((c) => h('i', {
            key: c, title: c, className: g.color === c ? `${P}-on` : '', style: { '--g': GROUP_HSL[c] },
            onClick: () => api.store.run('colorGroup', g.id, c),
          }))),
          h('hr', { key: 'hr0' }),
          item(g.collapsed ? t('expand') : t('collapse'), () => run('toggleGroup', g.id)),
          item(t('ungroup'), () => run('ungroup', g.id)),
          item(t('closeGroup', { n }), () => run('closeGroup', g.id)),
        ]
      } else if (menu.kind === 'strip') {
        const projOf = {}
        for (const x of doc.tabs) for (const s of sidsOf(x.root)) projOf[s] = info(s).proj
        const hz = doc.strip.mode === 'horizontal'
        body = [
          item(t('groupByProject'), () => run('groupByProject', projOf)),
          item(hz ? t('vertical') : t('horizontal'), () => run('setStrip', { mode: hz ? 'vertical' : 'horizontal' })),
          doc.closed.some((s) => !tabOf(doc, s)) ? item(t('reopen'), () => run('reopen')) : null,
        ]
      }
      return h('div', { ref, className: `${P}-cmenu`, style: pos, onContextMenu: (e) => e.preventDefault() }, ...body.filter(Boolean))
    }

    /** The tab strip: every tab in the user's order, groups as runs; vertical (resizable) or horizontal. */
    function TabStrip({ doc, info, t, api, dragging, pageRef }) {
      const hz = doc.strip.mode === 'horizontal'
      const listRef = useRef(null)
      const [ind, setInd] = useState(null)     // {i, group, at: data-k of the element it sits before | null}
      const [dz, setDz] = useState(false)
      const [w, setW] = useState(null)         // live width while dragging the edge
      const orderKey = doc.tabs.map((x) => x.id + ':' + (x.group || '') + ':' + sidsOf(x.root).join(',')).join('|') + '#' + doc.groups.map((g) => g.id + (g.collapsed ? '-' : '+')).join(',')
      useStripSlide(listRef, orderKey, hz)
      useEffect(() => { if (!dragging) { setInd(null); setDz(false) } }, [dragging])
      // keep the active tab in sight (⌥1…9, ⌥[ ⌥], a drawer click on an open session)
      useEffect(() => {
        const el = listRef.current && listRef.current.querySelector(`[data-k="${doc.active}"]`)
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }, [doc.active, hz])

      /** Where a drop lands: before the first element past the pointer; at a group's edge, the half of
       *  the row you are on decides whether it joins that group. A group drags between top-level items. */
      const placeAt = (e) => {
        const drag = currentDrag
        const sel = drag && drag.src === 'group' ? '[data-top]' : '[data-i]'
        const els = listRef.current ? Array.from(listRef.current.querySelectorAll(sel)) : []
        const pos = hz ? e.clientX : e.clientY
        let k = els.findIndex((el) => { const r = el.getBoundingClientRect(); return pos < (hz ? r.left + r.width / 2 : r.top + r.height / 2) })
        const E = k < 0 ? null : els[k], Prev = k < 0 ? els[els.length - 1] : els[k - 1]
        const i = E ? Number(E.getAttribute('data-i')) : doc.tabs.length
        if (drag && drag.src === 'group') return { i, group: null, at: E ? E.getAttribute('data-k') : null }
        const gOf = (el) => (el && el.hasAttribute('data-tab') ? el.getAttribute('data-g') || null : null)
        let group = E && E.hasAttribute('data-tab') ? gOf(E) : null
        if (Prev && gOf(Prev) && gOf(Prev) !== group) {
          const r = Prev.getBoundingClientRect()
          if (pos <= (hz ? r.right : r.bottom) + 2) group = gOf(Prev)
        }
        return { i, group, at: E ? E.getAttribute('data-k') : null }
      }
      const over = (e) => {
        if (!acceptsDrag(e)) return
        e.preventDefault(); e.dataTransfer.dropEffect = 'move'
        const p = placeAt(e)
        if (!ind || ind.i !== p.i || ind.group !== p.group || ind.at !== p.at) setInd(p)
      }
      const drop = (e) => {
        const drag = dragOf(e)
        const p = placeAt(e)
        setInd(null)
        if (!drag) return
        e.preventDefault(); api.endDrag()
        api.store.run('toStrip', drag, p.i, p.group)
      }
      const leave = (e) => { if (!listRef.current || !listRef.current.contains(e.relatedTarget)) setInd(null) }
      const startDrag = (e, drag, text) => {
        e.stopPropagation()
        currentDrag = drag
        e.dataTransfer.setData(MIME, JSON.stringify(drag))
        if (text) e.dataTransfer.setData('text/plain', text)
        e.dataTransfer.effectAllowed = 'move'
        api.beginDrag()
      }
      const ctxMenu = (e, kind, id) => { e.preventDefault(); e.stopPropagation(); api.openMenu({ kind, id, x: e.clientX, y: e.clientY }) }
      const closeBtn = (title, fn) => h('button', {
        className: `${P}-close`, title, draggable: false,
        onMouseDown: (e) => e.stopPropagation(),
        onClick: (e) => { e.stopPropagation(); fn() },
      }, '×')
      const indAt = (k) => (ind && ind.at === k ? h('div', { key: 'ind-' + k, className: hz ? `${P}-hind` : `${P}-ind` }) : null)
      const groupOf = (x) => (x.group ? doc.groups.find((g) => g.id === x.group) : null)
      const tip = (x, n) => {
        const s = sidsOf(x.root)
        return t('tabTip', { t: s.map((sid) => info(sid).title).join('\n'), p: [...new Set(s.map((sid) => info(sid).proj).filter(Boolean))].join(', '), n: n < 9 ? ` · ⌥${n + 1}` : '' })
      }

      // one tab (a single session or a split block)
      const renderTab = (x, idx, top) => {
        const sids = sidsOf(x.root)
        const on = x.id === doc.active
        const g = groupOf(x)
        const waiting = sids.some((s) => info(s).st.k === 'waiting')
        const base = {
          key: x.id, 'data-k': x.id, 'data-i': idx, 'data-tab': '', 'data-g': x.group || '', ...(top ? { 'data-top': '' } : {}),
          title: tip(x, idx), draggable: true,
          onDragStart: (e) => startDrag(e, { src: 'tab', key: x.id }, sids.length === 1 ? sids[0] : null),
          onDragEnd: api.endDrag,
          onContextMenu: (e) => ctxMenu(e, 'tab', x.id),
          onMouseDown: (e) => { if (e.button === 1) { e.preventDefault(); api.store.run('closeTab', x.id) } },
          onClick: () => api.store.run('activate', x.id),
        }
        const fx = on ? paneById(x.root, x.focus)?.sid : null
        if (hz) {
          return h('div', { ...base, className: `${P}-htab${on ? ` ${P}-on` : ''}${waiting && !on ? ` ${P}-wait` : ''}${sids.length > 1 ? ` ${P}-joined` : ''}`, style: g ? { '--g': gcol(g) } : undefined },
            ...sids.map((s) => {
              const si = info(s)
              return h('span', {
                key: s, className: `${P}-hseg${s === fx && sids.length > 1 ? ` ${P}-fx` : ''}`,
                onClick: sids.length > 1 ? (e) => { e.stopPropagation(); api.store.run('activate', x.id, s) } : undefined,
              }, h(Dot, { st: si.st }), h('b', null, si.title))
            }),
            closeBtn(sids.length > 1 ? t('closeSplit', { n: sids.length }) : t('itemClose'), () => api.store.run('closeTab', x.id)))
        }
        if (sids.length === 1) {
          return h('div', { ...base, className: `${P}-tab${on ? ` ${P}-on` : ''}${waiting && !on ? ` ${P}-wait` : ''}` },
            h('div', { className: `${P}-pm` }, h(TabLines, { sid: sids[0], info, t })),
            closeBtn(t('itemClose'), () => api.store.run('closeTab', x.id)))
        }
        return h('div', { ...base, className: `${P}-tab ${P}-blk${on ? ` ${P}-on` : ''}${waiting && !on ? ` ${P}-wait` : ''}` },
          h('div', { className: `${P}-pm` },
            h('div', { className: `${P}-bhead` }, h(Mini, { node: x.root, info }), t('split', { n: sids.length }),
              closeBtn(t('closeSplit', { n: sids.length }), () => api.store.run('closeTab', x.id))),
            h('div', { className: `${P}-subs` }, ...sids.map((s) => h('div', {
              key: s, className: `${P}-sub${s === fx ? ` ${P}-fx` : ''}`, draggable: true,
              onDragStart: (e) => startDrag(e, { src: 'session', key: s }, s),
              onDragEnd: api.endDrag,
              onClick: (e) => { e.stopPropagation(); api.store.run('activate', x.id, s) },
            },
            h('div', { className: `${P}-pm` }, h(TabLines, { sid: s, info, t })),
            closeBtn(t('itemClose'), () => api.store.run('closeSession', s)))))))
      }

      // the strip: ungrouped tabs and group runs, in order
      const children = []
      const cnt = {}
      doc.tabs.forEach((x) => { for (const s of sidsOf(x.root)) { const k = info(s).st.k; cnt[k] = (cnt[k] || 0) + 1 } })
      for (let i = 0; i < doc.tabs.length;) {
        const x = doc.tabs[i]
        const g = groupOf(x)
        if (!g) { children.push(indAt(x.id), renderTab(x, i, true)); i++; continue }
        const start = i
        const members = []
        while (i < doc.tabs.length && doc.tabs[i].group === g.id) { members.push([doc.tabs[i], i]); i++ }
        const hiddenWait = g.collapsed && members.some(([y]) => y.id !== doc.active && sidsOf(y.root).some((s) => info(s).st.k === 'waiting'))
        const label = g.name || ''
        const head = {
          key: 'gh-' + g.id, 'data-k': 'gh-' + g.id, 'data-i': start, 'data-top': '', 'data-gh': g.id, draggable: true,
          title: t('groupTip', { n: members.length }),
          onClick: () => api.store.run('toggleGroup', g.id),
          onContextMenu: (e) => ctxMenu(e, 'group', g.id),
          onDragStart: (e) => startDrag(e, { src: 'group', key: g.id }, null),
          onDragEnd: api.endDrag,
        }
        const shown = members.filter(([y]) => !g.collapsed || y.id === doc.active)
        if (hz) {
          children.push(indAt('gh-' + g.id),
            h('div', { ...head, className: `${P}-hgrp${hiddenWait ? ` ${P}-wait` : ''}`, style: { '--g': gcol(g) } },
              h('span', { className: `${P}-gname${label ? '' : ` ${P}-unnamed`}` }, label || (g.collapsed ? String(members.length) : ''))),
            ...shown.flatMap(([y, k]) => [indAt(y.id), renderTab(y, k, false)]))
        } else {
          children.push(indAt('gh-' + g.id), h('div', { key: 'g-' + g.id, className: `${P}-grp`, style: { '--g': gcol(g) } },
            h('div', { ...head, className: `${P}-ghead${g.collapsed ? ` ${P}-shut` : ''}${hiddenWait ? ` ${P}-wait` : ''}` },
              h('span', { className: `${P}-gname${label ? '' : ` ${P}-unnamed`}` }, label || '\u00a0'),
              h('span', { className: `${P}-gcount` }, String(members.length)),
              hiddenWait ? h('span', { className: `${P}-gw` }, '●') : null,
              h('span', { className: `${P}-chev` }, '▾')),
            ...shown.flatMap(([y, k]) => [indAt(y.id), renderTab(y, k, false)])))
        }
      }
      if (ind && ind.at === null) children.push(h('div', { key: 'ind-end', className: hz ? `${P}-hind` : `${P}-ind` }))

      const zone = dragging ? h('div', {
        key: 'dz', className: `${P}-dz${dz ? ` ${P}-over` : ''}`,
        onDragOver: (e) => { if (!acceptsDrag(e)) return; e.preventDefault(); if (!dz) setDz(true) },
        onDragLeave: () => setDz(false),
        onDrop: (e) => { const drag = dragOf(e); setDz(false); if (!drag) return; e.preventDefault(); api.endDrag(); api.store.run('toDrawer', drag) },
      }, t('drawerZone')) : null
      const plus = h('button', { className: `${P}-ib ${P}-rbtn`, title: t('newTab'), onClick: () => api.toggleRecent() }, '+')
      const more = h('button', { className: `${P}-ib`, title: t('stripMenu'), onClick: (e) => { const r = e.currentTarget.getBoundingClientRect(); api.openMenu({ kind: 'strip', id: 'strip', x: r.left, y: r.bottom + 4 }) } }, '⋯')
      const listProps = { ref: listRef, onDragOver: over, onDragLeave: leave, onDrop: drop }

      if (hz) {
        return h('div', { className: `${P}-hstrip${dragging ? ` ${P}-drag` : ''}` },
          h('div', { ...listProps, className: `${P}-hlist` }, ...children.filter(Boolean)),
          plus, more, zone)
      }

      // the edge: drag to resize (180–560 px, at most 45% of the page), double-click to reset
      const width = w ?? doc.strip.width ?? STRIP_W
      const maxW = () => Math.min(STRIP_MAX, Math.round((pageRef.current ? pageRef.current.getBoundingClientRect().width : 1200) * 0.45))
      const onGrip = (e) => {
        e.preventDefault()
        const x0 = e.clientX, w0 = width
        let last = w0
        const move = (ev) => { last = Math.max(STRIP_MIN, Math.min(maxW(), Math.round(w0 + ev.clientX - x0))); setW(last) }
        const up = () => {
          window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
          document.body.style.cursor = ''
          setW(null)
          if (last !== w0) api.store.run('setStrip', { width: last })
        }
        document.body.style.cursor = 'col-resize'
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
      }
      const pills = [['waiting', 'pillWait'], ['running', 'pillRun']].filter(([k]) => cnt[k])
      return h('div', { className: `${P}-strip${dragging ? ` ${P}-drag` : ''}`, style: { width } },
        h('div', { className: `${P}-shead` }, h('b', null, t('tabs')), h('span', null, String(doc.tabs.length)),
          ...pills.map(([k, key]) => h('span', { key: k, className: `${P}-pill ${P}-s-${k}` }, t(key, { n: cnt[k] }))),
          h('span', { className: `${P}-grow` }), plus, more),
        h('div', { ...listProps, className: `${P}-slist` },
          ...(doc.tabs.length ? children.filter(Boolean) : [h('div', { key: 'e', className: `${P}-pempty` }, t('stripEmpty'))])),
        zone,
        h('div', { className: `${P}-wgrip${w !== null ? ` ${P}-on` : ''}`, title: t('widthTip'), onPointerDown: onGrip,
          onDoubleClick: () => api.store.run('setStrip', { width: STRIP_W }) }))
    }

    function Pane({ node, rect, focused, inSplit, info, t, api, SessionProvider, renderSlot }) {
      const sid = node.sid
      const ref = useRetained(api.sessions, sid)
      const elRef = useRef(null)
      const [hint, setHint] = useState(null)  // {region, text, ok}
      const [side, setSide] = useState(null)  // key of the open tabs.pane.side entry
      const tools = api.sideTools()
      const s = sid ? info(sid) : null
      const onDragOver = (e) => {
        if (!acceptsDrag(e)) return
        const rg = region(e, elRef.current)
        const hn = api.hintFor(node.id, rg)
        if (!hn) { if (hint) setHint(null); return }
        e.preventDefault(); e.dataTransfer.dropEffect = hn.ok ? 'move' : 'none'
        if (!hint || hint.region !== rg || hint.text !== hn.text) setHint({ region: rg, ...hn })
      }
      const onDrop = (e) => {
        const drag = dragOf(e)
        const rg = region(e, elRef.current)
        setHint(null)
        if (!drag) return
        e.preventDefault(); api.endDrag()
        if (rg === 'center') api.store.run('replacePane', node.id, drag)
        else api.store.run('join', node.id, rg, drag)
      }
      const onDragLeave = (e) => { if (!elRef.current.contains(e.relatedTarget)) setHint(null) }
      const style = {
        left: `calc(${pct(rect.x)} + 3px)`, top: `calc(${pct(rect.y)} + 3px)`,
        width: `calc(${pct(rect.w)} - 6px)`, height: `calc(${pct(rect.h)} - 6px)`,
      }
      const drop = hint ? h('div', { className: `${P}-drop${hint.ok ? '' : ` ${P}-no`}`, style: sid ? REGION_BOX[hint.region] : EMPTY_BOX }, hint.text) : null
      if (!sid) {
        return h('section', { ref: elRef, className: `${P}-pane ${P}-emptytab`, style, onDragOver, onDragLeave, onDrop },
          h('div', { className: `${P}-empty` },
            h('div', { style: { fontSize: 28, opacity: 0.4 } }, '▦'),
            h('div', null, t('noTab')),
            h('div', { style: { fontSize: 11 } }, t('noTabHint'))), drop)
      }
      const onDragStart = (e) => {
        currentDrag = { src: 'session', key: sid }
        e.dataTransfer.setData(MIME, JSON.stringify(currentDrag))
        e.dataTransfer.setData('text/plain', sid)
        e.dataTransfer.effectAllowed = 'move'
        api.beginDrag()
      }
      const stop = (e) => e.stopPropagation()
      const head = h('div', {
        className: `${P}-head`, draggable: true, title: t('headTip'),
        onDragStart, onDragEnd: api.endDrag,
      },
      h('span', { className: `${P}-grip` }, '⋮⋮'),
      h('span', { className: `${P}-pbar`, style: { background: pcol(s.proj) } }),
      h(Dot, { st: s.st }),
      h('b', { title: s.title }, s.title),
      h('span', { className: `${P}-proj` }, s.proj),
      h('span', { className: `${P}-st ${P}-s-${s.st.k}` }, statusLabel(s.st, t, s.at)),
      h('span', { className: `${P}-btns`, onMouseDown: stop, onPointerDown: stop, draggable: false, onDragStart: (e) => { e.preventDefault(); e.stopPropagation() } },
        h(Quiet, { name: 'activity' }, h(PaneActivity, { sid, node, t, api })),
        ...tools.map((tl) => h('button', { key: 'tool-' + tl.key, className: `${P}-ib ${P}-tool`, title: tl.label, 'aria-pressed': side === tl.key,
          onClick: () => setSide(side === tl.key ? null : tl.key) }, tl.label)),
        h('button', { className: `${P}-ib ${P}-tb`, title: t('fullPageTip'), onClick: () => api.openFull(sid) }, '⤢'),
        inSplit ? h('button', { className: `${P}-ib ${P}-wb`, title: t('moveOut'), onClick: () => api.store.run('moveOut', sid) }, '⇱') : null,
        h('button', { className: `${P}-ib ${P}-wb ${P}-xb`, title: t('close'), onClick: () => api.store.run('closePane', node.id) }, '×')))
      // File links in the chat open the right sidebar, which has no seat on this page: catch the click
      // and open the file on the session's full page instead.
      const onClickCapture = (e) => {
        const chip = e.target.closest && e.target.closest('[data-ref-chip="file"]')
        const btn = e.target.closest && e.target.closest('button')
        let path = null
        if (chip) path = (chip.textContent || '').trim().replace(/^@/, '').replace(/^["'`]|["'`]$/g, '')
        else if (btn && String(btn.className).includes('fileLink') && btn.title) path = btn.title
        if (!path) return
        e.preventDefault(); e.stopPropagation()
        api.openFile(sid, path)
      }
      return h('section', {
        ref: elRef, className: `${P}-pane${focused ? ` ${P}-focus` : ''}`, style,
        onMouseDownCapture: () => { if (!focused) api.store.run('focus', node.id) },
        onFocusCapture: () => { if (!focused) api.store.run('focus', node.id) },
        onDragOver, onDragLeave, onDrop,
      }, head,
      h('div', { className: `${P}-pbody`, onClickCapture },
        ref === null
          ? h('div', { className: `${P}-empty` }, t('loading'))
          : h(PaneBoundary, { t, resetKey: sid, onOpenFull: () => api.openFull(sid) },
            h(SessionProvider, { session: ref, empty: () => h('div', { className: `${P}-empty` }, t('unknown')) },
              h('div', { className: `${P}-fill` }, renderSlot(PANE_SLOT, {})),
              side && tools.some((tl) => tl.key === side)
                ? h('div', { className: `${P}-side` },
                  h('div', { className: `${P}-sideh` }, h('span', null, tools.find((tl) => tl.key === side).label), h('span', { className: `${P}-grow` }),
                    h('button', { className: `${P}-ib ${P}-xb`, title: t('sideClose'), onClick: () => setSide(null) }, '×')),
                  h('div', { className: `${P}-sideb` }, h(Quiet, { name: 'side panel' }, renderSlot(SIDE_SLOT, {}, { entryKey: side, fallback: null }))))
                : null))),
      drop)
    }

    function Divider({ d, boxRef, api }) {
      const [on, setOn] = useState(false)
      const style = d.dir === 'row'
        ? { left: `calc(${pct(d.at)} - 3px)`, top: pct(d.y), width: 6, height: pct(d.h) }
        : { top: `calc(${pct(d.at)} - 3px)`, left: pct(d.x), height: 6, width: pct(d.w) }
      const onPointerDown = (e) => {
        e.preventDefault()
        const box = boxRef.current.getBoundingClientRect()
        const s = d.split.sizes
        let before = 0
        for (let k = 0; k < d.i - 1; k++) before += s[k]
        const pair = s[d.i - 1] + s[d.i]
        const row = d.dir === 'row'
        const span = row ? d.w * box.width : d.h * box.height
        const origin = row ? box.left + (d.x + before * d.w) * box.width : box.top + (d.y + before * d.h) * box.height
        const min = Math.min(pair / 2, (row ? 120 : 90) / Math.max(span, 1))
        setOn(true)
        const move = (ev) => {
          const a = ((row ? ev.clientX : ev.clientY) - origin) / span
          api.store.run('resize', d.split.id, d.i, Math.max(min, Math.min(pair - min, a)))
        }
        const up = () => { setOn(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }
      return h('div', { className: `${P}-div ${d.dir === 'row' ? `${P}-drow` : `${P}-dcol`}${on ? ` ${P}-on` : ''}`, style, onPointerDown })
    }

    // -- notifications: one per ask from a session in an open tab ---------------------------------

    let noteStore = null  // set by apply; read by the panel icon's badge
    function createNoteStore() {
      let list = [], open = false, snap = { list, open }
      const listeners = new Set(), timers = new Map()
      const publish = () => { snap = { list, open }; for (const fn of listeners) fn() }
      const self = {
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
        get: () => snap,
        /** Newest first; a new ask from the same session replaces its older note. */
        post(n, banner) {
          list = [{ ...n, banner }, ...list.filter((x) => x.sid !== n.sid)]
          if (banner) timers.set(n.id, setTimeout(() => { timers.delete(n.id); self.unbanner(n.id) }, 7000))
          publish()
        },
        unbanner(id) { if (list.some((x) => x.id === id && x.banner)) { list = list.map((x) => (x.id === id ? { ...x, banner: false } : x)); publish() } },
        drop(pred) { const n = list.length; list = list.filter((x) => !pred(x)); if (n !== list.length) publish() },
        setOpen(v) { open = v; if (v) list = list.map((x) => (x.banner ? { ...x, banner: false } : x)); publish() },
        dispose() { for (const t of timers.values()) clearTimeout(t); timers.clear() },
      }
      return self
    }
    /** What the ask says, and which answers fit on a card. */
    function describeAsk(p, t, api) {
      if (!p) return { kind: '', body: '', answers: [] }
      if (p.kind === 'approval') {
        let why = p.reason || ''
        if (p.displayReason) { try { why = api.resolveText(p.displayReason) || why } catch (_) { /* keep reason */ } }
        return { kind: t('approval'), body: (p.toolName ? p.toolName + (why ? ': ' : '') : '') + why,
          answers: [{ label: t('allow'), pri: true, value: 'allowed-once' }, { label: t('reject'), value: 'rejected' }] }
      }
      if (p.kind === 'plan-review') return { kind: t('plan'), body: t('planBody'), answers: [] }
      const qs = Array.isArray(p.questions) ? p.questions : []
      const q = qs[0]
      const body = q ? q.question : ''
      if (qs.length !== 1 || !q || q.multiSelect || !Array.isArray(q.options) || !q.options.length || q.options.length > 5) {
        return { kind: t('question'), body: body + (body ? '\n' : '') + t('openToAnswer'), answers: [] }
      }
      return { kind: t('question'), body, answers: q.options.map((o, i) => ({ label: o.label, title: o.description, pri: i === 0, value: { answers: [{ id: q.id, selected: [o.label] }] } })) }
    }
    function NoteCard({ n, info, t, api, banner }) {
      const [busy, setBusy] = useState(false)
      const i = info(n.sid)
      const ask = describeAsk(n.pending, t, api)
      const answer = (value) => {
        if (busy || !n.pending || n.pending.answerable === false) return
        setBusy(true)
        Promise.resolve().then(() => n.pending.answer(value))
          .then(() => api.notes.drop((x) => x.id === n.id))
          .catch((e) => { console.warn('dsh-tabs: answer failed', e); setBusy(false); api.toast('answerFailed') })
      }
      const stop = (e) => e.stopPropagation()
      return h('div', { className: `${P}-card`, onClick: banner ? () => api.openNote(n) : undefined, style: banner ? { cursor: 'pointer' } : undefined },
        h('div', { className: `${P}-ch` },
          h('span', { className: `${P}-pbar`, style: { background: pcol(i.proj), height: 13 } }),
          h('b', { title: i.proj + ' › ' + i.title }, i.title),
          h('span', { className: `${P}-ct` }, ago(n.at)),
          h('button', { className: `${P}-cx`, title: t('dismiss'), onClick: (e) => { stop(e); api.notes.drop((x) => x.id === n.id) } }, '×')),
        h('div', { className: `${P}-ck` }, [ask.kind, i.proj, (() => { const d = api.store.doc(), w = where(d, n.sid); return w === 'tab' ? t('inTab', { n: d.tabs.indexOf(tabOf(d, n.sid)) + 1 }) : w === 'active' ? t('onActive') : '' })()].filter(Boolean).join(' · ')),
        ask.body ? h('div', { className: `${P}-cb` }, ask.body) : null,
        h('div', { className: `${P}-ca`, onClick: stop },
          ...ask.answers.map((a, k) => h('button', { key: k, className: a.pri ? `${P}-pri` : '', title: a.title, disabled: busy, onClick: () => answer(a.value) }, a.label)),
          h('button', { className: ask.answers.length ? `${P}-open` : `${P}-pri`, title: t('openNoteTip'), onClick: () => api.openNote(n) }, t('openNote'))))
    }

    function useClock() {
      const [now, setNow] = useState(clock)
      useEffect(() => { const id = setInterval(() => setNow(clock()), 15e3); return () => clearInterval(id) }, [])
      return now
    }

    function TabsPage(props) {
      const api = props.api
      const raw = props.t ?? props.translate
      const t = useCallback((key, vars) => {
        let s = raw(key)
        if (typeof s !== 'string') s = EN[key] ?? key
        if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]))
        return s
      }, [raw])
      const snap = useSyncExternalStore(api.store.subscribe, api.store.get)
      const list = useSyncExternalStore(api.sessions.list.subscribe, api.sessions.list.getSnapshot)
      const statusMap = typeof props.useSessionStatus === 'function' ? props.useSessionStatus((v) => v) : null
      const [dragging, setDragging] = useState(false)
      const [help, setHelp] = useState(false)
      const [recent, setRecent] = useState(false)
      const [menu, setMenu] = useState(null)   // the strip's context menu {kind, id, x, y}
      api.toggleRecent = () => setRecent((v) => !v)
      api.openMenu = (m) => setMenu(m)
      const closeMenu = useCallback(() => setMenu(null), [])
      const pageRef = useRef(null)
      const notes = useSyncExternalStore(api.notes.subscribe, api.notes.get)
      const panesRef = useRef(null)
      const now = useClock()
      const { doc } = snap

      const info = (sid) => {
        const e = list?.byId?.[sid]
        const st = statusMap && typeof statusMap.get === 'function' ? statusMap.get(sid) : undefined
        const k = st?.pendingInteraction ? 'waiting' : (st?.running ?? e?.running) ? 'running' : st?.completionUnread ? 'done' : 'idle'
        let ask = ''
        if (k === 'waiting') { try { ask = describeAsk(st.pendingInteraction, t, api).body.split('\n')[0] } catch (_) { /* fall back to the hint */ } }
        return { title: e?.displayTitle || t('unknown'), proj: basename(e?.cwd), at: e?.updatedAt, st: { k, kind: st?.pendingInteraction?.kind }, ask }
      }
      api.info = info

      useEffect(() => {
        api.beginDrag = () => setDragging(true)
        api.endDrag = () => { currentDrag = null; setDragging(false) }
        const reset = () => { currentDrag = null; setDragging(false) }
        window.addEventListener('dragend', reset)
        window.addEventListener('drop', reset)
        return () => { window.removeEventListener('dragend', reset); window.removeEventListener('drop', reset) }
      }, [api])
      // the toast fades after a few seconds
      useEffect(() => {
        if (!snap.toast) return undefined
        const id = snap.toast.id
        const timer = setTimeout(() => api.store.clearToast(id), 5000)
        return () => clearTimeout(timer)
      }, [snap.toast, api])
      // a switched tab fades in
      const seen = useRef(snap.seq)
      useLayoutEffect(() => {
        if (seen.current === snap.seq) return
        seen.current = snap.seq
        const el = panesRef.current
        if (el && typeof el.animate === 'function') {
          el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' })
        }
      }, [snap.seq])
      // keys: ⌥1…8 tab n, ⌥9 the last, ⌥[ ⌥] previous / next, ⌥W close, ⌥⇧T reopen, ⌥arrows focus (not while typing)
      useEffect(() => {
        const onKey = (e) => {
          if (!e.altKey || e.metaKey || e.ctrlKey || !panesRef.current || !panesRef.current.isConnected) return
          const d = api.store.doc()
          if (e.code === 'KeyT' && e.shiftKey) { e.preventDefault(); api.store.run('reopen'); return }
          if (e.code === 'BracketLeft' || e.code === 'BracketRight') { e.preventDefault(); api.store.run('next', e.code === 'BracketLeft' ? -1 : 1); return }
          if (e.code === 'KeyB') { e.preventDefault(); api.toggleSidebar(); return }
          if (e.code === 'KeyO') { e.preventDefault(); api.toggleRecent(); return }
          const view = cur(d)
          const fp = view && paneById(view.root, view.focus)
          if (e.code === 'KeyW') { if (fp && fp.sid) { e.preventDefault(); api.store.run('closeSession', fp.sid) } return }
          if (e.code === 'KeyF') { if (fp && fp.sid) { e.preventDefault(); api.openFull(fp.sid) } return }
          const m = /^Digit([1-9])$/.exec(e.code)
          if (m) { e.preventDefault(); api.store.run('nth', Number(m[1])); return }
          const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
          const tg = e.target
          if (!dir || (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName)))) return
          if (!view) return
          const lay = layoutTree(view.root, 0, 0, 1, 1, { panes: [], divs: [] }).panes
          const here = lay.find((p) => p.node.id === view.focus)
          if (!here) return
          const cx = here.x + here.w / 2, cy = here.y + here.h / 2
          let best = null, bd = Infinity
          for (const p of lay) {
            if (p === here) continue
            const dx = p.x + p.w / 2 - cx, dy = p.y + p.h / 2 - cy
            if (dx * dir[0] + dy * dir[1] <= 0.01) continue
            const dist = Math.abs(dx) + Math.abs(dy)
            if (dist < bd) { bd = dist; best = p }
          }
          if (best) { e.preventDefault(); api.store.run('focus', best.node.id) }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [api])

      // the notifications pop-up closes on a click elsewhere or Esc
      useEffect(() => {
        if (!notes.open) return undefined
        const onDown = (e) => { if (!e.target.closest || (!e.target.closest(`.${P}-npop`) && !e.target.closest(`.${P}-bell`))) api.notes.setOpen(false) }
        const onKey = (e) => { if (e.key === 'Escape') api.notes.setOpen(false) }
        window.addEventListener('pointerdown', onDown, true)
        window.addEventListener('keydown', onKey)
        return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey) }
      }, [notes.open, api])
      useEffect(() => { if (help) api.notes.setOpen(false) }, [help, api])
      useEffect(() => {
        if (!recent) return undefined
        const onDown = (e) => { if (!e.target.closest || (!e.target.closest(`.${P}-rpop`) && !e.target.closest(`.${P}-rbtn`))) setRecent(false) }
        window.addEventListener('pointerdown', onDown, true)
        return () => window.removeEventListener('pointerdown', onDown, true)
      }, [recent])
      useEffect(() => {
        if (!help) return undefined
        const onKey = (e) => { if (e.key === 'Escape') setHelp(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [help])

      api.hintFor = (paneId, rg) => {
        const d = api.store.doc()
        const view = cur(d) || EMPTY_VIEW
        const target = paneById(view.root, paneId)
        if (!target) return null
        const drag = currentDrag || { src: 'session', key: null }
        if (drag.src === 'group') return null
        if (!target.sid) return { text: t('openHere'), ok: true, region: 'center' }
        if (drag.src === 'session' && drag.key === target.sid) return null
        if (drag.src === 'tab' && drag.key === view.id) return null
        const count = sidsOf(view.root).length
        const n = drag.src === 'tab' ? sidsOf(tabById(d, drag.key)?.root ?? paneNode(null)).length : 1
        const inView = drag.src === 'session' && drag.key && paneOfSid(view.root, drag.key)
        if (rg === 'center') {
          if (inView) return { text: t('swap'), ok: true }
          if (count - 1 + n > MAX_PANES) return { text: t('full'), ok: false }
          return { text: t('replace', { t: info(target.sid).title }), ok: true }
        }
        if (!inView && count + n > MAX_PANES) return { text: t('full'), ok: false }
        return { text: t(rg), ok: true }
      }

      if (!snap.loaded) return h('div', { className: `${P}-page` }, h('style', null, CSS), h('div', { className: `${P}-empty` }, t('loading')))

      const view = cur(doc) || EMPTY_VIEW
      const lay = layoutTree(view.root, 0, 0, 1, 1, { panes: [], divs: [] })
      const multi = lay.panes.length > 1
      const fp = paneById(view.root, view.focus)
      const hz = doc.strip.mode === 'horizontal'
      const fs = fp && fp.sid ? info(fp.sid) : null
      let working = 0
      if (statusMap && typeof statusMap.forEach === 'function') statusMap.forEach((v) => { if (v && v.running) working++ })
      const toast = snap.toast
      const toastText = toast ? t(toast.key, { ...toast.vars, t: toast.vars.t ? info(toast.vars.t).title : '' }) : null

      return h('div', { ref: pageRef, className: `${P}-page` },
        h('style', null, CSS),
        h('div', { className: `${P}-bar` },
          h('span', { className: `${P}-name` }, '▦ ' + t('title')),
          fs ? h('span', { className: `${P}-cur` },
            h('span', { className: `${P}-pbar`, style: { background: pcol(fs.proj), height: 14 } }),
            h('span', { className: `${P}-pj` }, fs.proj), h('span', { className: `${P}-sep2` }, '›'), h('b', null, fs.title)) : null,
          h('span', { className: `${P}-grow` }),
          h('span', { className: `${P}-x ${P}-plain`, title: t('workingTip') }, h(Dot, { st: { k: working ? 'running' : 'idle' } }), t('working', { n: working })),
          h('span', { className: `${P}-ext` }, h(Quiet, { name: 'menu bar' }, props.renderSlot(BAR_SLOT, {}))),
          h('span', { className: `${P}-x ${P}-plain` }, now),
          h('button', { className: `${P}-x`, title: t('help'), 'aria-pressed': help, onClick: () => setHelp(!help) }, '?'),
          h('button', { className: `${P}-x ${P}-bell${doc.quiet ? ` ${P}-quiet` : ''}`, title: t('bell'), 'aria-pressed': notes.open,
            onClick: () => { setHelp(false); api.notes.setOpen(!notes.open) } },
            h(BellGlyph), notes.list.length ? h('span', { className: `${P}-bdot` }, notes.list.length) : null)),
        notes.open ? h('div', { className: `${P}-npop` },
          h('div', { className: `${P}-nh` }, h('b', null, t('notes')),
            h('button', { className: `${P}-chip`, title: t('quietTip'), 'aria-pressed': !!doc.quiet, onClick: () => api.store.run('setQuiet', !doc.quiet) }, t('quiet')),
            notes.list.length ? h('button', { className: `${P}-link`, onClick: () => api.notes.drop(() => true) }, t('clearAll')) : null),
          h('div', { className: `${P}-nlist` },
            notes.list.length ? notes.list.map((n) => h(NoteCard, { key: n.id, n, info, t, api })) : h('div', { className: `${P}-nempty` }, t('notesEmpty'))),
          h('div', { className: `${P}-nfoot` }, t('notesFoot'))) : null,
        h('div', { className: `${P}-banners` },
          toastText ? h('div', {
            key: toast.id, className: `${P}-toast${/^(full|answerFailed)/.test(toast.key) ? ` ${P}-warn` : ''}`,
          }, toastText) : null,
          ...(notes.open ? [] : notes.list.filter((n) => n.banner).slice(0, 3).map((n) => h('div', { key: n.id, className: `${P}-banner` }, h(NoteCard, { n, info, t, api, banner: true }))))),
        recent ? h(Quiet, { name: 'recent' }, h(Recent, { list, info, t, api, doc, onClose: () => setRecent(false) })) : null,
        help ? h('div', { className: `${P}-scrim`, onClick: (e) => { if (e.target === e.currentTarget) setHelp(false) } },
          h('div', { className: `${P}-pop` },
            h('h3', null, t('helpTitle')), h('div', null, t('helpBody')),
            h('table', null, h('tbody', null, ...Array.from({ length: 13 }, (_, k) => {
              const [a, b] = t('hr' + (k + 1)).split('|')
              return h('tr', { key: k }, h('td', null, a), h('td', null, b))
            }))),
            h('label', null, h('input', { type: 'checkbox', checked: doc.catchClicks !== false, onChange: (e) => api.store.run('setCatchClicks', e.target.checked) }), t('catchClicks')))) : null,
        snap.error ? h('div', { className: `${P}-error` }, t('loadFailed', { error: snap.error })) : null,
        menu ? h(StripMenu, { key: menu.kind + menu.id, menu, doc, info, t, api, onClose: closeMenu }) : null,
        hz ? h(TabStrip, { doc, info, t, api, dragging, pageRef }) : null,
        h('div', { className: `${P}-body${hz ? ` ${P}-hz` : ''}` },
          hz ? null : h(TabStrip, { doc, info, t, api, dragging, pageRef }),
          h('div', { ref: panesRef, className: `${P}-panes${multi ? ` ${P}-multi` : ''}` },
            ...lay.panes.map((p) => h(Pane, {
              key: p.node.sid || p.node.id, node: p.node, rect: p, focused: p.node.id === view.focus, inSplit: multi,
              info, t, api, SessionProvider: props.SessionProvider, renderSlot: props.renderSlot,
            })),
            ...lay.divs.map((d) => h(Divider, { key: d.split.id + ':' + d.i, d, boxRef: panesRef, api })))))
    }

    function BellGlyph() {
      return h('svg', { viewBox: '0 0 16 16', width: 15, height: 15, 'aria-hidden': true },
        h('path', { fill: 'currentColor', d: 'M8 1.5a4.5 4.5 0 0 0-4.5 4.5v2.6L2.2 11h11.6l-1.3-2.4V6A4.5 4.5 0 0 0 8 1.5zM6.3 12.3a1.8 1.8 0 0 0 3.4 0z' }))
    }
    /** Full page header: the way back to the tabs, and a way to bring this session into one. */
    function BackToTabs(props) {
      const { sessionId, api } = props
      const raw = props.t ?? props.translate
      const t = (k) => { const s = raw ? raw(k) : undefined; return typeof s === 'string' ? s : EN[k] ?? k }
      const snap = useSyncExternalStore(api.store.subscribe, api.store.get)
      if (!snap.loaded || !sessionId) return null
      const place = where(snap.doc, sessionId)
      return h('span', { className: `${P}-back` },
        h('style', null, `.${P}-back{display:inline-flex;gap:6px}.${P}-back button{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}.${P}-back button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}`),
        place !== 'active' ? h('button', { title: t('openInTabTip'), onClick: () => api.backToTabs(sessionId) }, t('openInTab')) : null,
        h('button', { title: t('backTip'), onClick: () => api.backToTabs(place === 'active' ? sessionId : null) }, h(IconSvg, { size: 14 }), t('backToTabs')))
    }

    function Icon({ size = 18 }) {
      const ns = noteStore
      const snap = useSyncExternalStore(ns ? ns.subscribe : noSub, ns ? ns.get : noSnap)
      const n = snap ? snap.list.length : 0
      return h('span', { className: `${P}-ibox`, title: n ? EN.badge.replace('{n}', n) : undefined },
        h('style', null, `.${P}-ibox{position:relative;display:inline-flex}.${P}-ibadge{position:absolute;top:-4px;right:-6px;min-width:13px;height:13px;padding:0 3px;border-radius:7px;background:var(${WARN});color:var(--dsw-alias-bg-base);font-size:9px;font-weight:700;line-height:13px;text-align:center;box-sizing:border-box}`),
        h(IconSvg, { size }), n ? h('span', { className: `${P}-ibadge` }, n > 9 ? '9+' : n) : null)
    }
    function IconSvg({ size }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }),
        h('path', { d: 'M8 4v16M8 12h13' }))
    }

    // -- addressing (as the chat's openFile does it) ---------------------------------------------

    const encodeSegment = (s) => encodeURIComponent(s).replace(/%3A/gi, ':')
    function fileAddressFor(sessionId, cwd, path) {
      let rel = path
      if (cwd && path.startsWith(cwd.replace(/\/+$/, '') + '/')) rel = path.slice(cwd.replace(/\/+$/, '').length + 1)
      rel = rel.replace(/^\.\//, '')
      return `dsh-resource://file/session/${encodeSegment(sessionId)}/${rel.split('/').map(encodeURIComponent).join('/')}`
    }

    // -- plugin ----------------------------------------------------------------------------------

    return {
      inject: ['slots', 'layout', 'locale', 'sessions'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'dsh-tabs: en dictionary')
        const translate = ctx.locale.bind(NS)
        const store = createStore()
        store.load()
        ctx.effect(() => () => store.dispose(), 'dsh-tabs: store')

        let opening = 0  // while > 0 we are leaving the page on purpose: do not catch it
        const leaving = (ms) => { opening++; setTimeout(() => { opening-- }, ms) }
        const sidebarRight = () => ctx.get('sidebarRight')
        /** Open the session's full page and wait until the right sidebar's seat is bound to it. */
        const openPage = (sessionId) => new Promise((resolve) => {
          const ws = ctx.get('uiWorkspace')
          if (ws === undefined) { resolve(undefined); return }
          leaving(4000)
          ws.openSession(sessionId)
          const sr = sidebarRight()
          if (!sr || !sr.mounted) { setTimeout(() => resolve(sr), 400); return }
          if (sr.mounted.getSnapshot() === sessionId) { resolve(sr); return }
          let done = false
          const finish = () => { if (done) return; done = true; off(); clearTimeout(timer); resolve(sr) }
          const off = sr.mounted.subscribe(() => { if (sr.mounted.getSnapshot() === sessionId) setTimeout(finish, 50) })
          const timer = setTimeout(finish, 3000)
        })
        const showRight = () => { try { ctx.layout.openRightbar?.() } catch (_) { /* best effort */ } }
        const notes = createNoteStore()
        noteStore = notes
        ctx.effect(() => () => { notes.dispose(); if (noteStore === notes) noteStore = null }, 'dsh-tabs: notifications')

        let lastSideEntries = null, lastSideTools = []
        /** A service looked up on first use and then kept (at apply time it may not be active yet). */
        function lazyService(get) {
          let svc
          return () => {
            if (svc === undefined) { try { svc = get() } catch (_) { svc = undefined } }
            return svc
          }
        }
        /** A host store as a stable {subscribe, getSnapshot} pair for useSyncExternalStore; null until found. */
        function lazyStore(get) {
          const find = lazyService(get)
          let pair = null
          return () => {
            if (pair) return pair
            const st = find()
            if (!st || typeof st.subscribe !== 'function' || typeof st.getSnapshot !== 'function') return null
            pair = { subscribe: (fn) => st.subscribe(fn), getSnapshot: () => st.getSnapshot() }
            return pair
          }
        }
        const api = {
          store,
          sessions: ctx.sessions,
          info: () => ({ title: '', proj: '', st: { k: 'idle' } }),
          hintFor: () => null,
          beginDrag() {}, endDrag() { currentDrag = null },
          openFull(sessionId) { if (sessionId) openPage(sessionId) },
          /** Looked up when used: at apply time these services may not be active yet (ctx.get then gives undefined). */
          workspacesList: lazyStore(() => ctx.get('workspaces')?.list),
          jobsSvc: lazyService(() => ctx.get('jobs')),
          jobsState: lazyStore(() => ctx.get('jobs')?.state),
          sideTools() {
            let es = []
            try { es = ctx.slots.entries(SIDE_SLOT) || [] } catch (_) { es = [] }
            if (es === lastSideEntries) return lastSideTools
            lastSideEntries = es
            lastSideTools = es.map((e) => {
              const o = e.options || e
              let label = o.label
              try { if (typeof label === 'function') label = label() } catch (_) { label = undefined }
              return { key: o.key, label: typeof label === 'string' && label ? label : String(o.key) }
            }).filter((x) => x.key)
            return lastSideTools
          },
          toggleSidebar() { try { ctx.layout.toggleSidebar() } catch (e) { console.warn('dsh-tabs: toggleSidebar', e) } },
          notes,
          /** From the full page: back to the tabs; with a session id, that session's tab is activated. */
          backToTabs(sessionId) {
            if (sessionId) store.run('openSession', sessionId)
            ctx.layout.selectPanel(PANEL_ID)
          },
          toast: (key, vars) => store.toast(key, vars),
          resolveText: (text) => ctx.locale.resolveText(text),
          /** Open ↗ (or a banner click): the session's tab becomes active. */
          openNote(n) {
            notes.drop((x) => x.id === n.id)
            notes.setOpen(false)
            store.run('openSession', n.sid)
            if (panel !== PANEL_ID) ctx.layout.selectPanel(PANEL_ID)
          },
          async openTool(sessionId, kind) {
            const sr = await openPage(sessionId)
            if (!sr) return
            showRight()
            try { sr.openTab(kind) } catch (e) { console.warn('dsh-tabs: open tab failed', e) }
          },
          async openFile(sessionId, path) {
            const cwd = ctx.sessions.list.getSnapshot().byId?.[sessionId]?.cwd
            const sr = await openPage(sessionId)
            if (!sr) return
            showRight()
            try { sr.openResource(fileAddressFor(sessionId, cwd, path)) } catch (e) { console.warn('dsh-tabs: open file failed', e) }
          },
        }

        // A drawer row clicked while the Tabs page shows: the drawer calls uiWorkspace.openSession, the
        // main view retains that session (source 'mainView') and the main panel switches to the
        // conversation. Open the session in a tab instead and switch straight back.
        const mainViewIds = () => {
          const { ids, byId } = ctx.sessions.list.getSnapshot()
          return new Set(ids.filter((id) => (byId[id]?.retainedBy?.mainView ?? 0) > 0))
        }
        let panel = ctx.layout.panelInfo.getSnapshot().activePanelId
        let beforeLeave = mainViewIds()
        ctx.effect(() => ctx.layout.panelInfo.subscribe(() => {
          const next = ctx.layout.panelInfo.getSnapshot().activePanelId
          const prev = panel
          panel = next
          if (next === PANEL_ID) { beforeLeave = mainViewIds(); return }
          if (prev !== PANEL_ID || next !== null || opening > 0 || store.doc().catchClicks === false) return
          setTimeout(() => {
            const now = mainViewIds()
            const fresh = [...now].filter((id) => !beforeLeave.has(id))
            const picked = fresh[0] ?? (now.size === 1 ? [...now][0] : undefined)
            if (picked === undefined) return
            store.run('openSession', picked)
            ctx.layout.selectPanel(PANEL_ID)
          }, 0)
        }), 'dsh-tabs: catch drawer clicks')

        // Watch every session's ask. A new ask (a new pending key) from a session in any open tab
        // posts one note, unless it is the pane you are looking at; an ask that ends (answered
        // anywhere, withdrawn) takes its note away.
        const lastKey = new Map()
        const onStatus = (map) => {
          if (!map || typeof map.forEach !== 'function') return
          const d = store.doc()
          const view = cur(d)
          const fp = view && paneById(view.root, view.focus)
          const looking = document.hasFocus() && panel === PANEL_ID && fp ? fp.sid : null
          const live = new Map()
          map.forEach((v, sid) => { const p = v && v.pendingInteraction; if (p) live.set(sid, p) })
          notes.drop((n) => !live.has(n.sid) || live.get(n.sid).key !== n.key)
          for (const [sid, p] of live) {
            if (lastKey.get(sid) === p.key) continue
            lastKey.set(sid, p.key)
            if (!store.get().loaded || where(d, sid) === 'drawer' || sid === looking) continue
            notes.post({ id: uid(), sid, key: p.key, kind: p.kind, pending: p, at: Date.now() }, !d.quiet && !notes.get().open)
          }
          for (const sid of [...lastKey.keys()]) if (!live.has(sid)) lastKey.delete(sid)
        }
        ctx.effect(() => {
          let off = () => {}, timer, stopped = false
          const attach = () => {
            if (stopped) return
            const ui = ctx.get('uiSession')
            const src = ui && ui.sessionStatus
            if (!src) { timer = setTimeout(attach, 1000); return }
            // what is already waiting at load is not new: remember it without posting
            const first = src.getSnapshot()
            if (first && typeof first.forEach === 'function') first.forEach((v, sid) => { if (v && v.pendingInteraction) lastKey.set(sid, v.pendingInteraction.key) })
            off = src.subscribe(() => onStatus(src.getSnapshot()))
          }
          attach()
          return () => { stopped = true; clearTimeout(timer); off() }
        }, 'dsh-tabs: watch asks')

        // ⌥N anywhere: open the notifications (bringing the Tabs page forward when it is not showing)
        ctx.effect(() => {
          const onKey = (e) => {
            if (e.code !== 'KeyN' || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || e.isComposing) return
            e.preventDefault()
            if (panel !== PANEL_ID) { ctx.layout.selectPanel(PANEL_ID); notes.setOpen(true) } else notes.setOpen(!notes.get().open)
          }
          window.addEventListener('keydown', onKey, true)
          return () => window.removeEventListener('keydown', onKey, true)
        }, 'dsh-tabs: notifications key')

        // the page's keys in the shortcut reference (fixed rows: listed and reserved, not rebindable)
        ctx.effect(() => {
          let sc
          try { sc = ctx.get('shortcuts') } catch (_) { sc = undefined }
          if (!sc || typeof sc.registerFixed !== 'function') return undefined
          const alt = (code) => ({ code, modifiers: ['alt'] })
          const rows = [
            { id: 'tabs.notifications', label: () => translate('kBell'), keys: ['⌥N'], bindings: [alt('KeyN')], group: 'application' },
            { id: 'tabs.tab', label: () => translate('kTab'), keys: ['⌥1…9'], bindings: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => alt('Digit' + k)), group: 'application' },
            { id: 'tabs.next-tab', label: () => translate('kNext'), keys: ['⌥[', '⌥]'], bindings: [alt('BracketLeft'), alt('BracketRight')], group: 'application' },
            { id: 'tabs.reopen', label: () => translate('kReopen'), keys: ['⌥⇧T'], bindings: [{ code: 'KeyT', modifiers: ['alt', 'shift'] }], group: 'application' },
            { id: 'tabs.focus', label: () => translate('kFocus'), keys: ['⌥←↑↓→'], bindings: ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'].map(alt), group: 'application' },
            { id: 'tabs.close', label: () => translate('kClose'), keys: ['⌥W'], bindings: [alt('KeyW')], group: 'application' },
            { id: 'tabs.full-page', label: () => translate('kFull'), keys: ['⌥F'], bindings: [alt('KeyF')], group: 'application' },
            { id: 'tabs.drawer', label: () => translate('kDrawer'), keys: ['⌥B'], bindings: [alt('KeyB')], group: 'application' },
            { id: 'tabs.recent', label: () => translate('kRecent'), keys: ['⌥O'], bindings: [alt('KeyO')], group: 'application' },
          ]
          const offs = []
          for (const r of rows) { try { offs.push(sc.registerFixed(r)) } catch (e) { console.warn('dsh-tabs: shortcut row', r.id, e) } }
          return () => { for (const off of offs) off() }
        }, 'dsh-tabs: shortcut rows')

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: PANEL_ID, locale: NS,
          children: { [PANE_SLOT]: { kind: 'single', scope: 'session' }, [SIDE_SLOT]: { kind: 'keyed', scope: 'session' }, [BAR_SLOT]: { kind: 'list', scope: 'root' } },
          inject: () => ({ api, translate }),
        }, TabsPage))
        ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions', id: 'dsh-tabs-back', order: 5, locale: NS,
          inject: () => ({ api, translate }),
        }, BackToTabs))
        ctx.slots.inject(PANE_SLOT, () => ctx.slots.register({ name: PANE_SLOT }, TabConversation))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: PANEL_ID, order: 0, label: () => translate('panel'), locale: NS,
        }, Icon))
      },
    }
  },
})
