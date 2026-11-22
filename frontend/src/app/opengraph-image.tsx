import { renderDefaultOg } from "@/lib/og";

export const runtime = "nodejs";
export const alt = "BeanBox - Cà phê, dụng cụ pha chế & phụ kiện";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderDefaultOg();
}
