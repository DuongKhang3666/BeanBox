import { safeCsvFilename, type CsvRow } from '../../../lib/csv.js';
import { vnDateKey } from '../dashboard/dashboard.service.js';
import { getBreakdown, type BreakdownDto } from './analytics.breakdown.js';
import { getCoupons, type CouponsDto } from './analytics.coupons.js';
import { getCustomers, type CustomersDto } from './analytics.customers.js';
import { getInventory, type InventoryDto, type InventoryItem } from './analytics.inventory.js';
import { getOperations, type HoursStat, type OperationsDto } from './analytics.operations.js';
import {
  EXPORT_INVENTORY_ROWS,
  EXPORT_LIMIT_DEFAULT,
  type BreakdownDimension,
  type ExportQuery,
  type InventoryList,
} from './analytics.schema.js';
import {
  changePct,
  getOverview,
  round,
  type Compared,
  type ComparedRate,
  type OverviewDto,
} from './analytics.service.js';
import {
  getTopCustomers,
  getTopProducts,
  type TopCustomersDto,
  type TopProductsDto,
} from './analytics.top.js';

/**
 * Xuất CSV phân tích (api-contract §16.4, D-053). Dữ liệu lấy từ CHÍNH các hàm service của
 * response JSON; ở đây chỉ có các hàm thuần ánh xạ DTO -> hàng/cột (tiêu đề tiếng Việt).
 * Tiền và số đếm là số nguyên; tỷ lệ là phần trăm (số thập phân dấu chấm); null -> ô trống.
 * Không xuất userId, SĐT, địa chỉ hay mã đơn.
 */

const pct = (rate: number) => round(rate * 100, 2);

const METRIC_HEADER: CsvRow = ['Chỉ số', 'Kỳ này', 'Kỳ trước', 'Thay đổi (%)', 'Thay đổi (điểm %)'];

/** Chỉ số dạng số (tiền, đếm). */
const metric = (label: string, c: Compared): CsvRow => [
  label,
  c.current,
  c.previous,
  c.changePct,
  null,
];
/** Tỷ lệ 0..1 -> phần trăm; thay đổi theo điểm phần trăm. */
const rateMetric = (label: string, c: ComparedRate): CsvRow => [
  label,
  pct(c.current),
  pct(c.previous),
  null,
  c.changePts,
];

export function overviewRows(dto: OverviewDto): CsvRow[] {
  const k = dto.kpis;
  return [
    METRIC_HEADER,
    metric('Doanh thu (VND)', k.revenue),
    metric('Đơn đã thanh toán', k.paidOrders),
    metric('Giá trị đơn trung bình (VND)', k.aov),
    metric('Đơn đã đặt', k.ordersPlaced),
    metric('Đơn hủy', k.cancelledOrders),
    rateMetric('Tỷ lệ hủy (%)', k.cancelRate),
    metric('Giảm giá (VND)', k.discountTotal),
    metric('Hoàn tiền (VND)', k.refundedAmount),
    metric('Khách mới', k.newCustomers),
    metric('Lợi nhuận gộp (VND)', k.grossProfit),
    rateMetric('Biên lợi nhuận gộp (%)', k.grossMargin),
    rateMetric('Độ phủ giá vốn (%)', k.costCoverage),
  ];
}

export function seriesRows(dto: OverviewDto): CsvRow[] {
  const rows: CsvRow[] = [
    [
      'Bắt đầu',
      'Kết thúc',
      'Doanh thu (VND)',
      'Đơn đã thanh toán',
      'Đơn đã đặt',
      'Kỳ trước: bắt đầu',
      'Kỳ trước: kết thúc',
      'Kỳ trước: doanh thu (VND)',
      'Kỳ trước: đơn đã thanh toán',
      'Kỳ trước: đơn đã đặt',
    ],
  ];
  // Căn theo chỉ số bucket; kỳ trước có thể ngắn hơn hoặc dài hơn.
  const n = Math.max(dto.series.length, dto.previousSeries.length);
  for (let i = 0; i < n; i++) {
    const s = dto.series[i];
    const p = dto.previousSeries[i];
    rows.push([
      s?.start ?? null,
      s?.end ?? null,
      s?.revenue ?? null,
      s?.paidOrders ?? null,
      s?.ordersPlaced ?? null,
      p?.start ?? null,
      p?.end ?? null,
      p?.revenue ?? null,
      p?.paidOrders ?? null,
      p?.ordersPlaced ?? null,
    ]);
  }
  return rows;
}

const DIMENSION_LABEL: Record<BreakdownDimension, string> = {
  category: 'Danh mục',
  brand: 'Thương hiệu',
  paymentMethod: 'Phương thức thanh toán',
  shippingMethod: 'Phương thức vận chuyển',
  province: 'Tỉnh/thành',
};

export function breakdownRows(dto: BreakdownDto): CsvRow[] {
  const rows: CsvRow[] = [
    [
      DIMENSION_LABEL[dto.dimension],
      'Doanh thu (VND)',
      'Số đơn',
      'Số lượng',
      'Tỷ trọng (%)',
      'Doanh thu kỳ trước (VND)',
      'Thay đổi doanh thu (%)',
    ],
  ];
  for (const g of dto.groups) {
    rows.push([
      g.label,
      g.revenue,
      g.orders,
      g.quantity,
      pct(g.share),
      g.previousRevenue,
      g.changePct,
    ]);
  }
  rows.push([
    'Tổng',
    dto.total.revenue,
    dto.total.orders,
    dto.total.quantity,
    null,
    dto.previousTotal.revenue,
    changePct(dto.total.revenue, dto.previousTotal.revenue),
  ]);
  return rows;
}

export function topProductsRows(dto: TopProductsDto): CsvRow[] {
  return [
    [
      'Hạng',
      'Sản phẩm',
      'Danh mục',
      'Doanh thu (VND)',
      'Số lượng',
      'Số đơn',
      'Ghi chú',
      'Giá vốn hàng bán (VND)',
      'Lợi nhuận gộp (VND)',
      'Biên lợi nhuận (%)',
      'Độ phủ giá vốn (%)',
    ],
    ...dto.items.map((p, i): CsvRow => [
      i + 1,
      p.name,
      p.categoryName,
      p.revenue,
      p.quantity,
      p.orders,
      p.deleted ? 'Đã xóa' : null,
      p.cogs,
      p.grossProfit,
      p.margin === null ? null : pct(p.margin),
      pct(p.costCoverage),
    ]),
  ];
}

export function topCustomersRows(dto: TopCustomersDto): CsvRow[] {
  return [
    [
      'Hạng',
      'Loại khách',
      'Tên',
      'Email',
      'Số đơn',
      'Doanh thu (VND)',
      'Giá trị đơn trung bình (VND)',
      'Thanh toán gần nhất',
    ],
    ...dto.items.map((c, i): CsvRow => [
      i + 1,
      c.customerType === 'registered' ? 'Thành viên' : 'Khách vãng lai',
      c.name,
      c.email,
      c.orders,
      c.revenue,
      c.aov,
      c.lastPaidAt,
    ]),
  ];
}

const COUPON_TYPE_LABEL: Record<string, string> = {
  PERCENT: 'Giảm theo phần trăm',
  FIXED: 'Giảm số tiền cố định',
  FREESHIP: 'Miễn phí vận chuyển',
};

export function couponsRows(dto: CouponsDto): CsvRow[] {
  return [
    [
      'Mã giảm giá',
      'Loại',
      'Trạng thái',
      'Lượt dùng',
      'Tiền giảm (VND)',
      'Doanh thu (VND)',
      'Giá trị đơn trung bình (VND)',
      'Lượt dùng kỳ trước',
      'Doanh thu kỳ trước (VND)',
      'Thay đổi doanh thu (%)',
    ],
    ...dto.items.map((c): CsvRow => [
      c.code,
      c.type ? (COUPON_TYPE_LABEL[c.type] ?? c.type) : null,
      c.deleted ? 'Đã xóa' : c.isActive ? 'Đang bật' : 'Đã tắt',
      c.uses,
      c.discount,
      c.revenue,
      c.aov,
      c.previousUses,
      c.previousRevenue,
      c.changePct,
    ]),
  ];
}

export function customersRows(dto: CustomersDto): CsvRow[] {
  return [
    METRIC_HEADER,
    metric('Khách mua hàng', dto.buyers),
    metric('Khách mua lần đầu', dto.firstTime),
    metric('Khách quay lại', dto.returning),
    rateMetric('Tỷ lệ mua lại (%)', dto.repeatRate),
    metric('Doanh thu khách mới (VND)', dto.firstTimeRevenue),
    metric('Doanh thu khách quay lại (VND)', dto.returningRevenue),
  ];
}

/** Giờ: kỳ này (trung bình) và kỳ trước (trung bình); thay đổi % khi cả hai có giá trị. */
const hoursMetric = (label: string, h: HoursStat): CsvRow => [
  label,
  h.avg,
  h.previousAvg,
  h.avg !== null && h.previousAvg !== null ? changePct(h.avg, h.previousAvg) : null,
  null,
];

export function operationsRows(dto: OperationsDto): CsvRow[] {
  const c = dto.cancellations;
  return [
    METRIC_HEADER,
    metric('Đơn hủy (tổng)', c.total),
    ...c.byType.map((t): CsvRow => [
      `Đơn hủy: ${t.label}`,
      t.current,
      t.previous,
      changePct(t.current, t.previous),
      null,
    ]),
    metric('Đơn đã giao', dto.returns.delivered),
    metric('Đơn bị trả hàng', dto.returns.returned),
    rateMetric('Tỷ lệ trả hàng (%)', dto.returns.rate),
    metric('Số lần hoàn tiền', dto.refunds.count),
    metric('Số tiền hoàn (VND)', dto.refunds.amount),
    hoursMetric('Từ lúc đặt đến lúc xác nhận: trung bình (giờ)', dto.fulfillment.confirmHours),
    [
      'Từ lúc đặt đến lúc xác nhận: trung vị (giờ)',
      dto.fulfillment.confirmHours.median,
      null,
      null,
      null,
    ],
    ['Từ lúc đặt đến lúc xác nhận: số đơn', dto.fulfillment.confirmHours.n, null, null, null],
    hoursMetric('Từ lúc xác nhận đến lúc giao: trung bình (giờ)', dto.fulfillment.deliveryHours),
    [
      'Từ lúc xác nhận đến lúc giao: trung vị (giờ)',
      dto.fulfillment.deliveryHours.median,
      null,
      null,
      null,
    ],
    ['Từ lúc xác nhận đến lúc giao: số đơn', dto.fulfillment.deliveryHours.n, null, null, null],
  ];
}

export function inventoryRows(items: InventoryItem[]): CsvRow[] {
  return [
    [
      'Sản phẩm',
      'Biến thể',
      'SKU',
      'Tồn kho',
      'Ngưỡng sắp hết',
      'Giá niêm yết (VND)',
      'Giá trị tồn (VND)',
      'Bán gần nhất',
      'Giá vốn bình quân (VND)',
      'Giá trị tồn theo giá vốn (VND)',
    ],
    ...items.map((i): CsvRow => [
      i.productName,
      i.variantName,
      i.sku,
      i.stock,
      i.lowStockThreshold,
      i.price,
      i.stockValue,
      i.lastSoldAt,
      i.avgCost,
      i.stockCostValue,
    ]),
  ];
}

export interface ExportFile {
  filename: string;
  rows: CsvRow[];
  /** Số dòng dữ liệu (không tính dòng tiêu đề). */
  rowCount: number;
  /** Tham số hiệu lực (đã chuẩn hóa) để ghi audit; không chứa dữ liệu cá nhân. */
  params: Record<string, string | number>;
}

const dates = (from: string, to: string) => `${from}_${to}`;

function finish(
  rows: CsvRow[],
  filename: string,
  params: Record<string, string | number | undefined>,
): ExportFile {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined),
  ) as Record<string, string | number>;
  return { filename, rows, rowCount: Math.max(rows.length - 1, 0), params: clean };
}

export async function buildExport(q: ExportQuery, now: Date = new Date()): Promise<ExportFile> {
  switch (q.report) {
    case 'overview':
    case 'series': {
      const dto = await getOverview(
        {
          ...(q.from ? { from: q.from } : {}),
          ...(q.to ? { to: q.to } : {}),
          ...(q.granularity ? { granularity: q.granularity } : {}),
        },
        now,
      );
      const rows = q.report === 'overview' ? overviewRows(dto) : seriesRows(dto);
      return finish(
        rows,
        safeCsvFilename({ report: q.report, dates: dates(dto.range.from, dto.range.to) }),
        {
          report: q.report,
          from: dto.range.from,
          to: dto.range.to,
          ...(q.report === 'series' ? { granularity: dto.range.granularity } : {}),
        },
      );
    }
    case 'breakdown': {
      const dto = await getBreakdown(
        {
          dimension: q.dimension,
          ...(q.from ? { from: q.from } : {}),
          ...(q.to ? { to: q.to } : {}),
        },
        now,
      );
      return finish(
        breakdownRows(dto),
        safeCsvFilename({
          report: q.report,
          qualifier: q.dimension,
          dates: dates(dto.range.from, dto.range.to),
        }),
        { report: q.report, dimension: q.dimension, from: dto.range.from, to: dto.range.to },
      );
    }
    case 'top-products': {
      const limit = q.limit ?? EXPORT_LIMIT_DEFAULT;
      const dto = await getTopProducts(
        {
          ...(q.from ? { from: q.from } : {}),
          ...(q.to ? { to: q.to } : {}),
          ...(q.sort ? { sort: q.sort } : {}),
          limit,
        },
        now,
      );
      return finish(
        topProductsRows(dto),
        safeCsvFilename({ report: q.report, dates: dates(dto.range.from, dto.range.to) }),
        { report: q.report, from: dto.range.from, to: dto.range.to, sort: dto.sort, limit },
      );
    }
    case 'top-customers': {
      const limit = q.limit ?? EXPORT_LIMIT_DEFAULT;
      const dto = await getTopCustomers(
        {
          ...(q.from ? { from: q.from } : {}),
          ...(q.to ? { to: q.to } : {}),
          ...(q.sort ? { sort: q.sort } : {}),
          limit,
        },
        now,
      );
      return finish(
        topCustomersRows(dto),
        safeCsvFilename({ report: q.report, dates: dates(dto.range.from, dto.range.to) }),
        { report: q.report, from: dto.range.from, to: dto.range.to, sort: dto.sort, limit },
      );
    }
    case 'coupons': {
      const limit = q.limit ?? EXPORT_LIMIT_DEFAULT;
      const dto = await getCoupons(
        {
          ...(q.from ? { from: q.from } : {}),
          ...(q.to ? { to: q.to } : {}),
          ...(q.sort ? { sort: q.sort } : {}),
          limit,
        },
        now,
      );
      return finish(
        couponsRows(dto),
        safeCsvFilename({ report: q.report, dates: dates(dto.range.from, dto.range.to) }),
        { report: q.report, from: dto.range.from, to: dto.range.to, sort: dto.sort, limit },
      );
    }
    case 'customers':
    case 'operations': {
      const range = { ...(q.from ? { from: q.from } : {}), ...(q.to ? { to: q.to } : {}) };
      const dto =
        q.report === 'customers' ? await getCustomers(range, now) : await getOperations(range, now);
      const rows =
        q.report === 'customers'
          ? customersRows(dto as CustomersDto)
          : operationsRows(dto as OperationsDto);
      return finish(
        rows,
        safeCsvFilename({ report: q.report, dates: dates(dto.range.from, dto.range.to) }),
        { report: q.report, from: dto.range.from, to: dto.range.to },
      );
    }
    case 'inventory': {
      const dto: InventoryDto = await getInventory(
        q.slowDays !== undefined ? { slowDays: q.slowDays } : {},
        now,
        EXPORT_INVENTORY_ROWS,
      );
      const list: InventoryList = q.list;
      const today = vnDateKey(now);
      return finish(
        inventoryRows(dto[list]),
        safeCsvFilename({ report: q.report, qualifier: list, dates: today }),
        { report: q.report, list, ...(list === 'slowMovers' ? { slowDays: dto.slowDays } : {}) },
      );
    }
  }
}
