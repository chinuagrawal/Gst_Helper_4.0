export function encodeCloud(value) {
  if (value instanceof Date) return { __gstDate: value.toISOString() };
  if (Array.isArray(value)) return value.map(encodeCloud);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeCloud(item)]));
  return value;
}
export function decodeCloud(value) {
  if (value && typeof value === 'object' && Object.keys(value).length === 1 && typeof value.__gstDate === 'string') return new Date(value.__gstDate);
  if (Array.isArray(value)) return value.map(decodeCloud);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeCloud(item)]));
  return value;
}
