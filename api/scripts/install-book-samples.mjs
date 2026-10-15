import { readFileSync } from 'node:fs';
import { lookupOpenBdBooks } from './generated-book-sources/openbd-book-lookup.mjs';
import { importOpenBdCover } from './generated-book-sources/openbd-book-cover.mjs';
import { normalizeIsbn } from './generated-book-sources/book-isbn.mjs';

const catalogs = JSON.parse(readFileSync(new URL('./sample-data/books.json', import.meta.url), 'utf8'));
for (const language of ['en', 'ja']) {
 const isbns = catalogs[language];
 if (!Array.isArray(isbns) || isbns.length !== 11 || new Set(isbns).size !== 11 || isbns.some(isbn => typeof isbn !== 'string' || isbn.length !== 13 || normalizeIsbn(isbn) !== isbn)) throw new Error('Invalid sample book ISBN catalog.');
 Object.freeze(isbns);
}
Object.freeze(catalogs);
export function sampleBookIsbnsFor(language) {
 if (!['en', 'ja'].includes(language)) throw new Error('Unsupported sample book language.');
 return catalogs[language];
}

// Only identifiers are distributed. Retrieved fields/images remain provider snapshots.
export async function installBookSamples(client, { adminId, note, displayLanguage }, requestFetch = fetch) {
 const failures = { lookup: [], cover: [] };
 for (const [index, isbn] of sampleBookIsbnsFor(displayLanguage).entries()) {
  let candidate;
  try { [candidate] = await lookupOpenBdBooks(isbn, requestFetch, true); }
  catch { failures.lookup.push(isbn); continue; }
  if (!candidate) { failures.lookup.push(isbn); continue; }
  const cover = await importOpenBdCover(candidate.coverUrl, isbn, requestFetch);
  if (cover.status === 'unavailable') failures.cover.push(isbn);
  const data = cover.status === 'unavailable' ? { coverImage: null, coverSource: null, coverSourceUrl: null } : cover.data;
  // Database errors must roll back the optional dataset, rather than masquerade as network failures.
  const result = await client.query(`INSERT INTO book_titles
   (catalog_code,name,author,publisher,edition,isbn,source_provider,source_url,source_retrieved_at,notes,cover_image,cover_source,cover_source_url)
   VALUES ($1,$2,$3,$4,$5,$6,'openbd',$7,clock_timestamp(),$8,$9,$10,$11) RETURNING id`,
   [`SAMPLE-BOOK-${String(index + 1).padStart(3,'0')}`,candidate.title,candidate.author,candidate.publisher,candidate.edition,candidate.isbn,candidate.sourceUrl,note,
    data.coverImage ? Buffer.from(data.coverImage) : null,data.coverSource,data.coverSourceUrl]);
  await client.query(`INSERT INTO audit_logs (actor_id,action,resource,resource_id,detail)
   VALUES ($1,'sample_import','book_title',$2,$3)`, [adminId,result.rows[0].id,JSON.stringify({sample:true,source:'openbd',isbn})]);
 }
 return failures;
}
