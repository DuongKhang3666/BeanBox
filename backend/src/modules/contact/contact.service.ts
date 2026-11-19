import { logger } from '../../lib/logger.js';
import { sendMailInBackground } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';
import { getAllSettings, type StoreContact } from '../settings/settings.service.js';
import { buildContactNotification } from './contact.emails.js';
import type { CreateContactInput } from './contact.schema.js';

/** Form liên hệ (api-contract §14.11). Không lưu IP/user agent. */

export async function submitContact(
  input: CreateContactInput,
  userId: string | null,
): Promise<{ received: true }> {
  if ((input.website ?? '').trim() !== '') {
    logger.info('contact honeypot');
    return { received: true };
  }

  await prisma.contactMessage.create({
    data: {
      userId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      subject: input.subject,
      message: input.message,
    },
    select: { id: true },
  });

  // Sau khi tạo thành công: đọc email cửa hàng lúc gửi; mọi lỗi chỉ log (không log nội dung).
  void (async () => {
    try {
      const { values } = await getAllSettings();
      sendMailInBackground(
        buildContactNotification({
          to: (values['store.contact'] as StoreContact).email,
          name: input.name,
          email: input.email,
          phone: input.phone,
          subject: input.subject,
          message: input.message,
        }),
      );
    } catch (err) {
      logger.error({ err }, 'Không chuẩn bị được email liên hệ');
    }
  })();

  return { received: true };
}
