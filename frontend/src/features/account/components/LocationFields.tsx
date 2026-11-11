"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { getProvinces, getWards } from "@/features/locations/api";
import { LocationCombobox } from "@/features/locations/components/LocationCombobox";
import type { LocationOption } from "@/types/location";

export interface LocationValues {
  provinceCode: string;
  wardCode: string;
}

export const LOCATION_FIELDS = ["provinceCode", "wardCode"] as const;

const STALE_MESSAGE =
  "Tỉnh/thành (hoặc phường/xã) đã lưu không còn trong danh mục, vui lòng chọn lại";

type Status = "idle" | "loading" | "error" | "ready";

interface Loaded {
  key: string;
  attempt: number;
  options: LocationOption[] | null; // null = lỗi
}

const loadProvinces = () => getProvinces();

/** Tải danh sách theo key; kết quả của key cũ (về muộn) tự bị bỏ qua. */
function useOptions(key: string | null, load: (key: string) => Promise<LocationOption[]>) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    load(key)
      .then((options) => !cancelled && setLoaded({ key, attempt, options }))
      .catch(() => !cancelled && setLoaded({ key, attempt, options: null }));
    return () => {
      cancelled = true;
    };
  }, [key, attempt, load]);

  let status: Status = "loading";
  if (key === null) status = "idle";
  else if (loaded && loaded.key === key && loaded.attempt === attempt) {
    status = loaded.options ? "ready" : "error";
  }
  const options = status === "ready" ? (loaded?.options ?? []) : [];
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { status, options, retry };
}

function LoadState({
  status,
  loadingText,
  errorText,
  onRetry,
}: {
  status: Status;
  loadingText: string;
  errorText: string;
  onRetry: () => void;
}) {
  if (status === "loading") {
    return (
      <p className="mt-1.5 flex items-center gap-2 text-sm text-coffee-700">
        <Spinner label="" />
        <span role="status">{loadingText}</span>
      </p>
    );
  }
  if (status === "error") {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-danger-600">
        <span role="alert">{errorText}</span>
        <Button variant="outline" onClick={onRetry}>
          Thử lại
        </Button>
      </div>
    );
  }
  return null;
}

/** Chọn Tỉnh/Thành rồi Phường/Xã từ danh mục của server (GET /locations). */
export function LocationFields({
  values,
  errors,
  onChange,
  disabled,
  initialNames,
}: {
  values: LocationValues;
  errors: Record<string, string>;
  onChange: (next: LocationValues) => void;
  disabled?: boolean;
  /** Tên đã lưu, hiển thị trong lúc danh mục còn đang tải. */
  initialNames?: { provinceName?: string; wardName?: string };
}) {
  const [stale, setStale] = useState<"province" | "ward" | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const provinces = useOptions("provinces", loadProvinces);
  const wards = useOptions(values.provinceCode || null, getWards);

  // Mã đã lưu (dữ liệu cũ) không còn trong danh mục -> coi như chưa chọn.
  const provinceMissing =
    provinces.status === "ready" &&
    values.provinceCode !== "" &&
    !provinces.options.some((o) => o.code === values.provinceCode);
  const wardMissing =
    wards.status === "ready" &&
    values.wardCode !== "" &&
    !wards.options.some((o) => o.code === values.wardCode);

  // Ghi nhớ lý do (điều chỉnh state ngay lúc render), rồi xóa lựa chọn cũ ở cha.
  if (provinceMissing && stale !== "province") setStale("province");
  else if (!provinceMissing && wardMissing && stale !== "ward") setStale("ward");

  useEffect(() => {
    if (provinceMissing) onChangeRef.current({ provinceCode: "", wardCode: "" });
    else if (wardMissing) onChangeRef.current({ provinceCode: values.provinceCode, wardCode: "" });
  }, [provinceMissing, wardMissing, values.provinceCode]);

  const provinceError = errors.provinceCode ?? (stale === "province" ? STALE_MESSAGE : undefined);
  const wardError = errors.wardCode ?? (stale === "ward" ? STALE_MESSAGE : undefined);
  const noProvince = values.provinceCode === "";

  return (
    <fieldset className="space-y-4" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium text-coffee-900">Tỉnh/thành và phường/xã</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <LocationCombobox
            id="provinceCode"
            label="Tỉnh/thành"
            options={provinces.options}
            value={values.provinceCode}
            displayName={values.provinceCode ? initialNames?.provinceName : undefined}
            onChange={(code) => {
              if (code === values.provinceCode) return;
              setStale(null);
              onChange({ provinceCode: code, wardCode: "" });
            }}
            loading={provinces.status === "loading"}
            disabled={provinces.status === "error"}
            error={provinceError}
            placeholder="Chọn hoặc gõ để tìm tỉnh/thành"
          />
          <LoadState
            status={provinces.status}
            loadingText="Đang tải danh sách tỉnh/thành..."
            errorText="Không tải được danh sách tỉnh/thành."
            onRetry={provinces.retry}
          />
        </div>
        <div>
          <LocationCombobox
            id="wardCode"
            label="Phường/xã"
            options={wards.options}
            value={values.wardCode}
            displayName={values.wardCode ? initialNames?.wardName : undefined}
            onChange={(code) => {
              setStale(null);
              onChange({ provinceCode: values.provinceCode, wardCode: code });
            }}
            loading={wards.status === "loading"}
            disabled={noProvince || wards.status === "error"}
            error={wardError}
            placeholder={noProvince ? "Chọn tỉnh/thành trước" : "Chọn hoặc gõ để tìm phường/xã"}
          />
          <LoadState
            status={wards.status}
            loadingText="Đang tải danh sách phường/xã..."
            errorText="Không tải được danh sách phường/xã."
            onRetry={wards.retry}
          />
        </div>
      </div>
    </fieldset>
  );
}
