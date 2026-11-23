import { afterEach, describe, expect, it, vi } from 'vitest';

const runSaleRefreshOnce = vi.hoisted(() => vi.fn());
vi.mock('../src/jobs/saleRefresh.js', () => ({ runSaleRefreshOnce }));

import { startBackgroundJobs, stopBackgroundJobs } from '../src/jobs/cleanup.js';

afterEach(async () => {
  await stopBackgroundJobs();
  vi.useRealTimers();
  runSaleRefreshOnce.mockReset();
});

describe('stopBackgroundJobs chờ job đang chạy (D-079)', () => {
  it('chờ lượt đang chạy xong rồi mới resolve; không lên lịch lượt mới sau khi dừng', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    runSaleRefreshOnce.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    startBackgroundJobs();
    await vi.advanceTimersByTimeAsync(1); // lượt đối soát đầu tiên bắt đầu và đang treo
    expect(runSaleRefreshOnce).toHaveBeenCalledTimes(1);

    let stopped = false;
    const stopping = stopBackgroundJobs().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(stopped).toBe(false);

    finish();
    await stopping;
    expect(stopped).toBe(true);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000); // đã dừng: không còn lượt nào
    expect(runSaleRefreshOnce).toHaveBeenCalledTimes(1);
  });

  it('lỗi của job không làm stopBackgroundJobs ném lỗi', async () => {
    vi.useFakeTimers();
    runSaleRefreshOnce.mockRejectedValue(new Error('db down'));
    startBackgroundJobs();
    await vi.advanceTimersByTimeAsync(1);
    await expect(stopBackgroundJobs()).resolves.toBeUndefined();
  });
});
