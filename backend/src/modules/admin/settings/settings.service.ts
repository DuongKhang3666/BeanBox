import type { Prisma } from '../../../generated/prisma/client.js';
import { deepEqual, writeAudit, type AuditDiff } from '../../../lib/audit.js';
import { prisma } from '../../../lib/prisma.js';
import { getAllSettings, type AllSettings } from '../../settings/settings.service.js';
import type { SettingsPatch } from './settings.schema.js';

export interface SettingsResponse {
  data: AllSettings['values'];
  meta: { updatedAt: AllSettings['updatedAt'] };
}

const toResponse = (s: AllSettings): SettingsResponse => ({
  data: s.values,
  meta: { updatedAt: s.updatedAt },
});

export async function getAdminSettings(): Promise<SettingsResponse> {
  return toResponse(await getAllSettings());
}

export async function updateSettings(
  patch: SettingsPatch,
  actor: { userId: string; ip: string | undefined },
): Promise<SettingsResponse> {
  return prisma.$transaction(async (tx) => {
    const current = await getAllSettings(tx);
    const diff: AuditDiff = {};
    for (const [key, value] of Object.entries(patch)) {
      const old = current.values[key as keyof typeof current.values];
      if (deepEqual(old, value)) continue;
      diff[key] = [old, value];
      await tx.setting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue },
        update: { value: value as Prisma.InputJsonValue },
      });
    }
    if (Object.keys(diff).length === 0) return toResponse(current);
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'settings.update',
      entity: 'Setting',
      entityId: null,
      diff,
      ip: actor.ip ?? null,
    });
    return toResponse(await getAllSettings(tx));
  });
}
