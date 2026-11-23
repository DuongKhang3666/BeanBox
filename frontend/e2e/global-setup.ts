import type { FullConfig } from "@playwright/test";

/**
 * Warm-up khởi động nguội (D-083).
 *
 * `next dev` biên dịch từng route ở lần gọi đầu, và webServer của Playwright chỉ chờ một URL.
 * Trước đây URL đó là trang chủ nên test đầu tiên vừa phải chờ biên dịch trang sản phẩm/giỏ/thanh
 * toán vừa gọi `POST /cart/items` qua rewrite khi server dev còn đang bận, thỉnh thoảng nhận 404
 * hoặc lỗi proxy. Ở đây gọi trước, qua FRONTEND, đúng những đường test sẽ đi: rewrite GET + POST,
 * trang chính của luồng mua. Mỗi bước phải trả đúng mã 2 lần liên tiếp (lần 1 có thể là lần
 * biên dịch, lần 2 xác nhận ổn định), có timeout riêng và log; không sleep cố định.
 */

const STEP_TIMEOUT_MS = 120_000;
const REQUEST_TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 500; // khoảng nghỉ giữa các lần thử lại khi bước chưa đạt
const STABLE_HITS = 2;

interface Step {
  name: string;
  path: string | (() => string);
  method?: "GET" | "POST";
  body?: unknown;
  /** Mã chấp nhận (mặc định 200). */
  accept?: number[];
  /** Kiểm thêm trên phần thân; trả chuỗi lỗi nếu sai. */
  check?: (res: { status: number; text: string }) => string | null;
  /** Lưu kết quả cho bước sau. */
  onOk?: (text: string) => void;
}

function log(message: string): void {
  console.log(`[warm-up] ${message}`);
}

async function request(
  base: string,
  step: Step,
): Promise<{ status: number; text: string; ms: number }> {
  const started = Date.now();
  const path = typeof step.path === "function" ? step.path() : step.path;
  const res = await fetch(new URL(path, base), {
    method: step.method ?? "GET",
    headers: step.body === undefined ? undefined : { "content-type": "application/json" },
    body: step.body === undefined ? undefined : JSON.stringify(step.body),
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  return { status: res.status, text, ms: Date.now() - started };
}

async function runStep(base: string, step: Step): Promise<void> {
  const accept = step.accept ?? [200];
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  let hits = 0;
  let attempts = 0;
  let last = "chưa có phản hồi";
  while (Date.now() < deadline) {
    attempts += 1;
    try {
      const res = await request(base, step);
      const problem = !accept.includes(res.status)
        ? `HTTP ${res.status} (cần ${accept.join("/")})`
        : (step.check?.(res) ?? null);
      if (problem === null) {
        hits += 1;
        if (hits === 1) step.onOk?.(res.text);
        if (hits >= STABLE_HITS) {
          log(`${step.name}: ok sau ${attempts} lần gọi (lần cuối ${res.ms} ms)`);
          return;
        }
        continue; // lần thứ hai ngay lập tức để xác nhận ổn định
      }
      hits = 0;
      last = `${problem} sau ${res.ms} ms`;
    } catch (e) {
      hits = 0;
      last = e instanceof Error ? e.message : String(e);
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
  throw new Error(
    `[warm-up] "${step.name}" không ổn định sau ${STEP_TIMEOUT_MS / 1000}s (${attempts} lần): ${last}`,
  );
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const base = config.projects[0]?.use.baseURL;
  if (!base) return;
  const started = Date.now();
  let slug = "";

  const steps: Step[] = [
    // Qua rewrite /api/v1 của Next tới backend.
    { name: "GET /api/v1/health (rewrite)", path: "/api/v1/health" },
    {
      name: "GET /api/v1/products (rewrite)",
      path: "/api/v1/products?category=ca-phe-hat&pageSize=20",
      check: ({ text }) => {
        try {
          const first = (JSON.parse(text) as { data?: { slug?: string }[] }).data?.[0]?.slug;
          return first ? null : "danh sách sản phẩm rỗng (đã seed chưa?)";
        } catch {
          return "phản hồi không phải JSON";
        }
      },
      onOk: (text) => {
        slug = (JSON.parse(text) as { data: { slug: string }[] }).data[0]!.slug;
      },
    },
    // POST qua rewrite: thân rỗng bị backend từ chối 400 bằng JSON; 404 nghĩa là rewrite chưa sẵn sàng.
    {
      name: "POST /api/v1/cart/items (rewrite)",
      path: "/api/v1/cart/items",
      method: "POST",
      body: {},
      accept: [400],
      check: ({ text }) => {
        try {
          const code = (JSON.parse(text) as { error?: { code?: string } }).error?.code;
          return code ? null : "400 nhưng không phải lỗi JSON của backend";
        } catch {
          return "400 nhưng không phải JSON của backend";
        }
      },
    },
    // Trang của luồng mua (biên dịch lần đầu rất tốn thời gian).
    { name: "GET /", path: "/" },
    { name: "GET /danh-muc/ca-phe-hat", path: "/danh-muc/ca-phe-hat" },
    { name: "GET /san-pham/<slug>", path: () => `/san-pham/${slug}` },
    { name: "GET /gio-hang", path: "/gio-hang" },
    { name: "GET /thanh-toan", path: "/thanh-toan" },
    { name: "GET /tra-cuu-don-hang", path: "/tra-cuu-don-hang" },
    { name: "GET /dang-nhap", path: "/dang-nhap" },
    // proxy.ts (CSP admin) chỉ khớp /admin: chưa đăng nhập thì chuyển hướng.
    { name: "GET /admin", path: "/admin", accept: [200, 307, 308] },
  ];

  log(`làm nóng ${base} (${steps.length} bước)`);
  for (const step of steps) await runStep(base, step);
  log(`xong sau ${((Date.now() - started) / 1000).toFixed(1)}s`);
}
