import { useState } from "react";
import { useCart } from "@/features/cart/CartProvider";
import { cartErrorMessage } from "@/features/cart/messages";
import type { Problem } from "./useCheckoutSubmit";

/** Nút "Bỏ mã" trong thông báo lỗi checkout. */
export function useCouponRemoval(setProblem: (p: Problem | null) => void) {
  const { removeCoupon, pending } = useCart();
  const [removing, setRemoving] = useState(false);

  async function onRemoveCoupon() {
    setRemoving(true);
    try {
      await removeCoupon();
      setProblem(null);
    } catch (err) {
      setProblem({ message: cartErrorMessage(err), action: "removeCoupon" });
    } finally {
      setRemoving(false);
    }
  }

  return { onRemoveCoupon, couponBusy: removing || pending.coupon };
}
