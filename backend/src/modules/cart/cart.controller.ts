import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import type { AddItemInput, ApplyCouponInput, UpdateItemInput } from './cart.schema.js';
import * as service from './cart.service.js';

export function identityOf(req: Request): service.CartIdentity {
  if (req.auth) return { kind: 'user', userId: req.auth.userId };
  return { kind: 'guest', token: service.parseCartToken(req.get('x-cart-token')) };
}

const itemIdOf = (req: Request): string => String(req.params.itemId ?? '');

function send(res: Response, cart: service.CartDto, status = 200, meta?: object): void {
  if (cart.cartToken) res.setHeader('X-Cart-Token', cart.cartToken);
  res.status(status).json(meta ? { data: cart, meta } : { data: cart });
}

export const getCart = asyncHandler(async (req, res) => {
  send(res, await service.getCart(identityOf(req)));
});

export const addItem = asyncHandler(async (req, res) => {
  send(res, await service.addItem(identityOf(req), req.body as AddItemInput), 201);
});

export const updateItem = asyncHandler(async (req, res) => {
  send(res, await service.updateItem(identityOf(req), itemIdOf(req), req.body as UpdateItemInput));
});

export const removeItem = asyncHandler(async (req, res) => {
  send(res, await service.removeItem(identityOf(req), itemIdOf(req)));
});

export const clearCart = asyncHandler(async (req, res) => {
  send(res, await service.clearCart(identityOf(req)));
});

export const applyCoupon = asyncHandler(async (req, res) => {
  send(res, await service.applyCoupon(identityOf(req), (req.body as ApplyCouponInput).code));
});

export const removeCoupon = asyncHandler(async (req, res) => {
  send(res, await service.removeCoupon(identityOf(req)));
});

export const mergeCart = asyncHandler(async (req, res) => {
  const result = await service.mergeGuestCart(
    req.auth!.userId,
    service.parseCartToken(req.get('x-cart-token')),
  );
  send(res, result.cart, 200, result.meta);
});
