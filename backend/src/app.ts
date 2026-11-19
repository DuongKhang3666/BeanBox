import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { getPaymentConfig, type PaymentConfig } from './config/payments.js';
import { UPLOADS_DIR } from './config/paths.js';
import { logger } from './lib/logger.js';
import {
  createTurnstileVerifier,
  getCaptchaConfig,
  type CaptchaConfig,
  type TurnstileVerifier,
} from './lib/turnstile.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { createRateLimiter, isTrustedInternalRequest } from './middlewares/rateLimit.js';
import { notFound } from './middlewares/notFound.js';
import { requestId } from './middlewares/requestId.js';
import { createAdminRouter } from './modules/admin/admin.routes.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createCspRouter } from './modules/csp/csp.routes.js';
import { createContactRouter } from './modules/contact/contact.routes.js';
import { createCartRouter } from './modules/cart/cart.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { createCheckoutRouter } from './modules/checkout/checkout.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { createOrdersRouter } from './modules/orders/orders.routes.js';
import { loadLocations } from './modules/locations/locations.data.js';
import { locationsRouter } from './modules/locations/locations.routes.js';
import { meRouter } from './modules/me/me.routes.js';
import { createPaymentsRouter } from './modules/payments/payments.routes.js';
import { createReviewsRouter } from './modules/reviews/reviews.routes.js';
import type { StripeHttp } from './modules/payments/stripe.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { wishlistRouter } from './modules/wishlist/wishlist.routes.js';

const API_PREFIX = '/api/v1';

/** Không log query của /payments/* (chứa chữ ký vnp_SecureHash và dữ liệu giao dịch, §13.3). */
export function redactUrlForLog(url: string | undefined): string | undefined {
  if (!url) return url;
  const q = url.indexOf('?');
  if (q < 0) return url;
  return /\/payments\//.test(url.slice(0, q)) ? `${url.slice(0, q)}?[REDACTED]` : url;
}

export interface AppOptions {
  /** Số request/phút/IP của rate limit chung (mặc định 100). Chỉ đổi trong test. */
  generalRateLimit?: number;
  /** Số request/phút/IP của limiter nhạy cảm (login, đăng ký, quên mật khẩu...). Mặc định 5. */
  authRateLimit?: number;
  /** Số request/phút/IP của POST /orders/:code/cancel khi không có Authorization (mặc định 5). */
  guestCancelRateLimit?: number;
  /** Số request/phút/IP của GET /orders/track (mặc định 10). */
  trackRateLimit?: number;
  /** Số request/phút/IP của POST /cart/apply-coupon (mặc định 10). Chỉ đổi trong test. */
  couponRateLimit?: number;
  /** Số request/phút/IP của POST /checkout/quote (mặc định 30). Chỉ đổi trong test. */
  quoteRateLimit?: number;
  /** Số request/phút/IP của POST /orders (mặc định 10). Chỉ đổi trong test. */
  orderRateLimit?: number;
  /** Số request/phút/IP của POST /admin/uploads (mặc định 30). Chỉ đổi trong test. */
  uploadRateLimit?: number;
  /** Cấu hình thanh toán online (mặc định đọc từ env). Test tiêm cấu hình giả. */
  paymentConfig?: PaymentConfig;
  /** Số request/phút/IP của POST /payments/vnpay/create (mặc định 10). Chỉ đổi trong test. */
  paymentCreateRateLimit?: number;
  /** Số request/phút/IP của GET /payments/vnpay/return (mặc định 30). Chỉ đổi trong test. */
  paymentReturnRateLimit?: number;
  /** Số request/phút/IP của POST /payments/stripe/sync (mặc định 30). Chỉ đổi trong test. */
  paymentSyncRateLimit?: number;
  /** HTTP client Stripe (mặc định fetch tới api.stripe.com). Test tiêm bản giả, không đi qua mạng. */
  stripeHttp?: StripeHttp;
  /** Số request/phút/IP của POST /products/:slug/reviews và PATCH /reviews/:id (mặc định 10). Chỉ đổi trong test. */
  reviewRateLimit?: number;
  /** Số request/10 phút/IP của POST /contact (mặc định 3). Chỉ đổi trong test. */
  contactRateLimit?: number;
  /** Số request/phút/IP của POST /csp-report (mặc định 20). Chỉ đổi trong test. */
  cspReportRateLimit?: number;
  /** Cấu hình captcha form liên hệ (D-028). Mặc định đọc từ env; `null` = tắt. Test tiêm giá trị giả. */
  captchaConfig?: CaptchaConfig | null;
  /** Hàm xác minh token Turnstile (mặc định gọi Cloudflare). Test tiêm bản giả, không đi qua mạng. */
  captchaVerify?: TurnstileVerifier;
  /** Thư mục lưu/phục vụ ảnh upload (mặc định backend/uploads). Chỉ đổi trong test. */
  uploadsDir?: string;
}

export function createApp(options: AppOptions = {}): Express {
  const uploadsDir = options.uploadsDir ?? UPLOADS_DIR;
  loadLocations(); // fail-fast: thiếu/sai dữ liệu hành chính thì không khởi động
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  const paymentConfig = options.paymentConfig ?? getPaymentConfig();
  const captchaConfig =
    options.captchaConfig === undefined ? getCaptchaConfig() : options.captchaConfig;
  app.locals.captchaConfig = captchaConfig;
  app.locals.captchaVerify =
    options.captchaVerify ??
    (captchaConfig ? createTurnstileVerifier(captchaConfig.secretKey) : undefined);
  app.locals.stripeHttp = options.stripeHttp;
  app.locals.paymentConfig = paymentConfig; // controller checkout/orders đọc để tính enabled/canPay

  // Limiter nhạy cảm: KHÔNG bỏ qua request nội bộ; store riêng mỗi app.
  const limiters = {
    sensitive: createRateLimiter({ windowMs: 60_000, limit: options.authRateLimit ?? 5 }),
    // Store riêng cho mỗi limiter (không chung với login). Request có Bearer không bị tính.
    guestCancel: createRateLimiter({
      windowMs: 60_000,
      limit: options.guestCancelRateLimit ?? 5,
      skip: (req) => req.headers.authorization !== undefined,
    }),
    track: createRateLimiter({ windowMs: 60_000, limit: options.trackRateLimit ?? 10 }),
    // D-011: theo IP, tính mọi request (kể cả có Bearer / X-Internal-Secret), store riêng.
    coupon: createRateLimiter({
      windowMs: 60_000,
      limit: options.couponRateLimit ?? env.COUPON_RATE_LIMIT_PER_MIN,
    }),
    quote: createRateLimiter({
      windowMs: 60_000,
      limit: options.quoteRateLimit ?? env.QUOTE_RATE_LIMIT_PER_MIN,
    }),
    order: createRateLimiter({
      windowMs: 60_000,
      limit: options.orderRateLimit ?? env.ORDER_RATE_LIMIT_PER_MIN,
    }),
    // Thanh toán (§13.2, §13.3): store riêng, theo IP, đứng trước xác thực.
    paymentCreate: createRateLimiter({
      windowMs: 60_000,
      limit: options.paymentCreateRateLimit ?? 10,
    }),
    paymentReturn: createRateLimiter({
      windowMs: 60_000,
      limit: options.paymentReturnRateLimit ?? 30,
    }),
    paymentSync: createRateLimiter({
      windowMs: 60_000,
      limit: options.paymentSyncRateLimit ?? 30,
    }),
    // Ghi đánh giá (§14.1): store riêng, theo IP, đứng trước xác thực.
    reviewWrite: createRateLimiter({ windowMs: 60_000, limit: options.reviewRateLimit ?? 10 }),
    // Form liên hệ (§14.11): 3/10 phút/IP, store riêng, tính mọi request (kể cả honeypot/Bearer).
    contact: createRateLimiter({ windowMs: 600_000, limit: options.contactRateLimit ?? 3 }),
    // Báo cáo CSP (§14.12): 20/phút/IP, store riêng, đứng trước parser body.
    cspReport: createRateLimiter({ windowMs: 60_000, limit: options.cspReportRateLimit ?? 20 }),
    // Chỉ áp cho /admin/uploads (store riêng), đứng sau requireAuth/requireStaff.
    upload: createRateLimiter({ windowMs: 60_000, limit: options.uploadRateLimit ?? 30 }),
  };

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      autoLogging: {
        ignore: (req) =>
          (req.url?.startsWith(`${API_PREFIX}/health`) || req.url?.startsWith('/uploads/')) ??
          false,
      },
      serializers: {
        // Không log header (Authorization/Cookie) – chỉ giữ thông tin cần thiết
        req: (req) => ({ id: req.id, method: req.method, url: redactUrlForLog(req.url) }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_ORIGINS,
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'Retry-After', 'X-Cart-Token'],
    }),
  );
  // Ảnh tĩnh đặt TRƯỚC rate limit: một trang danh sách tải hàng chục ảnh, nếu tính vào hạn mức
  // 100 req/phút của API thì người dùng bình thường cũng bị 429. File tĩnh rẻ và công khai.
  // Không tìm thấy / dotfile / đường dẫn lạ -> fallthrough xuống notFound (404 JSON chuẩn).
  app.use(
    '/uploads',
    express.static(uploadsDir, {
      index: false,
      redirect: false, // thư mục -> 404 thay vì 301
      dotfiles: 'deny',
      fallthrough: true,
      maxAge: '1h',
    }),
  );
  app.use(
    createRateLimiter({
      windowMs: 60_000,
      limit: options.generalRateLimit ?? 100,
      skip: (req) =>
        req.path === `${API_PREFIX}/health` ||
        req.path === `${API_PREFIX}/health/live` ||
        isTrustedInternalRequest(req),
    }),
  );
  // Webhook Stripe cần RAW body (chữ ký tính trên byte gốc): PHẢI đứng trước express.json().
  // body-parser bỏ qua request đã được parse (req._body) nên json() không đụng tới path này.
  app.use(
    `${API_PREFIX}/payments/stripe/webhook`,
    express.raw({ type: 'application/json', limit: '1mb' }),
  );
  // CSP report: parser riêng (nuốt mọi lỗi thành 204), PHẢI trước express.json() toàn cục.
  app.use(API_PREFIX, createCspRouter({ limiter: limiters.cspReport }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use(API_PREFIX, healthRouter);
  app.use(API_PREFIX, createAuthRouter({ sensitiveLimiter: limiters.sensitive }));
  app.use(API_PREFIX, meRouter);
  app.use(API_PREFIX, wishlistRouter);
  app.use(API_PREFIX, catalogRouter);
  app.use(API_PREFIX, createReviewsRouter({ writeLimiter: limiters.reviewWrite }));
  app.use(API_PREFIX, createContactRouter({ contactLimiter: limiters.contact }));
  app.use(API_PREFIX, locationsRouter);
  app.use(API_PREFIX, settingsRouter);
  app.use(API_PREFIX, createCartRouter({ couponLimiter: limiters.coupon }));
  app.use(API_PREFIX, createCheckoutRouter({ quoteLimiter: limiters.quote }));
  app.use(
    API_PREFIX,
    createOrdersRouter({
      trackLimiter: limiters.track,
      guestCancelLimiter: limiters.guestCancel,
      orderLimiter: limiters.order,
    }),
  );
  app.use(
    API_PREFIX,
    createPaymentsRouter({
      createLimiter: limiters.paymentCreate,
      returnLimiter: limiters.paymentReturn,
      syncLimiter: limiters.paymentSync,
    }),
  );
  app.use(`${API_PREFIX}/admin`, createAdminRouter({ uploadLimiter: limiters.upload, uploadsDir }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
