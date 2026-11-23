"use client";

import { useState } from "react";
import type { AdminSettingsResult } from "../../api/settings";
import {
  CONTACT_FIELD_PATHS,
  SECTION_KEYS,
  buildContactPatch,
  contactDraft,
  latestUpdatedAt,
  validateContact,
  type ContactDraft,
} from "../../settingsForm";
import { SectionCard } from "./SectionCard";
import { TextField } from "./SettingsFields";
import { useSectionSave } from "./useSectionSave";

export function ContactSection({
  result,
  onSaved,
}: {
  result: AdminSettingsResult;
  onSaved: (r: AdminSettingsResult) => void;
}) {
  const [d, setD] = useState<ContactDraft>(() => contactDraft(result.data));
  const { state, save, touch } = useSectionSave<ContactDraft>({
    validate: validateContact,
    build: buildContactPatch,
    paths: () => CONTACT_FIELD_PATHS,
    onSaved: (r) => {
      setD(contactDraft(r.data));
      onSaved(r);
    },
  });
  const set = (k: keyof ContactDraft) => (v: string) => {
    touch();
    setD((x) => ({ ...x, [k]: v }));
  };
  const e = state.errors;
  return (
    <SectionCard
      title="Thông tin liên hệ"
      description="Hiển thị ở chân trang, trang Liên hệ và các chính sách. Email này cũng nhận thông báo từ biểu mẫu liên hệ."
      updatedAt={latestUpdatedAt(SECTION_KEYS.contact, result.meta.updatedAt)}
      state={state}
      onSubmit={() => void save(d)}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          path="store.contact.name"
          label="Tên cửa hàng"
          maxLength={100}
          value={d.name}
          onChange={set("name")}
          error={e["store.contact.name"]}
        />
        <TextField
          path="store.contact.email"
          label="Email"
          type="email"
          autoComplete="email"
          maxLength={254}
          value={d.email}
          onChange={set("email")}
          error={e["store.contact.email"]}
        />
        <TextField
          path="store.contact.phone"
          label="Số điện thoại"
          type="tel"
          autoComplete="tel"
          hint="Để trống nếu không công khai số điện thoại."
          value={d.phone}
          onChange={set("phone")}
          error={e["store.contact.phone"]}
        />
        <TextField
          path="store.contact.address"
          label="Địa chỉ"
          maxLength={300}
          hint="Để trống nếu không công khai địa chỉ."
          value={d.address}
          onChange={set("address")}
          error={e["store.contact.address"]}
        />
      </div>
    </SectionCard>
  );
}
