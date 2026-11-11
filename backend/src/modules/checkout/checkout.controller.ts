import type { PaymentConfig } from '../../config/payments.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { identityOf } from '../cart/cart.controller.js';
import type { QuoteInput } from './checkout.schema.js';
import * as service from './checkout.service.js';

export const quote = asyncHandler(async (req, res) => {
  res.json({
    data: await service.getQuote(
      identityOf(req),
      req.body as QuoteInput,
      req.app.locals.paymentConfig as PaymentConfig,
    ),
  });
});
