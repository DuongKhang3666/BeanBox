/**
 * Tắt êm và xử lý lỗi cấp tiến trình (D-079, R-16). Hàm thuần nhận phụ thuộc tiêm được để test
 * (server/job/prisma/timer/exit giả); `server.ts` chỉ ghép các phụ thuộc thật.
 */

export interface ShutdownLog {
  info(msg: string): void;
  error(obj: unknown, msg?: string): void;
  fatal(obj: unknown, msg?: string): void;
}

export interface ShutdownDeps {
  /** Ngừng nhận kết nối mới; resolve khi mọi kết nối đã đóng (request đang xử lý được chờ xong). */
  closeServer(): Promise<void>;
  /** Đóng kết nối keep-alive nhàn rỗi để `closeServer` không phải chờ socket idle (tối đa 65 giây). */
  closeIdleConnections(): void;
  /** Ngừng lên lịch job nền và chờ lượt đang chạy kết thúc. */
  stopJobs(): Promise<void>;
  /** Đóng mọi client Prisma. */
  disconnect(): Promise<void>;
  exit(code: number): void;
  log: ShutdownLog;
  /** Timeout tổng (ms); quá thì log và `exit(1)`. */
  timeoutMs: number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

/**
 * Trả hàm `shutdown(reason, exitCode)`. Chỉ chạy MỘT lần: lần gọi sau (SIGTERM đến 2 lần, lỗi xảy ra
 * trong lúc đang tắt) bỏ qua và trả cùng promise. Thứ tự: server.close -> closeIdle -> stopJobs
 * (chờ job đang chạy) -> chờ request đang xử lý xong -> disconnect DB -> exit. Mọi bước lỗi chỉ log và
 * đổi exit code thành 1, không chặn các bước sau.
 */
export function createShutdown(
  deps: ShutdownDeps,
): (reason: string, exitCode: number) => Promise<void> {
  let inFlight: Promise<void> | null = null;

  return (reason, exitCode) => {
    if (inFlight) {
      deps.log.info(`Đang tắt (${reason} bị bỏ qua vì đã có yêu cầu tắt trước đó)`);
      return inFlight;
    }
    deps.log.info(`Tắt êm: ${reason}`);
    let code = exitCode;
    const timer = deps.setTimer(() => {
      deps.log.error({ timeoutMs: deps.timeoutMs }, 'Tắt êm quá thời gian, buộc thoát');
      deps.exit(1);
    }, deps.timeoutMs);

    const step = async (name: string, fn: () => unknown): Promise<void> => {
      try {
        await fn();
      } catch (err) {
        code = 1;
        deps.log.error({ err }, `Tắt êm: bước "${name}" thất bại`);
      }
    };

    inFlight = (async () => {
      // Bắt đầu đóng server (không await ngay: nó chờ request đang chạy), rồi đóng socket nhàn rỗi.
      const closed = step('đóng server', () => deps.closeServer());
      await step('đóng kết nối nhàn rỗi', () => deps.closeIdleConnections());
      await step('dừng job nền', () => deps.stopJobs());
      await closed;
      await step('đóng DB', () => deps.disconnect());
      deps.clearTimer(timer);
      deps.log.info(`Đã tắt êm (exit ${code})`);
      deps.exit(code);
    })();
    return inFlight;
  };
}

export interface ProcessLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

/**
 * Gắn handler tín hiệu/lỗi: `uncaughtException`/`unhandledRejection` -> log `fatal` (kèm err; pino đã
 * redact header nhạy cảm, không log env) rồi tắt êm với exit 1; `SIGTERM`/`SIGINT` -> tắt êm exit 0.
 */
export function installProcessHandlers(
  proc: ProcessLike,
  shutdown: (reason: string, exitCode: number) => Promise<void>,
  log: Pick<ShutdownLog, 'fatal'>,
): void {
  proc.on('uncaughtException', (err) => {
    log.fatal({ err }, 'uncaughtException');
    void shutdown('uncaughtException', 1);
  });
  proc.on('unhandledRejection', (reason) => {
    log.fatal({ err: reason }, 'unhandledRejection');
    void shutdown('unhandledRejection', 1);
  });
  proc.on('SIGTERM', () => void shutdown('SIGTERM', 0));
  proc.on('SIGINT', () => void shutdown('SIGINT', 0));
}
