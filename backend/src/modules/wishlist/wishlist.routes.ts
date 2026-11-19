import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './wishlist.controller.js';
import { addWishlistSchema } from './wishlist.schema.js';

/** Mount tại API prefix; mọi route dưới `/me/wishlist` đều yêu cầu đăng nhập (api-contract §14.2). */
export const wishlistRouter = Router();

wishlistRouter.get('/me/wishlist', requireAuth, controller.list);
// `/ids` khai báo riêng, không xung đột với `/:productId` (khác method và khác số đoạn path)
wishlistRouter.get('/me/wishlist/ids', requireAuth, controller.ids);
wishlistRouter.post('/me/wishlist', requireAuth, validate(addWishlistSchema), controller.add);
wishlistRouter.delete('/me/wishlist/:productId', requireAuth, controller.remove);
