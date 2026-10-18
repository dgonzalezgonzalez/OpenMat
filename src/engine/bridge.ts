export interface BridgeExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  available: boolean;
  engineName: string;
}

export class HostEngineBridge {
  private enginePath: string;

  constructor(customPath?: string) {
    this.enginePath = customPath || '';
  }

  getExecutablePath(): string {
    return this.enginePath;
  }

  isAvailable(): boolean {
    if (!this.enginePath) return false;
    if (typeof window !== 'undefined') {
      return !!(window as any).__OPENMAT_BRIDGE_AVAILABLE__;
    }
    // Node environment check
    try {
      const processObj = (globalThis as any).process;
      if (!processObj?.versions?.node) return false;
      return true;
    } catch {
      return false;
    }
  }

  async executeBatch(code: string): Promise<BridgeExecutionResult> {
    if (typeof window !== 'undefined') {
      const ipc = (window as any).electron?.ipcRenderer;
      if (ipc) {
        return await ipc.invoke('host-engine-execute-batch', { code, path: this.enginePath });
      }
      return {
        stdout: '',
        stderr: 'Host engine bridge requires desktop/Node runtime or active local bridge server.',
        exitCode: 1,
        available: false,
        engineName: 'Host Native Engine (Disconnected)'
      };
    }

    // Node.js environment execution using dynamic ESM import
    try {
      const childProcess = await import('child_process');
      return new Promise<BridgeExecutionResult>((resolve) => {
        childProcess.execFile(
          this.enginePath,
          ['-batch', code],
          { timeout: 60000 },
          (error: any, stdout: string, stderr: string) => {
            resolve({
              stdout: stdout || '',
              stderr: stderr || (error ? error.message : ''),
              exitCode: error ? (error.code ?? 1) : 0,
              available: true,
              engineName: 'Host Native Engine (Connected)'
            });
          }
        );
      });
    } catch (err: any) {
      return {
        stdout: '',
        stderr: err.message || String(err),
        exitCode: 1,
        available: false,
        engineName: 'Host Native Engine (Unavailable)'
      };
    }
  }
}
