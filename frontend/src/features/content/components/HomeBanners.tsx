import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import type { PublicBanner } from "@/types/settings";
import { isSafeBanner } from "../publicSettingsDefaults";

function BannerCard({ banner, priority }: { banner: PublicBanner; priority: boolean }) {
  const inner = (
    <>
      <div className="relative aspect-[16/9] bg-cream-200">
        <Image
          src={banner.imageUrl}
          alt={banner.alt}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover"
          priority={priority}
        />
      </div>
      {banner.title || banner.subtitle ? (
        <div className="p-4">
          {banner.title ? (
            <p className="font-serif text-lg font-semibold text-coffee-900">{banner.title}</p>
          ) : null}
          {banner.subtitle ? (
            <p className="mt-1 text-sm text-coffee-700">{banner.subtitle}</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
  const cls = "block overflow-hidden rounded-2xl border border-coffee-200 bg-cream-50";
  return banner.href ? (
    <Link
      href={banner.href}
      className={`${cls} transition-colors hover:border-moss-600 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss-600`}
    >
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Dải banner dưới hero. Không có banner hợp lệ -> không render gì. */
export function HomeBanners({ banners }: { banners: readonly PublicBanner[] }) {
  const safe = banners.filter((b) => b.isActive !== false && isSafeBanner(b)).slice(0, 5);
  if (safe.length === 0) return null;
  return (
    <section aria-label="Ưu đãi và thông báo" className="pt-8">
      <Container>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {safe.map((b, i) => (
            <li key={`${b.imageUrl}-${i}`}>
              <BannerCard banner={b} priority={i === 0} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
