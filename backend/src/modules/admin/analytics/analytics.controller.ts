import { asyncHandler } from '../../../lib/asyncHandler.js';
import { getBreakdown } from './analytics.breakdown.js';
import { getCustomers } from './analytics.customers.js';
import { getInventory } from './analytics.inventory.js';
import { getOperations } from './analytics.operations.js';
import type {
  BreakdownQuery,
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
