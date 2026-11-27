// Photos on risk assessment controls and actions.
// Each row keeps a list of storage paths in its `photos` column. Files live in the private compliance bucket
// under <client id>/<site id>/ra/<assessment id>/, so the same rules as certificates decide who can see them.
import { sb, esc, uid, toast, rows, byId, upd } from './core.js';

const URLS = {}, ZERO = '00000000-0000-0000-0000-000000000000';
const raOf = (aid) => byId('assessments', aid) || rows('published_assessments').find((p) => p.assessment_id === aid);

// Folder for a row's photos: the assessment's client and site, or the site of a service defect.
function folder(table, r) {
  const a = r.assessment_id && raOf(r.assessment_id);
  if (a) return `${a.client_id}/${a.site_id || ZERO}/ra/${r.assessment_id}`;
  const s = r.site_id && byId('sites', r.site_id);
  return s ? `${s.client_id}/${s.id}/ra/site` : null;
}

async function loadUrls(paths) {
  const need = paths.filter((p) => p && !(p in URLS)); if (!need.length) return;
  need.forEach((p) => (URLS[p] = ''));
  await Promise.all(need.map(async (p) => { const { data } = await sb.storage.from('compliance').createSignedUrl(p, 3600); URLS[p] = data?.signedUrl || ''; }));
  window.__render && window.__render();
}

// Thumbnails with "+ Photo" (unless read-only). Tapping a thumbnail opens the full photo.
export function photoStrip(table, r, ro, label = '+ Photo') {
  const list = (r && r.photos) || [];
  if (!list.length && ro) return '';
  loadUrls(list);
  return `<div class="svphs rph">${list.map((p) => `<span class="svpw">${URLS[p] ? `<a href="${esc(URLS[p])}" target="_blank" rel="noopener"><img src="${esc(URLS[p])}" alt="Photo"></a>` : '<img src="" alt="Photo">'}${ro ? '' : `<button class="svpx" data-rpdel="${table}|${r.id}" data-p="${esc(p)}" aria-label="Remove photo">✕</button>`}</span>`).join('')}
    ${ro ? '' : `<label class="btn sm svpadd">${label}<input type="file" accept="image/*" multiple data-rp="${table}|${r.id}" style="display:none"></label>`}</div>`;
}
// Read-only thumbnails for a list of paths (published copies).
export const photoList = (paths) => photoStrip('', { photos: paths || [] }, true);

async function shrink(file) {
  const img = await createImageBitmap(file), k = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.72));
}

async function addPhotos(table, id, files) {
  const r = byId(table, id); if (!r || !files.length) return;
  const dir = folder(table, r); if (!dir) return toast('Could not work out where to keep this photo', true);
  try {
    toast(`Uploading ${files.length > 1 ? files.length + ' photos' : 'photo'}…`);
    const added = [];
    for (const f of files) {
      const path = `${dir}/${uid()}.jpg`;
      const { error } = await sb.storage.from('compliance').upload(path, await shrink(f), { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;
      added.push(path);
    }
    await upd(table, id, { photos: (r.photos || []).concat(added) });
    toast(files.length > 1 ? 'Photos added' : 'Photo added'); window.__render();
  } catch (e) { toast('Photo upload failed: ' + (e.message || e), true); }
}

document.addEventListener('change', (e) => {
  const el = e.target; if (!el.dataset || !el.dataset.rp) return;
  const [t, id] = el.dataset.rp.split('|'); addPhotos(t, id, [...el.files]); el.value = '';
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-rpdel]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const [t, id] = b.dataset.rpdel.split('|'), r = byId(t, id); if (!r) return;
  upd(t, id, { photos: (r.photos || []).filter((p) => p !== b.dataset.p) }).catch(() => {}); window.__render();
}, true);

// For PDFs: a photo as a JPEG data URL with its size.
export async function photoData(path) {
  try { const { data } = await sb.storage.from('compliance').createSignedUrl(path, 300); const b = await (await fetch(data.signedUrl)).blob();
    const im = await createImageBitmap(b), c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0);
    return { url: c.toDataURL('image/jpeg', 0.85), w: im.width, h: im.height }; } catch { return null; }
}
