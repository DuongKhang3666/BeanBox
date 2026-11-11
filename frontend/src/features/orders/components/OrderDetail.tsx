import { formatDateTime } from "@/lib/format";
import type { Order } from "@/types/order";
import { paymentMethodLabel, paymentStatusLabel, shippingMethodLabel } from "../labels";
import { OrderItemsList } from "./OrderItemsList";
import { OrderTimeline } from "./OrderTimeline";
import { OrderTotals } from "./OrderTotals";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5">
      <h2 className="font-serif text-lg font-bold text-coffee-900">{title}</h2>
      {children}
    </section>
  );
}

/** Thông tin đầy đủ của một đơn (dùng cho trang thành công và chi tiết đơn trong tài khoản). */
export function OrderDetail({ order, timeline = true }: { order: Order; timeline?: boolean }) {
  const a = order.shippingAddress;
  return (
    <div className="space-y-4">
      <Card title="Thông tin đơn hàng">
        <dl className="grid gap-2 text-coffee-900 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-coffee-700">Ngày đặt</dt>
            <dd>{formatDateTime(order.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-sm text-coffee-700">Thanh toán</dt>
            <dd>
              {paymentMethodLabel(order.paymentMethod)} · {paymentStatusLabel(order.paymentStatus)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-coffee-700">Vận chuyển</dt>
            <dd>{shippingMethodLabel(order.shippingMethod)}</dd>
          </div>
          {order.trackingNumber ? (
            <div>
              <dt className="text-sm text-coffee-700">Mã vận đơn</dt>
              <dd>
                {order.trackingNumber}
                {order.carrier ? ` (${order.carrier})` : ""}
              </dd>
            </div>
          ) : null}
          {order.couponCode ? (
            <div>
              <dt className="text-sm text-coffee-700">Mã giảm giá</dt>
              <dd>{order.couponCode}</dd>
            </div>
          ) : null}
          {order.note ? (
            <div className="sm:col-span-2">
              <dt className="text-sm text-coffee-700">Ghi chú</dt>
              <dd className="whitespace-pre-line">{order.note}</dd>
            </div>
          ) : null}
          {order.cancelReason ? (
            <div className="sm:col-span-2">
              <dt className="text-sm text-coffee-700">Lý do hủy</dt>
              <dd>{order.cancelReason}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <Card title="Địa chỉ giao hàng">
        <address className="space-y-0.5 not-italic text-coffee-900">
          <p className="font-medium">
            {a.fullName} · {a.phone}
          </p>
          <p>
            {a.line1}, {a.wardName}, {a.provinceName}
          </p>
          <p className="text-sm text-coffee-700">
            Liên hệ: {order.contact.email} · {order.contact.phone}
          </p>
        </address>
      </Card>

      <Card title="Sản phẩm">
        <OrderItemsList
          label="Sản phẩm trong đơn"
          items={order.items.map((i) => ({
            key: i.id,
            productName: i.productName,
            variantName: i.variantName,
            imageUrl: i.imageUrl,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            lineTotal: i.lineTotal,
          }))}
        />
        <OrderTotals
          subtotal={order.subtotal}
          discountTotal={order.discountTotal}
          shippingFee={order.shippingFee}
          shippingDiscount={order.shippingDiscount}
          grandTotal={order.grandTotal}
        />
      </Card>

      {timeline && order.history.length > 0 ? (
        <Card title="Lịch sử đơn hàng">
          <OrderTimeline history={order.history} />
        </Card>
      ) : null}
    </div>
  );
}
