import { asyncHandler } from '../../../lib/asyncHandler.js';
import { writeAudit, type AuditDiff } from '../../../lib/audit.js';
import { toCsv } from '../../../lib/csv.js';
import { prisma } from '../../../lib/prisma.js';
import { getCoupons } from './analytics.coupons.js';
import { buildExport } from './analytics.export.js';
import { getBreakdown } from './analytics.breakdown.js';
import { getCustomers } from './analytics.customers.js';
import { getInventory } from './analytics.inventory.js';
import { getOperations } from './analytics.operations.js';
import type {
  BreakdownQuery,
  CouponsQuery,
  ExportQuery,
  InventoryQuery,
  OverviewQuery,
  RangeOnlyQuery,
  TopCustomersQuery,
  TopProductsQuery,
} from './analytics.schema.js';
import { getOverview } from './analytics.service.js';
import { getTopCustomers, getTopProducts } from './analytics.top.js';

export const overview = asyncHandler(async (req, res) => {
  res.json({ data: await getOverview(req.query as unknown as OverviewQuery) });
});

export const breakdown = asyncHandler(async (req, res) => {
  res.json({ data: await getBreakdown(req.query as unknown as BreakdownQuery) });
});

export const topProducts = asyncHandler(async (req, res) => {
  res.json({ data: await getTopProducts(req.query as unknown as TopProductsQuery) });
});

export const topCustomers = asyncHandler(async (req, res) => {
  res.json({ data: await getTopCustomers(req.query as unknown as TopCustomersQuery) });
});

export const customers = asyncHandler(async (req, res) => {
  res.json({ data: await getCustomers(req.query as unknown as RangeOnlyQuery) });
});

export const operations = asyncHandler(async (req, res) => {
  res.json({ data: await getOperations(req.query as unknown as RangeOnlyQuery) });
});

export const inventory = asyncHandler(async (req, res) => {
  res.json({ data: await getInventory(req.query as unknown as InventoryQuery) });
});

export const coupons = asyncHandler(async (req, res) => {
  res.json({ data: await getCoupons(req.query as unknown as CouponsQuery) });
});

/**
 * Xuất CSV (§16.4). Ghi audit THÀNH CÔNG trước khi gửi body (fail-closed: audit lỗi -> 500,
 * không trả file). Audit chỉ chứa tham số báo cáo và số dòng, không có dữ liệu khách hàng.
 */
export const exportCsv = asyncHandler(async (req, res) => {
  const file = await buildExport(req.query as unknown as ExportQuery);
  const diff: AuditDiff = { rows: [null, file.rowCount] };
  for (const [k, v] of Object.entries(file.params)) diff[k] = [null, v];
  await prisma.$transaction((tx) =>
    writeAudit(tx, {
      actorId: req.auth!.userId,
      action: 'analytics.export',
      entity: 'analytics',
      entityId: String(file.params.report),
      diff,
      ip: req.ip ?? null,
    }),
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(toCsv(file.rows));
});
