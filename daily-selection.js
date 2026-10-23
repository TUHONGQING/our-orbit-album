const DAY_MS = 24 * 60 * 60 * 1000;

export function shanghaiDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function score(id) {
  const text = `our-orbit-daily:${id}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function shuffled(items) {
  return items.map(photo => ({ photo, rank: score(photo.id) }))
    .sort((left, right) => left.rank - right.rank || left.photo.id.localeCompare(right.photo.id))
    .map(entry => entry.photo);
}

// A stable shuffled circle makes each photo appear once before the circle repeats.
export function pickDailyPhotos(items, dateKey, limit = 100) {
  const count = Math.min(limit, items.length);
  if (!count) return [];
  const order = shuffled(items);
  if (items.length <= limit) return order;
  const [year, month, day] = dateKey.split('-').map(Number);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
  const offset = (dayNumber * limit) % order.length;
  return Array.from({ length: count }, (_, index) => order[(offset + index) % order.length]);
}
