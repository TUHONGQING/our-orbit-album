import cloudbase from './vendor/cloudbase.js';
import { cloudConfig } from './cloud-config.js';

const app = cloudbase.init(cloudConfig);
const auth = app.auth;
const db = app.database();
const photos = db.collection('orbit_photos');
const albumCollection = db.collection('orbit_albums');
let user = null;

function check(result) {
  if (result?.error) throw new Error(result.error.message || '云端请求失败');
  if (result?.code) throw new Error(result.message || result.code);
  return result;
}
function signedIn() { if (!user) throw new Error('请先登录私人相册'); }

export async function restoreSession() {
  const result = check(await auth.getSession());
  user = result.data?.session ? result.data.user : null;
  return user;
}
export async function login(username, password) {
  const result = check(await auth.signInWithPassword({ username, password }));
  user = result.data?.user || (await restoreSession());
  if (!user) throw new Error('登录没有完成，请重试');
  return user;
}
export async function logout() { await auth.signOut(); user = null; }
export function currentUser() { return user; }

async function allDocuments(collection) {
  const records = [];
  for (let offset = 0; ; offset += 100) {
    const result = check(await collection.skip(offset).limit(100).get());
    const batch = result.data || [];
    records.push(...batch);
    if (batch.length < 100) break;
  }
  return records;
}
export async function loadLibrary() {
  signedIn();
  const [imageRecords, albumRecords] = await Promise.all([allDocuments(photos), allDocuments(albumCollection)]);
  const images = imageRecords.filter(p => !p.deleted).map(p => ({ ...p, id: p._id, url: '' }));
  const urls = await signedUrls(images.map(p => p.id), 'thumb');
  for (const photo of images) photo.url = urls.get(photo.id) || '';
  return { photos: images.sort((a,b) => b.createdAt - a.createdAt), albums: albumRecords.map(a => a.name) };
}
export async function signedUrls(ids, size) {
  signedIn();
  const urls = new Map();
  const groups = [];
  for (let i = 0; i < ids.length; i += 50) groups.push(ids.slice(i, i + 50));
  for (let i = 0; i < groups.length; i += 4) {
    await Promise.all(groups.slice(i, i + 4).map(async group => {
      const response = check(await app.callFunction({ name: 'orbitFiles', data: { ids: group, size } }));
      const result = response.result;
      if (result?.error) throw new Error(result.error);
      for (const file of result?.files || []) urls.set(file.id, file.url);
    }));
  }
  return urls;
}
export async function signedUrl(id, size) { return (await signedUrls([id], size)).get(id); }

export async function createAlbum(name) {
  signedIn();
  check(await albumCollection.add({ name, createdAt: Date.now() }));
}
export async function savePhoto(photo) {
  signedIn();
  const { caption, date, album, favorite } = photo;
  check(await photos.doc(photo.id).update({ caption, date, album, favorite }));
}
export async function removePhoto(id) {
  signedIn();
  check(await photos.doc(id).update({ deleted: true, deletedAt: Date.now() }));
}
export async function uploadPhoto(file, preview, details = {}) {
  signedIn();
  const id = crypto.randomUUID();
  const path = `orbit/${id}`;
  const extension = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  const uploaded = [];
  try {
    const original = check(await app.uploadFile({ cloudPath: `${path}/original.${extension}`, filePath: file })).fileID;
    uploaded.push(original);
    const thumbnail = check(await app.uploadFile({ cloudPath: `${path}/thumb.webp`, filePath: preview.thumbnail })).fileID;
    uploaded.push(thumbnail);
    const display = check(await app.uploadFile({ cloudPath: `${path}/display.webp`, filePath: preview.display })).fileID;
    uploaded.push(display);
    const record = {
      storageKey: id, caption: details.caption || (file.name?.replace(/\.[^.]+$/, '').slice(0, 100) || '新的回忆'),
      filename: file.name || 'memory.jpg', date: details.date || new Date().toISOString().slice(0, 10),
      album: details.album || '未分类', favorite: Boolean(details.favorite), createdAt: details.createdAt || Date.now(),
      width: preview.width, height: preview.height, files: { original, thumb: thumbnail, display }
    };
    const added = check(await photos.add(record));
    return { ...record, _id: added.id, id: added.id, url: URL.createObjectURL(preview.thumbnail), originalUrl: URL.createObjectURL(file) };
  } catch (error) {
    // A failed acknowledgement may follow a successful metadata write. Keep
    // the files if the record exists so a transient error cannot lose photos.
    const existing = await photos.where({ storageKey: id }).limit(1).get().catch(() => null);
    if (!existing?.data?.length && uploaded.length) await app.deleteFile({ fileList: uploaded }).catch(() => {});
    throw error;
  }
}
