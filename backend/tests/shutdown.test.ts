import { describe, expect, it, vi } from 'vitest';
import { createShutdown, installProcessHandlers, type ShutdownDeps } from '../src/lib/shutdown.js';

/** Hàm trì hoãn: resolve/reject bằng tay để mô phỏng "đang chạy". */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(over: Partial<ShutdownDeps> = {}) {
  const calls: string[] = [];
  const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
  const deps: ShutdownDeps = {
    closeServer: () => {
      calls.push('closeServer');
      return Promise.resolve();
    },
    closeIdleConnections: () => {
      calls.push('closeIdle');
    },
    stopJobs: () => {
      calls.push('stopJobs');
      return Promise.resolve();
    },
    disconnect: () => {
      calls.push('disconnect');
      return Promise.resolve();
    },
    exit: (code) => {
      calls.push(`exit:${code}`);
    },
    log: { info: vi.fn(), error: vi.fn(), fatal: vi.fn() },
    timeoutMs: 25_000,
    setTimer: (fn, ms) => {
      const t = { fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimer: (h) => {
      (h as { cleared: boolean }).cleared = true;
    },
    ...over,
  };
  return { deps, calls, timers };
}

describe('createShutdown (D-079)', () => {
  it('gọi đúng thứ tự rồi exit 0 và hủy timer', async () => {
    const { deps, calls, timers } = setup();
    await createShutdown(deps)('SIGTERM', 0);
    expect(calls).toEqual(['closeServer', 'closeIdle', 'stopJobs', 'disconnect', 'exit:0']);
    expect(timers).toHaveLength(1);
    expect(timers[0]!.ms).toBe(25_000);
    expect(timers[0]!.cleared).toBe(true);
  });

  it('chờ job đang chạy và request đang xử lý xong trước khi đóng DB', async () => {
    const job = deferred();
    const server = deferred();
    const { deps, calls } = setup({
      stopJobs: () => {
        calls.push('stopJobs');
        return job.promise;
      },
      closeServer: () => {
        calls.push('closeServer');
        return server.promise;
      },
    });
    const done = createShutdown(deps)('SIGTERM', 0);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['closeServer', 'closeIdle', 'stopJobs']);

    job.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).not.toContain('disconnect'); // server (request đang xử lý) chưa xong

    server.resolve();
    await done;
    expect(calls).toEqual(['closeServer', 'closeIdle', 'stopJobs', 'disconnect', 'exit:0']);
  });

  it('quá timeout tổng thì log lỗi và exit 1', async () => {
    const never = new Promise<void>(() => undefined);
    const { deps, calls, timers } = setup({ stopJobs: () => never });
    void createShutdown(deps)('SIGTERM', 0);
    await Promise.resolve();
    expect(calls).not.toContain('exit:1');
    timers[0]!.fn();
    expect(calls).toContain('exit:1');
    expect(deps.log.error).toHaveBeenCalled();
  });

  it('gọi lần hai bị bỏ qua, chỉ chạy các bước một lần', async () => {
    const { deps, calls } = setup();
    const shutdown = createShutdown(deps);
    const a = shutdown('SIGTERM', 0);
    const b = shutdown('SIGINT', 0);
    await Promise.all([a, b]);
    expect(calls.filter((c) => c === 'disconnect')).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith('exit'))).toEqual(['exit:0']);
  });

  it('giữ exit code truyền vào (lỗi tiến trình -> 1)', async () => {
    const { deps, calls } = setup();
    await createShutdown(deps)('uncaughtException', 1);
    expect(calls.at(-1)).toBe('exit:1');
  });

  it('một bước lỗi vẫn chạy các bước sau và exit 1', async () => {
    const { deps, calls } = setup({
      stopJobs: () => Promise.reject(new Error('boom')),
    });
    await createShutdown(deps)('SIGTERM', 0);
    expect(calls).toEqual(['closeServer', 'closeIdle', 'disconnect', 'exit:1']);
    expect(deps.log.error).toHaveBeenCalled();
  });

  it('đóng server lỗi (chưa listen) vẫn đóng DB và exit 1', async () => {
    const { deps, calls } = setup({ closeServer: () => Promise.reject(new Error('not running')) });
    await createShutdown(deps)('SIGTERM', 0);
    expect(calls).toEqual(['closeIdle', 'stopJobs', 'disconnect', 'exit:1']);
  });
});

describe('installProcessHandlers (D-079)', () => {
  function proc() {
    const handlers = new Map<string, (...a: unknown[]) => void>();
    return {
      handlers,
      on: (e: string, fn: (...a: unknown[]) => void) => {
        handlers.set(e, fn);
      },
    };
  }

  it('uncaughtException/unhandledRejection: log fatal rồi tắt êm với exit 1', () => {
    const p = proc();
    const shutdown = vi.fn(() => Promise.resolve());
    const fatal = vi.fn();
    installProcessHandlers(p, shutdown, { fatal });
    const err = new Error('x');
    p.handlers.get('uncaughtException')!(err);
    p.handlers.get('unhandledRejection')!('lý do');
    expect(fatal).toHaveBeenNthCalledWith(1, { err }, 'uncaughtException');
    expect(fatal).toHaveBeenNthCalledWith(2, { err: 'lý do' }, 'unhandledRejection');
    expect(shutdown).toHaveBeenNthCalledWith(1, 'uncaughtException', 1);
    expect(shutdown).toHaveBeenNthCalledWith(2, 'unhandledRejection', 1);
  });

  it('SIGTERM/SIGINT: tắt êm với exit 0', () => {
    const p = proc();
    const shutdown = vi.fn(() => Promise.resolve());
    installProcessHandlers(p, shutdown, { fatal: vi.fn() });
    p.handlers.get('SIGTERM')!();
    p.handlers.get('SIGINT')!();
    expect(shutdown).toHaveBeenNthCalledWith(1, 'SIGTERM', 0);
    expect(shutdown).toHaveBeenNthCalledWith(2, 'SIGINT', 0);
  });
});
