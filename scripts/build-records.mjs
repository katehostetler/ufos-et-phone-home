// Builds src/data/records.json from the war.gov UAP CSV.
//
// Steps:
//   1. Try to fetch a fresh CSV from war.gov; fall back to the cached copy at data/uap-csv.csv
//   2. Parse rows
//   3. Normalize fields and detect media type (vid|img|pdf)
//   4. Geocode Incident Location via data/location-lookup.json
//   5. Write src/data/records.json
//
// Re-run any time: `npm run build:data`

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const CSV_URL = 'https://www.war.gov/Portals/1/Interactive/2026/UFO/uap-csv.csv';
const CACHED_CSV = resolve(ROOT, 'data/uap-csv.csv');
const LOOKUP = resolve(ROOT, 'data/location-lookup.json');
const DVIDS_THUMBS = resolve(ROOT, 'data/dvids-thumbs.json');
const OUT = resolve(ROOT, 'src/data/records.json');
const MIRROR_DIR = resolve(ROOT, 'public/thumbnails');
const COOKIE_JAR = resolve(ROOT, '.wargov-cookies.txt');

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.war.gov/UFO/',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
};

async function fetchCsv() {
  try {
    const r = await fetch(CSV_URL, { headers: FETCH_HEADERS });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    if (text.length < 1000) throw new Error('Suspiciously short response');
    await writeFile(CACHED_CSV, text);
    console.log(`✓ Fetched fresh CSV from war.gov (${text.length} bytes), cached to data/uap-csv.csv`);
    return text;
  } catch (err) {
    console.log(`⚠ Live fetch failed (${err.message}); falling back to cached CSV`);
    return readFile(CACHED_CSV, 'utf8');
  }
}

async function loadDvidsThumbs() {
  try {
    return JSON.parse(await readFile(DVIDS_THUMBS, 'utf8'));
  } catch {
    return {};
  }
}

// Mirror a war.gov asset to public/thumbnails/. Uses curl with Akamai-friendly
// session cookies. Skips if the file already exists. Returns the public path
// (e.g. "/thumbnails/foo.jpg") or null on failure.
async function mirrorAsset(url, id, ext) {
  await mkdir(MIRROR_DIR, { recursive: true });
  const filename = `${id}${ext}`;
  const target = resolve(MIRROR_DIR, filename);
  try {
    await stat(target);
    return `/thumbnails/${filename}`; // already mirrored
  } catch {}

  // URL-encode filenames containing spaces or special characters that
  // war.gov serves literally (it shipped some files with spaces and brackets
  // in their original names). The URL constructor handles this correctly.
  let safeUrl;
  try {
    const u = new URL(url);
    u.pathname = u.pathname
      .split('/')
      .map((seg) => encodeURIComponent(decodeURIComponent(seg)))
      .join('/');
    safeUrl = u.toString();
  } catch {
    safeUrl = url;
  }

  try {
    execFileSync('curl', [
      '-s', '-f', '--http2',
      '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      '-H', 'Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '-H', 'Accept-Encoding: gzip, deflate, br',
      '-H', 'Referer: https://www.war.gov/UFO/',
      '-H', 'Sec-Fetch-Dest: image',
      '-H', 'Sec-Fetch-Mode: no-cors',
      '-H', 'Sec-Fetch-Site: same-origin',
      '-b', COOKIE_JAR,
      '-o', target,
      safeUrl,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    return `/thumbnails/${filename}`;
  } catch (err) {
    console.log(`  ⚠ Mirror failed for ${url}`);
    return null;
  }
}

async function establishWarGovSession() {
  try {
    execFileSync('curl', [
      '-s', '--http2',
      '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '-H', 'Accept-Encoding: gzip, deflate, br',
      '-c', COOKIE_JAR,
      '-o', '/dev/null',
      'https://www.war.gov/UFO/',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    return true;
  } catch (err) {
    console.log(`⚠ Could not establish war.gov session: ${err.message}`);
    return false;
  }
}

async function scrapeDvidsThumb(id, cache) {
  if (cache[id]) return cache[id];
  try {
    const r = await fetch(`https://www.dvidshub.net/video/${id}`, {
      headers: {
        'User-Agent': FETCH_HEADERS['User-Agent'],
        'Accept': 'text/html,*/*',
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const m = html.match(/"og:image"\s+content="([^"]+)"/);
    if (m) {
      cache[id] = m[1];
      return m[1];
    }
  } catch (err) {
    console.log(`  ⚠ DVIDS scrape failed for ${id}: ${err.message}`);
  }
  return null;
}

function detectMediaType(row) {
  const t = (row['Type'] || '').trim().toUpperCase();
  if (t === 'VID') return 'vid';
  if (t === 'IMG') return 'img';
  if (t === 'PDF') return 'pdf';
  // some rows have garbled types from the CSV; guess from link
  const link = (row['PDF | Image Link'] || '').toLowerCase();
  if (/\.(mp4|mov|webm)$/.test(link)) return 'vid';
  if (/\.(jpe?g|png|gif|webp)$/.test(link)) return 'img';
  if (/\.pdf$/.test(link)) return 'pdf';
  if ((row['DVIDS Video ID'] || '').trim()) return 'vid';
  return 'pdf';
}

function makeId(row, idx) {
  const t = (row['Title'] || '').trim().split(/[\n,]/)[0].trim();
  const slug = t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return slug || `record-${idx}`;
}

function cleanField(v) {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function parseIncidentDate(s) {
  if (!s) return null;
  const cleaned = s.trim();
  if (!cleaned || /^n\/?a$/i.test(cleaned)) return null;
  // try a few formats — return original string + a parseable ISO if possible
  const m1 = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) {
    const [, mm, dd, yy] = m1;
    let yyyy = parseInt(yy, 10);
    if (yyyy < 100) yyyy += yyyy < 40 ? 2000 : 1900;
    return { raw: cleaned, year: yyyy, iso: `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}` };
  }
  const yMatch = cleaned.match(/\b(19\d{2}|20\d{2})\b/);
  if (yMatch) return { raw: cleaned, year: parseInt(yMatch[1], 10), iso: null };
  return { raw: cleaned, year: null, iso: null };
}

async function main() {
  const csvText = await fetchCsv();
  const lookup = JSON.parse(await readFile(LOOKUP, 'utf8'));
  const dvidsCache = await loadDvidsThumbs();
  const dvidsCacheStartSize = Object.keys(dvidsCache).length;

  const rawRows = parse(csvText, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  const records = [];
  const unknownLocations = new Set();
  const seenIds = new Set();
  const videoRecordsToFetch = [];

  rawRows.forEach((row, idx) => {
    const title = cleanField(row['Title']);
    if (!title) return; // skip empty rows

    const mediaType = detectMediaType(row);
    const link = cleanField(row['PDF | Image Link']);
    const thumbnail = cleanField(row['Modal Image']);
    const blurb = cleanField(row['Description Blurb']);
    const agency = cleanField(row['Agency']) || 'Unknown';
    const dateRaw = cleanField(row['Incident Date']);
    const date = parseIncidentDate(dateRaw);
    const locStr = cleanField(row['Incident Location']);
    const dvidsId = cleanField(row['DVIDS Video ID']);
    const videoTitle = cleanField(row['Video Title']);
    const redaction = cleanField(row['Redaction']);

    let id = makeId(row, idx);
    let suffix = 2;
    while (seenIds.has(id)) { id = `${makeId(row, idx)}-${suffix++}`; }
    seenIds.add(id);

    let location = null;
    if (locStr && locStr !== '' && !/^n\/?a$/i.test(locStr)) {
      const found = lookup[locStr];
      if (found) {
        location = {
          name: locStr,
          lat: found.lat,
          lng: found.lng,
          regional: found.regional || false,
          space: found.space || false,
        };
      } else {
        unknownLocations.add(locStr);
      }
    }

    const record = {
      id,
      title,
      mediaType,
      agency,
      date: date ? date.raw : null,
      year: date?.year ?? null,
      isoDate: date?.iso ?? null,
      location,
      hasLocation: location != null,
      blurb,
      assetUrl: link || null,
      thumbnailUrl: thumbnail || null,
      dvidsVideoId: dvidsId || null,
      videoTitle: videoTitle || null,
      redaction: redaction || null,
      sourcePage: 'https://www.war.gov/UFO/',
    };

    // For video records: schedule DVIDS thumbnail fetch.
    if (mediaType === 'vid' && dvidsId && !record.thumbnailUrl) {
      videoRecordsToFetch.push(record);
    }

    records.push(record);
  });

  // Fetch DVIDS thumbnails (uses cache; only hits the wire for new IDs).
  if (videoRecordsToFetch.length > 0) {
    const uncached = videoRecordsToFetch.filter((r) => !dvidsCache[r.dvidsVideoId]);
    if (uncached.length > 0) {
      console.log(`Fetching ${uncached.length} DVIDS thumbnails (${videoRecordsToFetch.length - uncached.length} cached)...`);
    }
    for (const rec of videoRecordsToFetch) {
      const url = await scrapeDvidsThumb(rec.dvidsVideoId, dvidsCache);
      if (url) rec.thumbnailUrl = url;
      if (uncached.includes(rec)) await new Promise((r) => setTimeout(r, 250));
    }
    if (Object.keys(dvidsCache).length > dvidsCacheStartSize) {
      await writeFile(DVIDS_THUMBS, JSON.stringify(dvidsCache, null, 2));
    }
  }

  // Mirror war.gov-hosted thumbnails and full images locally (Akamai blocks
  // cross-site image requests, so hotlinking fails in production browsers).
  // Re-runs are idempotent — only fetches what isn't already on disk.
  const toMirror = records.filter(
    (r) =>
      r.thumbnailUrl &&
      r.thumbnailUrl.includes('war.gov/medialink'),
  );
  const fullImagesToMirror = records.filter(
    (r) => r.mediaType === 'img' && r.assetUrl && r.assetUrl.includes('war.gov/medialink'),
  );

  if (toMirror.length + fullImagesToMirror.length > 0) {
    console.log(`Mirroring ${toMirror.length} thumbnails + ${fullImagesToMirror.length} full images from war.gov...`);
    await establishWarGovSession();

    for (const rec of toMirror) {
      const ext = extname(new URL(rec.thumbnailUrl).pathname).toLowerCase() || '.jpg';
      const local = await mirrorAsset(rec.thumbnailUrl, `${rec.id}-thumb`, ext);
      if (local) rec.thumbnailUrl = local;
      await new Promise((r) => setTimeout(r, 150));
    }

    for (const rec of fullImagesToMirror) {
      const ext = extname(new URL(rec.assetUrl).pathname).toLowerCase() || '.jpg';
      const local = await mirrorAsset(rec.assetUrl, `${rec.id}-full`, ext);
      if (local) rec.assetUrl = local;
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  if (unknownLocations.size > 0) {
    console.log(`⚠ Unknown locations (add to data/location-lookup.json):`);
    for (const loc of unknownLocations) console.log(`    - ${loc}`);
  }

  // counts
  const counts = records.reduce((acc, r) => {
    acc[r.mediaType] = (acc[r.mediaType] || 0) + 1;
    if (r.hasLocation) acc.mapped = (acc.mapped || 0) + 1;
    else acc.unmapped = (acc.unmapped || 0) + 1;
    return acc;
  }, {});

  await writeFile(OUT, JSON.stringify(records, null, 2));
  console.log(`✓ Wrote ${records.length} records to src/data/records.json`);
  console.log(`  vid: ${counts.vid || 0} · img: ${counts.img || 0} · pdf: ${counts.pdf || 0}`);
  console.log(`  mapped: ${counts.mapped || 0} · unmapped: ${counts.unmapped || 0}`);
}

main().catch((e) => {
  console.error('Build failed:', e);
  process.exit(1);
});
