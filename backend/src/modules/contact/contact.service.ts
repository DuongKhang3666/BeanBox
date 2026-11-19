import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sendMailInBackground } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';
import type { TurnstileVerifier } from '../../lib/turnstile.js';
import { getAllSettings, type StoreContact } from '../settings/settings.service.js';
import { buildContactNotification } from './contact.emails.js';
import type { CreateContactInput } from './contact.schema.js';

/** Form liên hệ (api-contract §14.11). Không lưu IP/user agent. */

export async function submitContact(
  input: CreateContactInput,
  userId: string | null,
  /** Có giá trị khi captcha bật (D-028); null = tắt. */
  captcha: { verify: TurnstileVerifier } | null = null,
): Promise<{ received: true }> {
  if ((input.website ?? '').trim() !== '') {
    logger.info('contact honeypot');
    return { received: true };
  }

  if (captcha) {
    const token = (input.captchaToken ?? '').trim();
    const failed = () =>
      new AppError(400, 'CAPTCHA_FAILED', 'Xác minh captcha không thành công, vui lòng thử lại');
    if (token === '') throw failed();
    const result = await captcha.verify(token);
    if (result === 'invalid') throw failed();
    if (result === 'unavailable') {
      throw new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        'Không thể xác minh captcha lúc này, vui lòng thử lại sau',
      );
    }
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
