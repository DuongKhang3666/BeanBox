"use client";

import { useState } from "react";
import type { AdminSettingsResult } from "../../api/settings";
import {
  ETA_METHODS,
  ETA_ZONES,
  SECTION_KEYS,
  SHIPPING_FIELD_PATHS,
  buildShippingPatch,
  latestUpdatedAt,
  shippingDraft,
  validateShipping,
  type ShippingDraft,
} from "../../settingsForm";
import { NumberField } from "./SettingsFields";
import { SectionCard } from "./SectionCard";
import { useSectionSave } from "./useSectionSave";

export function ShippingSection({
  result,
  onSaved,
}: {
  result: AdminSettingsResult;
  onSaved: (r: AdminSettingsResult) => void;
}) {
  const [d, setD] = useState<ShippingDraft>(() => shippingDraft(result.data));
  const { state, save, touch } = useSectionSave<ShippingDraft>({
    validate: validateShipping,
    build: buildShippingPatch,
    paths: () => SHIPPING_FIELD_PATHS,
    onSaved: (r) => {
      setD(shippingDraft(r.data));
      onSaved(r);
    },
  });
  const set = (k: keyof ShippingDraft) => (v: string) => {
    touch();
    setD((x) => ({ ...x, [k]: v }));
  };
  const setEta = (key: string) => (v: string) => {
    touch();
    setD((x) => ({ ...x, eta: { ...x.eta, [key]: v } }));
  };
  const e = state.errors;
  return (
    <SectionCard
      title="Phí vận chuyển"
      description="Phí theo khu vực và phương thức, ngưỡng miễn phí, phụ phí khối lượng và thời hạn thanh toán online. Đơn vị tiền: VND."
      updatedAt={latestUpdatedAt(SECTION_KEYS.shipping, result.meta.updatedAt)}
      state={state}
      onSubmit={() => void save(d)}
    >
      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold text-coffee-900">Phí theo khu vực</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            path="shipping.rates.inner.STANDARD"
            label="Nội thành - Tiêu chuẩn"
            suffix="₫"
            value={d.innerStandard}
            onChange={set("innerStandard")}
            error={e["shipping.rates.inner.STANDARD"]}
          />
          <NumberField
            path="shipping.rates.inner.EXPRESS"
            label="Nội thành - Nhanh"
            suffix="₫"
            value={d.innerExpress}
            onChange={set("innerExpress")}
            error={e["shipping.rates.inner.EXPRESS"]}
          />
          <NumberField
            path="shipping.rates.other.STANDARD"
            label="Tỉnh/thành khác - Tiêu chuẩn"
            suffix="₫"
            value={d.otherStandard}
            onChange={set("otherStandard")}
            error={e["shipping.rates.other.STANDARD"]}
          />
          <NumberField
            path="shipping.rates.other.EXPRESS"
            label="Tỉnh/thành khác - Nhanh"
            suffix="₫"
            value={d.otherExpress}
            onChange={set("otherExpress")}
            error={e["shipping.rates.other.EXPRESS"]}
          />
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold text-coffee-900">
          Thời gian giao dự kiến (ngày)
        </legend>
        <p className="text-sm text-coffee-700">
          Tính theo ngày lịch từ ngày đặt hàng (không loại trừ chủ nhật/ngày lễ). Chỉ là ước tính;
          đơn đã đặt giữ nguyên ngày dự kiến đã báo cho khách.
        </p>
        {ETA_ZONES.flatMap(({ zone, label: zl }) =>
          ETA_METHODS.map(({ method, label: ml }) => {
            const minKey = `${zone}.${method}.minDays`;
            const maxKey = `${zone}.${method}.maxDays`;
            return (
              <div key={`${zone}.${method}`} className="grid gap-3 sm:grid-cols-2">
                <NumberField
                  path={`shipping.eta.${minKey}`}
                  label={`${zl} - ${ml}: từ`}
                  suffix="ngày"
                  value={d.eta[minKey] ?? ""}
                  onChange={setEta(minKey)}
                  error={e[`shipping.eta.${minKey}`]}
                />
                <NumberField
                  path={`shipping.eta.${maxKey}`}
                  label={`${zl} - ${ml}: đến`}
                  suffix="ngày"
                  value={d.eta[maxKey] ?? ""}
                  onChange={setEta(maxKey)}
                  error={e[`shipping.eta.${maxKey}`]}
                />
              </div>
            );
          }),
        )}
      </fieldset>
      <NumberField
        path="shipping.freeShippingThreshold"
        label="Ngưỡng miễn phí vận chuyển Tiêu chuẩn"
        suffix="₫"
        hint="Đặt 0 để miễn phí vận chuyển Tiêu chuẩn cho mọi đơn."
        value={d.threshold}
        onChange={set("threshold")}
        error={e["shipping.freeShippingThreshold"]}
      />
      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold text-coffee-900">Phụ phí khối lượng</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField
            path="shipping.weightSurcharge.freeGram"
            label="Miễn phụ phí đến"
            suffix="g"
            value={d.freeGram}
            onChange={set("freeGram")}
            error={e["shipping.weightSurcharge.freeGram"]}
          />
          <NumberField
            path="shipping.weightSurcharge.stepGram"
            label="Mỗi bước vượt"
            suffix="g"
            value={d.stepGram}
            onChange={set("stepGram")}
            error={e["shipping.weightSurcharge.stepGram"]}
          />
          <NumberField
            path="shipping.weightSurcharge.feePerStep"
            label="Phụ phí mỗi bước"
            suffix="₫"
            hint="Đặt 0 để không thu phụ phí."
            value={d.feePerStep}
            onChange={set("feePerStep")}
            error={e["shipping.weightSurcharge.feePerStep"]}
          />
        </div>
      </fieldset>
      <NumberField
        path="order.paymentExpiryMinutes"
        label="Thời hạn thanh toán online"
        suffix="phút"
        hint="Từ 5 đến 120 phút. Quá hạn, đơn chờ thanh toán sẽ tự hủy."
        value={d.expiry}
        onChange={set("expiry")}
        error={e["order.paymentExpiryMinutes"]}
      />
    </SectionCard>
  );
}
