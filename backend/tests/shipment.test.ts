import { describe, expect, it } from 'vitest';
import {
  buildShipment,
  buildShipmentEvents,
  generateTrackingNumber,
  SIMULATED_CARRIERS,
  TRACKING_ALPHABET,
  TRACKING_NUMBER_REGEX,
  type ShipHistoryEntry,
} from '../src/lib/shipment.js';

const t = (iso: string) => new Date(iso);
const h = (from: string | null, to: string, at: string): ShipHistoryEntry => ({
  fromStatus: from,
  toStatus: to,
  createdAt: t(at),
});

describe('generateTrackingNumber', () => {
  it('định dạng: tiền tố hãng + ngày VN + 6 ký tự không nhầm lẫn', () => {
    // 2026-11-22T20:00Z = 03:00 ngày 23/11 theo giờ VN
    const code = generateTrackingNumber('EXPRESS', t('2026-11-22T20:00:00Z'), () => 0);
    expect(code).toBe('BBE-20261123-AAAAAA');
    expect(generateTrackingNumber('STANDARD', t('2026-11-22T03:00:00Z'), () => 1)).toBe(
      'BBL-20261122-BBBBBB',
    );
  });
  it('dùng hàm ngẫu nhiên tiêm vào, luôn trong alphabet', () => {
    let i = 0;
    const code = generateTrackingNumber('STANDARD', t('2026-11-22T03:00:00Z'), (max) => {
      expect(max).toBe(TRACKING_ALPHABET.length);
      return i++ % max;
    });
    expect(code).toBe('BBL-20261122-ABCDEF');
    expect(TRACKING_NUMBER_REGEX.test(code)).toBe(true);
  });
  it('alphabet không có ký tự dễ nhầm', () => {
    expect(TRACKING_ALPHABET).not.toMatch(/[01OIL]/);
  });
  it('mã sinh bằng random thật vẫn khớp định dạng', () => {
    for (const m of ['STANDARD', 'EXPRESS'] as const) {
      expect(TRACKING_NUMBER_REGEX.test(generateTrackingNumber(m, new Date()))).toBe(true);
    }
  });
  it('hãng giả lập cố định', () => {
    expect(SIMULATED_CARRIERS.EXPRESS).toEqual({ code: 'BBE', name: 'BeanBox Express (giả lập)' });
    expect(SIMULATED_CARRIERS.STANDARD.code).toBe('BBL');
  });
});

describe('buildShipmentEvents', () => {
  // Giao cho vận chuyển lúc 10:00 VN ngày 22/11 (= 03:00Z), dự kiến muộn nhất 24/11.
  const shipAt = '2026-11-22T03:00:00Z';
  const etaTo = t('2026-11-24T00:00:00Z'); // ngày VN 24/11; 08:00 VN = 01:00Z
  const history = [h(null, 'PENDING', '2026-11-21T01:00:00Z'), h('PROCESSING', 'SHIPPING', shipAt)];
  const run = (now: string, over: Partial<Parameters<typeof buildShipmentEvents>[0]> = {}) =>
    buildShipmentEvents({ history, etaTo, deliveredAt: null, now: t(now), ...over });
  const codes = (e: ReturnType<typeof run>) => e!.map((x) => x.code);

  it('null khi chưa từng SHIPPING', () => {
    expect(
      buildShipmentEvents({
        history: [h(null, 'PENDING', shipAt)],
        etaTo,
        deliveredAt: null,
        now: t('2026-12-01T00:00:00Z'),
      }),
    ).toBeNull();
  });

  it('chỉ trả mốc có at <= now (trước/đúng/sau từng mốc)', () => {
    expect(run('2026-11-22T02:59:59Z')).toEqual([]);
    expect(codes(run(shipAt))).toEqual(['HANDOVER']);
    expect(codes(run('2026-11-22T04:59:59Z'))).toEqual(['HANDOVER']);
    expect(codes(run('2026-11-22T05:00:00Z'))).toEqual(['HANDOVER', 'PICKED_UP']);
    // IN_TRANSIT = giữa 05:00Z 22/11 và 01:00Z 24/11 = 03:00Z 23/11
    expect(codes(run('2026-11-23T02:59:59Z'))).toEqual(['HANDOVER', 'PICKED_UP']);
    expect(codes(run('2026-11-23T03:00:00Z'))).toEqual(['HANDOVER', 'PICKED_UP', 'IN_TRANSIT']);
    expect(codes(run('2026-11-24T00:59:59Z'))).toEqual(['HANDOVER', 'PICKED_UP', 'IN_TRANSIT']);
    const all = run('2026-11-24T01:00:00Z')!;
    expect(codes(all)).toEqual(['HANDOVER', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY']);
    expect(all.map((e) => e.at)).toEqual([
      '2026-11-22T03:00:00.000Z',
      '2026-11-22T05:00:00.000Z',
      '2026-11-23T03:00:00.000Z',
      '2026-11-24T01:00:00.000Z',
    ]);
  });

  it('đã quá ngày dự kiến: mốc giao hàng đến ngay (s+4h), vẫn đúng thứ tự', () => {
    const late = [h('PROCESSING', 'SHIPPING', '2026-11-30T03:00:00Z')];
    const ev = buildShipmentEvents({
      history: late,
      etaTo,
      deliveredAt: null,
      now: t('2026-11-30T07:00:00Z'),
    })!;
    expect(ev.map((e) => [e.code, e.at])).toEqual([
      ['HANDOVER', '2026-11-30T03:00:00.000Z'],
      ['PICKED_UP', '2026-11-30T05:00:00.000Z'],
      ['IN_TRANSIT', '2026-11-30T06:00:00.000Z'],
      ['OUT_FOR_DELIVERY', '2026-11-30T07:00:00.000Z'],
    ]);
  });

  it('đơn cũ không có etaTo: giao hàng đến sau 24h', () => {
    const ev = run('2026-11-23T03:00:00Z', { etaTo: null })!;
    expect(codes(ev)).toEqual(['HANDOVER', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY']);
  });

  it('DELIVERED: thêm "giao thành công" và cắt mốc giả sau đó', () => {
    const delivered = [...history, h('SHIPPING', 'DELIVERED', '2026-11-22T09:00:00Z')];
    const ev = run('2026-12-01T00:00:00Z', {
      history: delivered,
      deliveredAt: t('2026-11-22T09:00:00Z'),
    })!;
    expect(codes(ev)).toEqual(['HANDOVER', 'PICKED_UP', 'DELIVERED']);
    expect(ev.at(-1)).toEqual({
      code: 'DELIVERED',
      label: 'Giao hàng thành công',
      at: '2026-11-22T09:00:00.000Z',
    });
  });

  it('DELIVERED sau mọi mốc giả: đủ 4 mốc + giao thành công', () => {
    const delivered = [...history, h('SHIPPING', 'DELIVERED', '2026-11-25T03:00:00Z')];
    const ev = run('2026-11-26T00:00:00Z', {
      history: delivered,
      deliveredAt: t('2026-11-25T03:00:00Z'),
    })!;
    expect(codes(ev)).toEqual([
      'HANDOVER',
      'PICKED_UP',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ]);
  });

  it('FAILED_DELIVERY rồi giao lại rồi thành công theo lịch sử thật', () => {
    const hist = [
      ...history,
      h('SHIPPING', 'FAILED_DELIVERY', '2026-11-23T10:00:00Z'),
      h('FAILED_DELIVERY', 'SHIPPING', '2026-11-24T02:00:00Z'),
      h('SHIPPING', 'DELIVERED', '2026-11-24T08:00:00Z'),
    ];
    const ev = run('2026-12-01T00:00:00Z', {
      history: hist,
      deliveredAt: t('2026-11-24T08:00:00Z'),
    })!;
    expect(codes(ev)).toEqual([
      'HANDOVER',
      'PICKED_UP',
      'IN_TRANSIT',
      'FAILED_DELIVERY',
      'REDELIVERING',
      'DELIVERED',
    ]);
  });

  it('FAILED_DELIVERY hiện tại: dừng ở giao không thành công', () => {
    const hist = [...history, h('SHIPPING', 'FAILED_DELIVERY', '2026-11-22T08:00:00Z')];
    expect(codes(run('2026-12-01T00:00:00Z', { history: hist }))).toEqual([
      'HANDOVER',
      'PICKED_UP',
      'FAILED_DELIVERY',
    ]);
  });

  it('FAILED_DELIVERY -> CANCELLED và RETURNED là mốc thật', () => {
    const hist = [
      ...history,
      h('SHIPPING', 'FAILED_DELIVERY', '2026-11-22T08:00:00Z'),
      h('FAILED_DELIVERY', 'CANCELLED', '2026-11-22T09:00:00Z'),
    ];
    expect(codes(run('2026-12-01T00:00:00Z', { history: hist }))).toEqual([
      'HANDOVER',
      'PICKED_UP',
      'FAILED_DELIVERY',
      'CANCELLED',
    ]);
    const ret = [...history, h('DELIVERED', 'RETURNED', '2026-11-22T08:00:00Z')];
    expect(codes(run('2026-12-01T00:00:00Z', { history: ret }))).toContain('RETURNED');
  });

  it('không phụ thuộc thứ tự mảng history', () => {
    const shuffled = [history[1]!, history[0]!];
    expect(run('2026-11-23T03:00:00Z', { history: shuffled })).toEqual(run('2026-11-23T03:00:00Z'));
  });
});

describe('buildShipment', () => {
  it('gói carrier/trackingNumber/simulated', () => {
    const s = buildShipment({
      history: [h('PROCESSING', 'SHIPPING', '2026-11-22T03:00:00Z')],
      etaTo: null,
      deliveredAt: null,
      carrier: 'GHN',
      trackingNumber: 'X1',
      now: t('2026-11-22T03:00:00Z'),
    });
    expect(s).toEqual({
      carrier: 'GHN',
      trackingNumber: 'X1',
      simulated: true,
      events: [
        {
          code: 'HANDOVER',
          label: 'Đã bàn giao cho đơn vị vận chuyển',
          at: '2026-11-22T03:00:00.000Z',
        },
      ],
    });
  });
  it('null khi chưa SHIPPING', () => {
    expect(
      buildShipment({
        history: [],
        etaTo: null,
        deliveredAt: null,
        carrier: null,
        trackingNumber: null,
        now: new Date(),
      }),
    ).toBeNull();
  });
});
