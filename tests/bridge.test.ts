import { describe, it, expect } from 'vitest';
import { HostEngineBridge } from '../src/engine/bridge';

describe('HostEngineBridge', () => {
  it('detects host engine execution path', () => {
    const bridge = new HostEngineBridge();
    expect(bridge.getExecutablePath()).toBe('');
  });

  it('runs batch command when executed in Node environment', async () => {
    const bridge = new HostEngineBridge();
    if (bridge.isAvailable()) {
      const res = await bridge.executeBatch("disp(40 + 2); exit;");
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('42');
    }
  }, 45000);
});
