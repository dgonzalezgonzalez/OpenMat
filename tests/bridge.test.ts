import { describe, it, expect } from 'vitest';
import { MatlabBridge } from '../src/engine/bridge';

describe('MatlabBridge', () => {
  it('detects host MATLAB installation path', () => {
    const bridge = new MatlabBridge();
    expect(bridge.getExecutablePath()).toBe('/Applications/MATLAB_R2025b.app/bin/matlab');
  });

  it('runs batch command when executed in Node environment', async () => {
    const bridge = new MatlabBridge();
    if (bridge.isAvailable()) {
      const res = await bridge.executeBatch("disp(40 + 2); exit;");
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('42');
    }
  }, 45000);
});
