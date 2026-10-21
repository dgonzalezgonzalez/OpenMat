/**
 * Minimal CDP driver for exercising the OpenMat UI.
 * Uses the Node 26 native global WebSocket (no external deps).
 */
export interface Target {
  id: string;
  type: string;
  url: string;
  title: string;
  webSocketDebuggerUrl: string;
}

const ENDPOINT = process.env.OM_CDP ?? 'http://127.0.0.1:9222';

export async function listTargets(): Promise<Target[]> {
  const res = await fetch(`${ENDPOINT}/json/list`);
  return (await res.json()) as Target[];
}

export class CDP {
  private ws: WebSocket;
  private id = 0;
  private pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: any) => void }
  >();
  public consoleLogs: string[] = [];
  public pageErrors: string[] = [];

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (ev: MessageEvent) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || [])
          .map((a: any) => a.value ?? a.description ?? a.type)
          .join(' ');
        this.consoleLogs.push(`[${msg.params.type}] ${text}`);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        this.pageErrors.push(
          `${d.text} ${d.exception?.description || ''} @${d.url || ''}:${d.lineNumber}`
        );
      }
    });
  }

  static async connect(targetId: string): Promise<CDP> {
    const targets = await listTargets();
    const t = targets.find((x) => x.id === targetId);
    if (!t) throw new Error(`target ${targetId} not found`);
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('ws error')));
    });
    const c = new CDP(ws);
    await c.send('Runtime.enable');
    await c.send('Page.enable');
    return c;
  }

  send(method: string, params: any = {}): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 20000);
    });
  }

  /**
   * Evaluate an expression and return its value.
   * The expression is wrapped so the result is JSON-serialized inside the page;
   * this avoids CDP "Object reference chain is too long" for large DOM results.
   */
  async eval<T = any>(expression: string): Promise<T> {
    const wrapped = `(function(){ return JSON.stringify((function(){ return (${expression}); })()); })()`;
    const r = await this.send('Runtime.evaluate', {
      expression: wrapped,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    });
    if (r.exceptionDetails) {
      throw new Error(
        `eval error: ${r.exceptionDetails.text} ${
          r.exceptionDetails.exception?.description || ''
        }`
      );
    }
    const raw = r.result.value;
    if (raw === undefined || raw === null) return raw as T;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as T;
    }
  }

  /** Evaluate an expression and return its raw value (not JSON round-tripped). */
  async evalRaw<T = any>(expression: string): Promise<T> {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    });
    if (r.exceptionDetails) {
      throw new Error(
        `eval error: ${r.exceptionDetails.text} ${
          r.exceptionDetails.exception?.description || ''
        }`
      );
    }
    return r.result.value as T;
  }

  async goto(url: string): Promise<void> {
    await this.send('Page.navigate', { url });
    await this.wait(1500);
  }

  wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  async screenshotBase64(): Promise<string> {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    return r.data;
  }

  close(): void {
    this.ws.close();
  }
}

/**
 * Page-side helpers. Each snippet is a self-contained expression so it can be
 * used directly as the body of a wrapped eval.
 */
const OM_PANEL_FN = `
  function omPanel(title) {
    const panels = Array.from(document.querySelectorAll('.om-panel'));
    for (const p of panels) {
      const h = p.querySelector('.om-panel-header');
      if (h && h.textContent.trim().startsWith(title)) return p;
    }
    return null;
  }`;

export const REPL_INPUT = `(function(){
${OM_PANEL_FN}
  const prompts = Array.from(document.querySelectorAll('.om-prompt'));
  for (const p of prompts) {
    const inp = p.parentElement && p.parentElement.querySelector('input');
    if (inp) return inp;
  }
  return null;
})()`;

export const REPL_TRANSCRIPT = `(function(){
${OM_PANEL_FN}
  const p = omPanel('Command Window');
  if (!p) return null;
  const body = p.querySelector('.om-command-window');
  if (!body) return null;
  return Array.from(body.children)
    .map(el => el.textContent)
    .join('\\n');
})()`;

export const WORKSPACE_ROWS = `(function(){
${OM_PANEL_FN}
  const p = omPanel('Workspace');
  if (!p) return null;
  const rows = Array.from(p.querySelectorAll('tbody tr'));
  return rows.map(r => Array.from(r.querySelectorAll('td')).map(c => c.textContent.trim()).join(' | '));
})()`;

export const FIGURE_STATE = `(function(){
${OM_PANEL_FN}
  const p = omPanel('Figure 1');
  if (!p) return null;
  const canvas = p.querySelector('canvas');
  const header = p.querySelector('.om-panel-header');
  return {
    header: header ? header.textContent.trim() : null,
    hasCanvas: !!canvas,
    canvasSize: canvas ? { w: canvas.width, h: canvas.height } : null,
    bodyText: p.textContent.replace(/\\s+/g,' ').trim().slice(0, 300)
  };
})()`;

/** Click the ribbon tab with the given label. */
export const CLICK_RIBBON_TAB = `(function(label){
  const tabs = Array.from(document.querySelectorAll('.om-ribbon-tab'));
  const t = tabs.find(e => e.textContent.trim() === label);
  if (t) t.click();
  return !!t;
})`;

/** Click a toolbar button by its exact visible label. */
export const CLICK_BUTTON = `(function(label){
  const b = Array.from(document.querySelectorAll('button'))
    .find(e => e.textContent.trim() === label);
  if (b) b.click();
  return !!b;
})`;

/** Click a button inside the Figure 1 panel by its exact visible label. */
export const CLICK_FIGURE_BUTTON = `(function(label){
  const panels = Array.from(document.querySelectorAll('.om-panel'));
  let p = null;
  for (const cand of panels) {
    const h = cand.querySelector('.om-panel-header');
    if (h && h.textContent.trim().startsWith('Figure 1')) { p = cand; break; }
  }
  if (!p) return false;
  const b = Array.from(p.querySelectorAll('button'))
    .find(e => e.textContent.trim() === label);
  if (b) b.click();
  return !!b;
})`;
