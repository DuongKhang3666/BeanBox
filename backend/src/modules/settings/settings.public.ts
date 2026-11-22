import type { CaptchaConfig } from '../../lib/turnstile.js';
import { loadLocations } from '../locations/locations.data.js';
import { getAllSettings, type HomeBanner, type StoreContact } from './settings.service.js';

/** Whitelist công khai: KHÔNG trả innerCityWardCodes, isActive hay key nào khác. */
export async function getPublicSettings(captcha: CaptchaConfig | null = null) {
  const { values: v } = await getAllSettings();
  const { provinces } = loadLocations();
  const provinceCodes = v['shipping.innerCityProvinceCodes'] as string[];
  const contact = v['store.contact'] as StoreContact;
  const banners = v['home.banners'] as HomeBanner[];
  return {
    shipping: {
      rates: v['shipping.rates'],
      eta: v['shipping.eta'],
      freeShippingThreshold: v['shipping.freeShippingThreshold'],
      weightSurcharge: v['shipping.weightSurcharge'],
      innerCityProvinces: provinceCodes.flatMap((code) => {
        const p = provinces.get(code);
        return p ? [{ code: p.code, name: p.name }] : [];
      }),
      innerCityWardCount: (v['shipping.innerCityWardCodes'] as string[]).length,
    },
    order: { paymentExpiryMinutes: v['order.paymentExpiryMinutes'] },
    store: {
      contact: {
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        address: contact.address,
      },
    },
    // D-028: chỉ site key (công khai); KHÔNG bao giờ trả secret.
    contactCaptcha: captcha ? { provider: 'turnstile' as const, siteKey: captcha.siteKey } : null,
    home: {
      banners: banners
        .filter((b) => b.isActive)
        .map((b) => ({
          imageUrl: b.imageUrl,
          alt: b.alt,
          title: b.title,
          subtitle: b.subtitle,
          href: b.href,
        })),
    },
  };
}
