"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Input";
import { uploadAdminImage } from "../../api/products";
import type { AdminSettingsResult } from "../../api/settings";
import { adminErrorMessage } from "../../errors";
import {
  MAX_BANNERS,
  SECTION_KEYS,
  bannerFieldPaths,
  bannersDraft,
  buildBannersPatch,
  emptyBanner,
  latestUpdatedAt,
  validateBanners,
  type BannerDraft,
  type FieldErrors,
} from "../../settingsForm";
import { BannerEditor } from "./BannerEditor";
import { SectionCard } from "./SectionCard";
import { useSectionSave } from "./useSectionSave";

export function BannersSection({
  result,
  onSaved,
}: {
  result: AdminSettingsResult;
  onSaved: (r: AdminSettingsResult) => void;
}) {
  const [list, setList] = useState<BannerDraft[]>(() => bannersDraft(result.data));
  const [uploadingUid, setUploadingUid] = useState<number | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<number, string>>({});
  const { state, save, touch, clearErrors } = useSectionSave<BannerDraft[]>({
    validate: validateBanners,
    build: buildBannersPatch,
    paths: (l) => ["home.banners", ...bannerFieldPaths(l.length)],
    onSaved: (r) => {
      setList(bannersDraft(r.data));
      onSaved(r);
    },
  });

  const patch = (uid: number, p: Partial<BannerDraft>) => {
    touch();
    setList((l) => l.map((b) => (b.uid === uid ? { ...b, ...p } : b)));
  };
  const structural = (fn: (l: BannerDraft[]) => BannerDraft[]) => {
    touch();
    clearErrors(); // chỉ số banner đổi nên lỗi theo chỉ số không còn đúng
    setList(fn);
  };

  async function upload(uid: number, file: File) {
    setUploadingUid(uid);
    setUploadErrors((m) => {
      const next = { ...m };
      delete next[uid];
      return next;
    });
    try {
      const up = await uploadAdminImage(file);
      patch(uid, { imageUrl: up.url });
    } catch (e) {
      setUploadErrors((m) => ({ ...m, [uid]: adminErrorMessage(e) }));
    } finally {
      setUploadingUid(null);
    }
  }

  const errs = state.errors;
  const listErr = errs["home.banners"];
  return (
    <SectionCard
      title="Banner trang chủ"
      description={`Tối đa ${MAX_BANNERS} banner, hiển thị theo thứ tự dưới phần giới thiệu đầu trang. Ảnh phải được tải lên (đường dẫn /uploads/...).`}
      updatedAt={latestUpdatedAt(SECTION_KEYS.banners, result.meta.updatedAt)}
      state={state}
      onSubmit={() => void save(list)}
    >
      <FieldError id="st-banners-err">{listErr}</FieldError>
      {list.length === 0 ? (
        <p className="rounded-lg bg-cream-50 p-4 text-sm text-coffee-800">
          Chưa có banner nào. Trang chủ sẽ không hiển thị dải banner.
        </p>
      ) : (
        <ul className="space-y-4">
          {list.map((b, i) => {
            const own: FieldErrors = { ...errs };
            const up = uploadErrors[b.uid];
            if (up) own[`home.banners.${i}.imageUrl`] = up;
            return (
              <BannerEditor
                key={b.uid}
                banner={b}
                index={i}
                total={list.length}
                errors={own}
                uploading={uploadingUid === b.uid}
                onChange={(p) => patch(b.uid, p)}
                onMove={(dir) =>
                  structural((l) => {
                    const next = [...l];
                    const j = i + dir;
                    if (j < 0 || j >= next.length) return l;
                    [next[i], next[j]] = [next[j]!, next[i]!];
                    return next;
                  })
                }
                onRemove={() => structural((l) => l.filter((x) => x.uid !== b.uid))}
                onUpload={(f) => void upload(b.uid, f)}
              />
            );
          })}
        </ul>
      )}
      <div>
        <Button
          variant="outline"
          disabled={list.length >= MAX_BANNERS}
          onClick={() => structural((l) => [...l, emptyBanner()])}
        >
          Thêm banner
        </Button>
        {list.length >= MAX_BANNERS ? (
          <span className="ml-3 text-sm text-coffee-700">Đã đạt tối đa {MAX_BANNERS} banner.</span>
        ) : null}
      </div>
    </SectionCard>
  );
}
