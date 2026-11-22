import "server-only";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "next/og";
import { formatVND } from "@/lib/format";
import { SITE_NAME } from "@/lib/site";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";
export const OG_TAGLINE = "Hạt cà phê, dụng cụ pha chế và phụ kiện";

// Màu lấy từ theme Tailwind (globals.css): coffee / cream / moss.
const COLORS = {
  bg: "#432e1f", // coffee-800
  bgDeep: "#2e1f15", // coffee-900
  text: "#fdfaf5", // cream-50
  muted: "#e8dac0", // cream-300
  accent: "#62803f", // moss-500
  card: "#faf5ec", // cream-100
  cardText: "#2e1f15",
};

/** Font Be Vietnam Pro (OFL) đặt cục bộ để chữ có dấu hiển thị đúng; satori không đọc woff2. */
let fontCache: Promise<{ regular: Buffer; bold: Buffer }> | null = null;
function loadFonts() {
  fontCache ??= Promise.all([
    readFile(fileURLToPath(new URL("../assets/fonts/BeVietnamPro-Regular.ttf", import.meta.url))),
    readFile(fileURLToPath(new URL("../assets/fonts/BeVietnamPro-Bold.ttf", import.meta.url))),
  ])
    .then(([regular, bold]) => ({ regular, bold }))
    .catch((e) => {
      fontCache = null;
      throw e;
    });
  return fontCache;
}

export interface ProductOgData {
  name: string;
  /** Giá hiệu lực thấp nhất (VND). */
  price: number;
  category?: string | null;
  brand?: string | null;
  /** Data URI của ảnh raster đã kiểm tra; bỏ trống = không vẽ ảnh. */
  imageDataUri?: string | null;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Nhận diện PNG/JPEG/WebP theo magic bytes (không tin Content-Type, không nhận SVG). */
export function sniffRaster(buf: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  const isPng =
    buf.length > 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a;
  if (isPng) return "image/png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  const ascii = (from: number, s: string) =>
    [...s].every((ch, i) => buf[from + i] === ch.charCodeAt(0));
  if (buf.length > 12 && ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  return null;
}

/**
 * Tải ảnh sản phẩm từ backend nội bộ làm data URI. Chỉ nhận đường dẫn /uploads/... (không SSRF tới URL
 * tùy ý), tối đa 2 MB, hết 3 giây thì bỏ. Mọi lỗi hoặc ảnh không phải raster (vd. SVG seed) -> null.
 */
export async function fetchRasterImage(url: string | null | undefined): Promise<string | null> {
  if (!url || !url.startsWith("/uploads/") || url.includes("..")) return null;
  const base = (process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}${url}`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null;
    const type = sniffRaster(buf);
    if (!type) return null;
    return `data:${type};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: `linear-gradient(135deg, ${COLORS.bg} 0%, ${COLORS.bgDeep} 100%)`,
        color: COLORS.text,
        fontFamily: "Be Vietnam Pro",
      }}
    >
      <div style={{ display: "flex", height: 16, background: COLORS.accent }} />
      <div style={{ display: "flex", flex: 1, padding: "56px 72px" }}>{children}</div>
    </div>
  );
}

function DefaultCard() {
  return (
    <Frame>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            letterSpacing: 4,
            color: COLORS.muted,
            textTransform: "uppercase",
          }}
        >
          Cà phê · Dụng cụ · Phụ kiện
        </div>
        <div style={{ display: "flex", fontSize: 136, fontWeight: 700, marginTop: 16 }}>
          {SITE_NAME}
        </div>
        <div style={{ display: "flex", fontSize: 40, color: COLORS.muted, marginTop: 16 }}>
          {OG_TAGLINE}
        </div>
      </div>
    </Frame>
  );
}

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function ProductCard({ data }: { data: ProductOgData }) {
  const meta = [data.brand, data.category].filter(Boolean).join(" · ");
  return (
    <Frame>
      <div style={{ display: "flex", flex: 1, gap: 48, alignItems: "center" }}>
        <div
          style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}
        >
          {meta ? (
            <div
              style={{
                display: "flex",
                fontSize: 30,
                color: COLORS.muted,
                textTransform: "uppercase",
                letterSpacing: 2,
              }}
            >
              {clip(meta, 50)}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              fontSize: data.name.length > 40 ? 56 : 72,
              fontWeight: 700,
              lineHeight: 1.15,
              marginTop: 16,
            }}
          >
            {clip(data.name, 80)}
          </div>
          <div style={{ display: "flex", marginTop: 32 }}>
            <div
              style={{
                display: "flex",
                fontSize: 52,
                fontWeight: 700,
                color: COLORS.cardText,
                background: COLORS.card,
                padding: "8px 28px",
                borderRadius: 16,
              }}
            >
              {`Từ ${formatVND(data.price)}`}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 32,
              fontWeight: 700,
              marginTop: 40,
              color: COLORS.muted,
            }}
          >
            {SITE_NAME}
          </div>
        </div>
        {data.imageDataUri ? (
          <div
            style={{
              display: "flex",
              width: 400,
              height: 400,
              borderRadius: 24,
              overflow: "hidden",
              background: COLORS.card,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- satori, không phải trang web */}
            <img
              src={data.imageDataUri}
              alt=""
              width={400}
              height={400}
              style={{ objectFit: "cover" }}
            />
          </div>
        ) : null}
      </div>
    </Frame>
  );
}

const CACHE_HEADERS = {
  "Content-Type": OG_CONTENT_TYPE,
  "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
};

async function render(node: React.ReactElement): Promise<Response> {
  const fonts = await loadFonts();
  const img = new ImageResponse(node, {
    ...OG_SIZE,
    fonts: [
      { name: "Be Vietnam Pro", data: fonts.regular, weight: 400, style: "normal" },
      { name: "Be Vietnam Pro", data: fonts.bold, weight: 700, style: "normal" },
    ],
  });
  // Đọc hết tại đây để lỗi dựng ảnh (vd. ảnh sản phẩm hỏng) bị bắt được và có thể lùi về ảnh mặc định.
  const body = await img.arrayBuffer();
  return new Response(body, { headers: CACHE_HEADERS });
}

export function renderDefaultOg(): Promise<Response> {
  return render(<DefaultCard />);
}

/** Ảnh OG của sản phẩm; mọi lỗi (kể cả ảnh) lùi về bản không ảnh rồi ảnh mặc định, không bao giờ ném. */
export async function renderProductOg(data: ProductOgData): Promise<Response> {
  try {
    return await render(<ProductCard data={data} />);
  } catch {
    if (data.imageDataUri) {
      try {
        return await render(<ProductCard data={{ ...data, imageDataUri: null }} />);
      } catch {
        /* lùi tiếp */
      }
    }
    return renderDefaultOg();
  }
}
