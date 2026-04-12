/** Status for a scenario or sub-scenario. */
export type TestStatus = 'pending' | 'running' | 'pass' | 'fail' | 'skipped'

interface StatusEntry {
  id: string
  label: string
  row: HTMLElement
  indicator: HTMLElement
  message: HTMLElement
}

const STATUS_COLORS: Record<TestStatus, string> = {
  pending: '#64748b',
  running: '#f59e0b',
  pass: '#22c55e',
  fail: '#ef4444',
  skipped: '#94a3b8',
}

const STATUS_ICONS: Record<TestStatus, string> = {
  pending: '\u25CB',  // ○
  running: '\u25D4',  // ◔
  pass: '\u2713',     // ✓
  fail: '\u2717',     // ✗
  skipped: '\u2014',  // —
}

/**
 * Floating test panel rendered inside Shadow DOM.
 * Displays scenario list with status indicators and run controls.
 */
export class TestPanel {
  private host: HTMLElement
  private shadow: ShadowRoot
  private container: HTMLElement
  private scenarioList: HTMLElement
  private badge: HTMLElement
  private mainContent: HTMLElement
  private entries = new Map<string, StatusEntry>()
  private minimized = false

  /** Callback invoked when "Run All" is clicked. */
  onRun: (() => Promise<void>) | null = null

  /** Callback invoked when "Stop" is clicked. */
  onStop: (() => void) | null = null

  private running = false

  constructor(scenarioIds: Array<{ id: string; label: string }>) {
    this.host = document.createElement('div')
    this.host.id = 'voyager-test-panel-host'
    this.shadow = this.host.attachShadow({ mode: 'closed' })

    // Inject styles
    const style = document.createElement('style')
    style.textContent = this.css()
    this.shadow.appendChild(style)

    // Build DOM
    this.container = this.el('div', 'panel')

    // Header
    const header = this.el('div', 'header')
    const title = this.el('span', 'title')
    title.textContent = 'Voyager Tests'
    const controls = this.el('div', 'controls')

    const runBtn = this.el('button', 'btn btn-run')
    runBtn.textContent = 'Run All'
    runBtn.addEventListener('click', () => this.handleRun())

    const stopBtn = this.el('button', 'btn btn-stop')
    stopBtn.textContent = 'Stop'
    stopBtn.addEventListener('click', () => this.handleStop())

    const minBtn = this.el('button', 'btn btn-min')
    minBtn.textContent = '\u2014'
    minBtn.addEventListener('click', () => this.toggleMinimize())

    controls.append(runBtn, stopBtn, minBtn)
    header.append(title, controls)

    // Scenario list
    this.scenarioList = this.el('div', 'scenario-list')
    for (const { id, label } of scenarioIds) {
      this.addEntry(id, label)
    }

    // Main content wrapper
    this.mainContent = this.el('div', 'main-content')
    this.mainContent.append(header, this.scenarioList)

    // Badge (minimized state)
    this.badge = this.el('div', 'badge')
    this.badge.addEventListener('click', () => this.toggleMinimize())
    this.updateBadge()
    this.badge.style.display = 'none'

    this.container.append(this.mainContent, this.badge)
    this.shadow.appendChild(this.container)
    document.body.appendChild(this.host)
  }

  /** Toggle the panel visibility. */
  toggle(): void {
    const visible = this.host.style.display !== 'none'
    this.host.style.display = visible ? 'none' : 'block'
  }

  /** Set the status of a scenario. */
  setStatus(id: string, status: TestStatus, message?: string): void {
    const entry = this.entries.get(id)
    if (!entry) return

    entry.indicator.textContent = STATUS_ICONS[status]
    entry.indicator.style.color = STATUS_COLORS[status]
    entry.message.textContent = message ?? ''
    entry.message.style.color =
      status === 'fail' ? STATUS_COLORS.fail : '#a1a1aa'

    this.updateBadge()
  }

  /** Reset all scenarios to pending. */
  resetAll(): void {
    for (const [id] of this.entries) {
      this.setStatus(id, 'pending')
    }
  }

  destroy(): void {
    this.host.remove()
  }

  // -- Private ---------------------------------------------------------

  private addEntry(id: string, label: string): void {
    const row = this.el('div', 'scenario-row')
    const indicator = this.el('span', 'indicator')
    indicator.textContent = STATUS_ICONS.pending
    indicator.style.color = STATUS_COLORS.pending

    const labelEl = this.el('span', 'label')
    labelEl.textContent = label

    const message = this.el('span', 'message')

    row.append(indicator, labelEl, message)
    this.scenarioList.appendChild(row)
    this.entries.set(id, { id, label, row, indicator, message })
  }

  private toggleMinimize(): void {
    this.minimized = !this.minimized
    this.mainContent.style.display = this.minimized ? 'none' : 'flex'
    this.badge.style.display = this.minimized ? 'flex' : 'none'
  }

  private updateBadge(): void {
    let pass = 0
    let fail = 0
    let total = 0
    for (const [, entry] of this.entries) {
      total++
      const color = entry.indicator.style.color
      if (color === STATUS_COLORS.pass) pass++
      if (color === STATUS_COLORS.fail) fail++
    }
    this.badge.textContent = `${pass}/${total}` + (fail > 0 ? ` (${fail} failed)` : '')
    this.badge.style.borderColor =
      fail > 0 ? STATUS_COLORS.fail : pass === total ? STATUS_COLORS.pass : '#333'
  }

  private async handleRun(): Promise<void> {
    if (this.running || !this.onRun) return
    this.running = true
    try {
      await this.onRun()
    } finally {
      this.running = false
    }
  }

  private handleStop(): void {
    this.onStop?.()
  }

  private el(tag: string, className: string): HTMLElement {
    const e = document.createElement(tag)
    e.className = className
    return e
  }

  private css(): string {
    return `
      .panel {
        position: fixed;
        bottom: 16px;
        right: 16px;
        z-index: 2147483647;
        font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
        font-size: 12px;
        color: #e4e4e7;
      }

      .main-content {
        display: flex;
        flex-direction: column;
        background: #0a0a0a;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        width: 340px;
        max-height: 500px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        background: #111;
      }

      .title {
        font-weight: 600;
        font-size: 13px;
        color: #a78bfa;
      }

      .controls {
        display: flex;
        gap: 6px;
      }

      .btn {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #a1a1aa;
        padding: 3px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 11px;
        transition: all 0.15s;
      }

      .btn:hover {
        background: rgba(255, 255, 255, 0.05);
        color: #e4e4e7;
      }

      .btn-run {
        color: #22c55e;
        border-color: rgba(34, 197, 94, 0.3);
      }

      .btn-run:hover {
        background: rgba(34, 197, 94, 0.1);
      }

      .btn-stop {
        color: #ef4444;
        border-color: rgba(239, 68, 68, 0.3);
      }

      .btn-stop:hover {
        background: rgba(239, 68, 68, 0.1);
      }

      .scenario-list {
        overflow-y: auto;
        padding: 8px 0;
      }

      .scenario-row {
        display: flex;
        align-items: center;
        padding: 5px 12px;
        gap: 8px;
      }

      .indicator {
        width: 16px;
        text-align: center;
        font-size: 13px;
        flex-shrink: 0;
      }

      .label {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .message {
        font-size: 10px;
        color: #a1a1aa;
        max-width: 120px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: right;
      }

      .badge {
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0a0a0a;
        border: 1px solid #333;
        border-radius: 20px;
        padding: 6px 14px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        color: #e4e4e7;
        transition: all 0.15s;
        margin-left: auto;
        width: fit-content;
      }

      .badge:hover {
        background: #1a1a1a;
      }
    `
  }
}
