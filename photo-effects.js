// Adapted from Haichao Li's MIT-licensed Card Gallery and Image Atlas examples.
// See UPSTREAM-LICENSE.txt for the original copyright and permission notice.
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (from, to, amount) => from + (to - from) * amount;
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const wrap = (value, count) => ((value % count) + count) % count;

export function relativeIndex(index, position, count) {
  return wrap(index - position + count / 2, count) - count / 2;
}

export function cardGalleryPose(index, count, position, chapter, width, height) {
  if (!count) return { visible: false };
  const mobile = width < 680;
  const slots = Math.min(count, mobile ? 16 : 24);
  const arcSlots = mobile ? 16 : 24;
  const distance = relativeIndex(index, position, count);
  const angle = distance * Math.PI * 2 / slots;
  const arcAngle = distance * Math.PI * 2 / arcSlots;
  const ringRadius = Math.min(width * .38, height * .47);
  const arcRadius = Math.min(width * .66, height * 1.19);
  const spreadGap = mobile ? 36 : 64;
  const ringFade = clamp((slots / 2 - Math.abs(distance)) / 1.25, 0, 1);
  const arcFade = clamp((arcSlots * .37 - Math.abs(distance)) / 1.5, 0, 1);
  const stripFade = clamp((width * .68 - Math.abs(distance * spreadGap)) / (spreadGap * 2), 0, 1);
  const poses = [
    { x: Math.sin(angle) * ringRadius, y: -Math.cos(angle) * ringRadius * .74, scale: mobile ? 1.07 : 1.12, rz: Math.sin(angle) * -8, ry: Math.sin(angle) * -12, opacity: ringFade, depth: Math.cos(angle) },
    { x: Math.sin(arcAngle) * arcRadius, y: (1 - Math.cos(arcAngle)) * arcRadius * .75 - height * .48, scale: mobile ? 1.35 : 1.45, rz: arcAngle * 13, ry: 0, opacity: arcFade, depth: -Math.abs(distance) },
    { x: distance * 1.7, y: -Math.abs(distance) * .35, scale: mobile ? 2.12 : 2.48, rz: distance * .26, ry: -25, opacity: ringFade, depth: -Math.abs(distance) },
    { x: distance * spreadGap, y: Math.abs(distance) * .8, scale: mobile ? 1.82 : 2.12, rz: 0, ry: -29, opacity: stripFade, depth: -distance }
  ];
  const from = Math.floor(clamp(chapter, 0, 3));
  const to = Math.min(3, from + 1);
  const blend = smooth(chapter - from);
  const pose = {};
  for (const key of ['x', 'y', 'scale', 'rz', 'ry', 'opacity', 'depth']) pose[key] = mix(poses[from][key], poses[to][key], blend);
  pose.visible = pose.opacity > .025 && Math.abs(pose.x) < width * .8 && Math.abs(pose.y) < height * .9;
  return pose;
}

function random(index, salt) {
  let seed = Math.imul(index + 1, 1664525) + Math.imul(salt + 1, 1013904223);
  seed ^= seed >>> 16;
  seed = Math.imul(seed, 2246822507);
  return (seed >>> 0) / 4294967296;
}

export function atlasPoint(index, width, height) {
  const layer = Math.floor(index / 20);
  const within = index % 20;
  const angle = within * Math.PI * 2 / 20 + layer * .41 + (random(index, 2) - .5) * .28;
  const radius = Math.min(width * .39, height * .81) + layer * (width < 680 ? 95 : 175);
  const variation = .22 + random(index, 3) * 1.72;
  return {
    x: Math.cos(angle) * radius * variation,
    y: Math.sin(angle) * radius * variation * .76,
    z: -layer * (width < 680 ? 320 : 430) + (random(index, 4) - .5) * 310,
    rz: (random(index, 5) - .5) * 15,
    ry: (random(index, 6) - .5) * 22
  };
}

export function atlasPose(index, camera, width, height, count, point=atlasPoint(index, width, height)) {
  const focal = height * 1.35;
  const depth = focal + camera.z - point.z;
  if (depth < 100) return { visible: false };
  const factor = focal / depth;
  const x = (point.x - camera.x) * factor;
  const y = (point.y - camera.y) * factor;
  const scale = factor * (count < 20 ? 1.55 : width < 680 ? 1.16 : 1.12);
  const visible = Math.abs(x) < width * .66 && Math.abs(y) < height * .7 && scale > (count > 100 ? .075 : .17);
  return { x, y, scale, rz: point.rz, ry: point.ry, opacity: clamp((depth - 100) / 170, 0, 1), depth: -depth, visible };
}
