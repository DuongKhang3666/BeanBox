import { asyncHandler } from '../../lib/asyncHandler.js';
import { AppError } from '../../lib/errors.js';
import { loadLocations } from './locations.data.js';

const CACHE_CONTROL = 'public, max-age=86400';

export const getProvinces = asyncHandler(async (_req, res) => {
  res.set('Cache-Control', CACHE_CONTROL);
  res.json({ data: loadLocations().provinceList });
});

export const getWards = asyncHandler(async (req, res) => {
  const code = String(req.params.code);
  // Map.get: "__proto__", "constructor"... không bao giờ khớp; mã sai định dạng cũng không tồn tại.
  const wards = loadLocations().wardListByProvince.get(code);
  if (!wards) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy tỉnh/thành');
  res.set('Cache-Control', CACHE_CONTROL);
  res.json({ data: wards });
});
