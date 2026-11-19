import type { Metadata } from "next";
import { WishlistView } from "@/features/wishlist/components/WishlistView";

export const metadata: Metadata = {
  title: "Sản phẩm yêu thích",
  robots: { index: false },
};

export default function Page() {
  return <WishlistView />;
}
