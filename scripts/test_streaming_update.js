const fs = require('fs');

// 1. Check content.json
const content = JSON.parse(fs.readFileSync('phantommovies_site/data/content.json', 'utf-8'));
const movies = content.movies || [];

console.log('Total catalog items in content.json:', movies.length);

let moviesWithAllMovieLand = 0;
let moviesWithImdb = 0;
let moviesWithDownloads = 0;

movies.forEach(m => {
  if (m.imdb_id) moviesWithImdb++;
  if (m.downloads && m.downloads.length) moviesWithDownloads++;
  const hasAml = (m.streams || []).some(s => s.name && s.name.includes('AllMovieLand') && s.url.includes('slast430did'));
  if (hasAml) moviesWithAllMovieLand++;
});

console.log('Items with IMDb ID:', moviesWithImdb, `(${Math.round(moviesWithImdb/movies.length*100)}%)`);
console.log('Items with AllMovieLand server injected:', moviesWithAllMovieLand, `(${Math.round(moviesWithAllMovieLand/movies.length*100)}%)`);
console.log('Items with active Download options:', moviesWithDownloads, `(${Math.round(moviesWithDownloads/movies.length*100)}%)`);

// Sample checks
const sampleMovie = movies.find(m => m.type === 'movie' && m.imdb_id);
console.log('\n--- Sample Movie Check (' + sampleMovie.title + ') ---');
console.log('IMDb:', sampleMovie.imdb_id);
console.log('Streams:');
(sampleMovie.streams || []).slice(0, 4).forEach(s => console.log('  -', s.name, '->', s.url));

const sampleSeries = movies.find(m => m.type === 'series' && m.imdb_id);
console.log('\n--- Sample Series Check (' + sampleSeries.title + ') ---');
console.log('IMDb:', sampleSeries.imdb_id);
console.log('Streams:');
(sampleSeries.streams || []).slice(0, 4).forEach(s => console.log('  -', s.name, '->', s.url));

// 2. Check mirrors.json
const mirrors = JSON.parse(fs.readFileSync('phantommovies_site/data/mirrors.json', 'utf-8'));
const providers = mirrors.streaming.providers || [];
console.log('\n--- Mirrors Streaming Providers ---');
providers.forEach((p, i) => console.log(`  [${i+1}] ${p.name} (${p.id})`));

const amlProvider = providers.find(p => p.id === 'allmovieland');
if (amlProvider) {
  console.log('\n>>> AllMovieLand provider is registered in mirrors.json! <<<');
} else {
  console.error('\n>>> Error: AllMovieLand provider missing from mirrors.json! <<<');
}
