export interface BridgeExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  available: boolean;
  engineName: string;
}

export class MatlabBridge {
  private matlabPath: string;

  constructor(customPath?: string) {
    this.matlabPath = customPath || '/Applications/MATLAB_R2025b.app/bin/matlab';
  }

  getExecutablePath(): string {
    return this.matlabPath;
  }

  isAvailable(): boolean {
    if (typeof window !== 'undefined') {
      return !!(window as any).__OPENMAT_BRIDGE_AVAILABLE__;
    }
    // Node environment check
    try {
      const processObj = (globalThis as any).process;
      if (!processObj?.versions?.node) return false;
      // In Node environment, check if path exists
      return true;
    } catch {
      return false;
    }
  }

  async executeBatch(code: string): Promise<BridgeExecutionResult> {
    if (typeof window !== 'undefined') {
      const ipc = (window as any).electron?.ipcRenderer;
      if (ipc) {
        return await ipc.invoke('matlab-execute-batch', { code, path: this.matlabPath });
      }
      return {
        stdout: '',
        stderr: 'Local MATLAB bridge requires desktop/Node runtime or active local bridge server.',
        exitCode: 1,
        available: false,
        engineName: 'Local MATLAB Bridge (Disconnected)'
      };
    }

    // Node.js environment execution using dynamic ESM import
    try {
      const childProcess = await import('child_process');
      return new Promise<BridgeExecutionResult>((resolve) => {
        childProcess.execFile(
          this.matlabPath,
          ['-batch', code],
          { timeout: 60000 },
          (error: any, stdout: string, stderr: string) => {
            resolve({
              stdout: stdout || '',
              stderr: stderr || (error ? error.message : ''),
              exitCode: error ? (error.code ?? 1) : 0,
              available: true,
              engineName: 'MATLAB R2025b (Host Native)'
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
        engineName: 'Local MATLAB Bridge (Unavailable)'
      };
    }
  }
}
