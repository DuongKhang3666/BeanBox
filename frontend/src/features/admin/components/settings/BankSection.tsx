"use client";

import { useState } from "react";
import type { AdminSettingsResult } from "../../api/settings";
import {
  BANK_FIELD_PATHS,
  DEMO_BANK_BIN,
  SECTION_KEYS,
  bankDraft,
  buildBankPatch,
  latestUpdatedAt,
  validateBank,
  type BankDraft,
} from "../../settingsForm";
import { SectionCard } from "./SectionCard";
import { TextField } from "./SettingsFields";
import { useSectionSave } from "./useSectionSave";

export function BankSection({
  result,
  onSaved,
}: {
  result: AdminSettingsResult;
  onSaved: (r: AdminSettingsResult) => void;
}) {
  const [d, setD] = useState<BankDraft>(() => bankDraft(result.data));
  const { state, save, touch } = useSectionSave<BankDraft>({
    validate: validateBank,
    build: buildBankPatch,
    paths: () => BANK_FIELD_PATHS,
    onSaved: (r) => {
      setD(bankDraft(r.data));
      onSaved(r);
    },
  });
  const set = (k: keyof BankDraft) => (v: string) => {
    touch();
    setD((x) => ({ ...x, [k]: v }));
  };
  const e = state.errors;
  const isDemo = d.bankBin.trim() === DEMO_BANK_BIN;
  return (
    <SectionCard
      title="Tài khoản nhận chuyển khoản"
      description="Dùng để dựng mã VietQR cho đơn thanh toán bằng chuyển khoản (chỉ hiện khi máy chủ bật BANK_TRANSFER_ENABLED)."
      updatedAt={latestUpdatedAt(SECTION_KEYS.payment, result.meta.updatedAt)}
      state={state}
      onSubmit={() => void save(d)}
    >
      {isDemo ? (
        <p role="note" className="rounded-lg bg-cream-100 px-3 py-2 text-sm text-coffee-900">
          Đang dùng BIN demo <strong>{DEMO_BANK_BIN}</strong> (không tồn tại): ứng dụng ngân hàng
          không thể chuyển tiền thật tới mã QR này. Chỉ đổi khi bạn thực sự muốn nhận tiền.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          path="payment.bankTransfer.bankBin"
          label="Mã BIN ngân hàng"
          maxLength={6}
          hint="6 chữ số theo danh mục NAPAS."
          value={d.bankBin}
          onChange={set("bankBin")}
          error={e["payment.bankTransfer.bankBin"]}
        />
        <TextField
          path="payment.bankTransfer.bankName"
          label="Tên ngân hàng"
          maxLength={100}
          value={d.bankName}
          onChange={set("bankName")}
          error={e["payment.bankTransfer.bankName"]}
        />
        <TextField
          path="payment.bankTransfer.accountNo"
          label="Số tài khoản"
          maxLength={19}
          value={d.accountNo}
          onChange={set("accountNo")}
          error={e["payment.bankTransfer.accountNo"]}
        />
        <TextField
          path="payment.bankTransfer.accountName"
          label="Tên chủ tài khoản"
          maxLength={100}
          value={d.accountName}
          onChange={set("accountName")}
          error={e["payment.bankTransfer.accountName"]}
        />
      </div>
    </SectionCard>
  );
}
