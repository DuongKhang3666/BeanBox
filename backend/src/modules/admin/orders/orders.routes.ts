import { Router } from 'express';
import { requireAdmin } from '../../../middlewares/auth.js';
import { validate } from '../../../middlewares/validate.js';
import * as controller from './orders.controller.js';
import {
  addOrderNoteSchema,
  adminOrdersQuerySchema,
  printOrdersQuerySchema,
  refundPaymentSchema,
  updateOrderStatusSchema,
} from './orders.schema.js';

/** Mount tại `/orders` dưới admin router (đã requireAuth + requireStaff). */
export const adminOrdersRouter = Router();

adminOrdersRouter.get('/', validate(adminOrdersQuerySchema, 'query'), controller.listOrders);
// D-072: khai báo TRƯỚC `/:code` để `print` không bị coi là mã đơn.
adminOrdersRouter.get('/print', validate(printOrdersQuerySchema, 'query'), controller.printOrders);
adminOrdersRouter.get('/:code', controller.getOrder);
// D-071: ghi chú nội bộ (Staff+ đọc/thêm, chỉ Admin xóa; không có sửa).
adminOrdersRouter.get('/:code/notes', controller.listNotes);
adminOrdersRouter.post('/:code/notes', validate(addOrderNoteSchema), controller.addNote);
adminOrdersRouter.delete('/:code/notes/:noteId', requireAdmin, controller.deleteNote);
adminOrdersRouter.patch(
  '/:code/status',
  validate(updateOrderStatusSchema),
  controller.updateStatus,
);
// Ghi nhận hoàn tiền thủ công: chỉ Admin (D-015).
adminOrdersRouter.post(
  '/:code/refunds',
  requireAdmin,
  validate(refundPaymentSchema),
  controller.refundPayment,
);
// D-061: xác nhận đã nhận tiền chuyển khoản, Staff+ (router cha đã requireStaff).
adminOrdersRouter.post('/:code/bank-transfer/confirm', controller.confirmBankTransfer);
