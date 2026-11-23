"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Label } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { getProvinces } from "@/features/locations/api";
import { useResource } from "@/features/orders/useResource";
import type { AdminSettingsResult } from "../../api/settings";
import {
  AREA_FIELD_PATHS,
  SECTION_KEYS,
  areaDraft,
  buildAreaPatch,
  latestUpdatedAt,
  validateArea,
  type AreaDraft,
} from "../../settingsForm";
import { SectionCard } from "./SectionCard";
import { domId, textareaClass } from "./SettingsFields";
import { useSectionSave } from "./useSectionSave";

const loadProvinces = () => getProvinces();

export function AreaSection({
  result,
  onSaved,
}: {
  result: AdminSettingsResult;
  onSaved: (r: AdminSettingsResult) => void;
}) {
  const provinces = useResource("provinces", loadProvinces);
  const [d, setD] = useState<AreaDraft>(() => areaDraft(result.data));
  const { state, save, touch } = useSectionSave<AreaDraft>({
    validate: validateArea,
    build: buildAreaPatch,
    paths: () => AREA_FIELD_PATHS,
    onSaved: (r) => {
      setD(areaDraft(r.data));
      onSaved(r);
    },
  });
  const e = state.errors;
  const provErr = e["shipping.innerCityProvinceCodes"];
  const wardErr = e["shipping.innerCityWardCodes"];
  const wardId = domId("shipping.innerCityWardCodes");

  function toggle(code: string) {
    touch();
    setD((x) => ({
      ...x,
      provinces: x.provinces.includes(code)
        ? x.provinces.filter((c) => c !== code)
        : [...x.provinces, code],
    }));
  }

  let list: React.ReactNode;
  if (provinces.status === "error") {
    list = (
      <div role="alert" className="space-y-2 text-sm text-danger-600">
        <p>Không tải được danh sách tỉnh/thành.</p>
        <Button size="sm" variant="outline" onClick={provinces.retry}>
          Thử lại
        </Button>
      </div>
    );
  } else if (provinces.status !== "ready") {
    list = <Skeleton className="h-24 w-full" />;
  } else {
    list = (
      <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {provinces.data!.map((p) => {
          const id = `st-prov-${p.code}`;
          return (
            <li key={p.code}>
              <label htmlFor={id} className="flex min-h-11 items-center gap-2 text-coffee-900">
                <input
                  id={id}
                  type="checkbox"
                  className="h-5 w-5 accent-moss-700"
                  checked={d.provinces.includes(p.code)}
                  onChange={() => toggle(p.code)}
                />
                <span>{p.name}</span>
              </label>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <SectionCard
      title="Khu vực nội thành"
      description="Tỉnh/thành áp dụng phí nội thành. Có thể bỏ trống tất cả."
      updatedAt={latestUpdatedAt(SECTION_KEYS.area, result.meta.updatedAt)}
      state={state}
      disabled={provinces.status !== "ready"}
      onSubmit={() => void save(d)}
    >
      <fieldset className="space-y-2" aria-describedby={provErr ? "st-prov-err" : undefined}>
        <legend className="mb-1 text-sm font-semibold text-coffee-900">Tỉnh/thành nội thành</legend>
        {list}
        <FieldError id="st-prov-err">{provErr}</FieldError>
      </fieldset>
      <div>
        <Label htmlFor={wardId}>Mã phường/xã nội thành bổ sung</Label>
        <textarea
          id={wardId}
          rows={4}
          value={d.wards}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={wardErr ? true : undefined}
          aria-describedby={`${wardId}-hint${wardErr ? ` ${wardId}-err` : ""}`}
          onChange={(ev) => {
            touch();
            setD((x) => ({ ...x, wards: ev.target.value }));
          }}
          className={`${textareaClass} font-mono text-sm ${wardErr ? "border-danger-600" : "border-coffee-400"}`}
        />
        <p id={`${wardId}-hint`} className="mt-1 text-xs text-coffee-700">
          Mỗi mã gồm 5 chữ số, cách nhau bằng dấu phẩy hoặc xuống dòng (tối đa 500 mã).
        </p>
        <FieldError id={`${wardId}-err`}>{wardErr}</FieldError>
      </div>
    </SectionCard>
  );
}
