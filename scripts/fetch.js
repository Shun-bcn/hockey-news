const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');
const Anthropic = require('@anthropic-ai/sdk');

const sources = require('./sources.json');
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 5,
  timeout: 60000,
});

// ─── ユーティリティ ────────────────────────────────────────────

function hashUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex').slice(0, 12);
}

function getToday() {
  return process.env.FETCH_DATE || new Date().toISOString().slice(0, 10);
}

function getDataDir() {
  return path.join(__dirname, '../public/data');
}

function getTodayFile() {
  return path.join(getDataDir(), `${getToday()}.json`);
}

/** 過去全データのIDセットを返す（重複スキップ用）。ブロックリストも含む。 */
function loadAllIds() {
  const dataDir = getDataDir();
  const ids = new Set(sources.blocklist || []);
  if (!fs.existsSync(dataDir)) return ids;
  fs.readdirSync(dataDir)
    .filter(f => f.endsWith('.json'))
    .forEach(f => {
      try {
        const articles = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'));
        articles.forEach(a => ids.add(a.id));
      } catch (_) {}
    });
  return ids;
}

/** 今日分の既存記事を読み込む */
function loadTodayArticles() {
  const file = getTodayFile();
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (_) {}
  }
  return [];
}

// ─── 日付正規化 ───────────────────────────────────────────────

function normalizeDate(raw) {
  if (!raw) return null;
  const s = raw.trim();
  // ISO: 2026-04-03T06:52:00 or 2026-04-03T21:09:49+00:00
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // YYYY.MM.DD: 2026.04.03 (Asia Hockey)
  const yd = s.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (yd) return `${yd[1]}-${yd[2]}-${yd[3]}`;
  // DD/MM/YYYY: 02/04/2026
  const dm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dm) return `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  // English: "Mar 11, 2026" or "March 11, 2026"
  const enLong = s.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (enLong) {
    const months = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
                     jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
                     january:1, february:2, march:3, april:4, june:6,
                     july:7, august:8, september:9, october:10, november:11, december:12 };
    const m = months[enLong[1].toLowerCase().slice(0, 9)];
    if (m) return `${enLong[3]}-${String(m).padStart(2, '0')}-${enLong[2].padStart(2, '0')}`;
  }
  // English: "02 Jul 2025" or "1:30 pm  02 Jul 2025"
  const enDay = s.match(/(\d{1,2})\s+(\w{3,})\s+(\d{4})/);
  if (enDay) {
    const months = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
                     jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
    const m = months[enDay[2].toLowerCase().slice(0, 3)];
    if (m) return `${enDay[3]}-${String(m).padStart(2, '0')}-${enDay[1].padStart(2, '0')}`;
  }
  // Spanish text: "Viernes, 03 de Abril de 2026"
  const es = s.match(/(\d{1,2}) de (\w+) de (\d{4})/i);
  if (es) {
    const months = { enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6,
                     julio:7, agosto:8, septiembre:9, octubre:10, noviembre:11, diciembre:12 };
    const m = months[es[2].toLowerCase()];
    if (m) return `${es[3]}-${String(m).padStart(2, '0')}-${es[1].padStart(2, '0')}`;
  }
  return null;
}

// ─── RSS取得 ──────────────────────────────────────────────────

async function fetchRSS(source) {
  const parser = new Parser({ timeout: 10000 });
  const feed = await parser.parseURL(source.url);

  const items = feed.items.map(item => ({
    id: hashUrl(item.link || item.guid || item.title || ''),
    source: source.name,
    source_url: item.link || item.guid || '',
    original_title: (item.title || '').trim(),
    original_content: (item.contentSnippet || item.summary || item.content || '').slice(0, 800),
    original_lang: source.lang,
    published_at: normalizeDate(item.isoDate || item.pubDate || null),
    fetched_at: new Date().toISOString(),
  }));

  // NOS Sport: hockeyキーワードでフィルタ
  if (source.filter === 'hockey') {
    return items.filter(a =>
      a.original_title.toLowerCase().includes('hockey') ||
      a.original_content.toLowerCase().includes('hockey')
    );
  }
  return items;
}

// ─── スクレイピング取得 ────────────────────────────────────────

async function fetchScrape(source) {
  const headers = source.browserHeaders ? {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
  } : {
    'User-Agent': 'HockeyNews/1.0 (+https://hockey-deflect.pages.dev)',
  };

  const axiosOptions = {
    timeout: 15000,
    headers,
  };
  if (source.skipSSLVerify) {
    axiosOptions.httpsAgent = new https.Agent({ rejectUnauthorized: false });
  }

  const res = await axios.get(source.url, axiosOptions);
  const $ = cheerio.load(res.data);
  const items = [];

  $(source.selector.list).each((_, el) => {
    const titleEl = $(el).find(source.selector.title).first();
    // titleAttr が指定されていれば属性値（例: alt）を使う
    let title = source.selector.titleAttr
      ? (titleEl.attr(source.selector.titleAttr) || '').trim()
      : titleEl.text().trim();
    const href = source.selector.link === 'self'
      ? $(el).attr('href') || ''
      : $(el).find(source.selector.link).first().attr('href') || '';
    if (!href) return;

    // タイトルが取れない場合はURLスラグから生成
    if (!title) {
      const slug = href.split('/').pop().replace(/-\d+$/, '').replace(/-/g, ' ');
      title = slug.charAt(0).toUpperCase() + slug.slice(1);
    }
    if (!title) return;

    const url = href.startsWith('http') ? href : source.selector.base + href;

    // 公開日取得（dateSelector が設定されている場合）
    let published_at = null;
    if (source.selector.dateSelector) {
      const dateEl = source.selector.dateSelector === 'self'
        ? $(el)
        : $(el).find(source.selector.dateSelector).first();
      const raw = source.selector.dateAttr
        ? (dateEl.attr(source.selector.dateAttr) || '')
        : dateEl.text().trim();
      published_at = normalizeDate(raw);
    }
    // titleDateRegex: タイトル先頭の日付プレフィックスを抽出しタイトルから除去
    if (source.selector.titleDateRegex && title) {
      const re = new RegExp(source.selector.titleDateRegex);
      const m = title.match(re);
      if (m) {
        published_at = normalizeDate(m[1]);
        title = title.slice(m[0].length).trim();
      }
    }

    items.push({
      id: hashUrl(url),
      source: source.name,
      source_url: url,
      original_title: title,
      original_content: '',
      original_lang: source.lang,
      published_at,
      fetched_at: new Date().toISOString(),
    });
  });

  // hrefFilter: URL正規表現でフィルタ（カテゴリページ等を除外）
  if (source.hrefFilter) {
    const re = new RegExp(source.hrefFilter);
    return items.filter(a => re.test(a.source_url));
  }

  return items;
}

// ─── リトライユーティリティ ────────────────────────────────────

async function withRetry(fn, retries = 3, delayMs = 5000) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
}

// ─── Claude Haiku による多言語要約生成 ────────────────────────

const CATEGORY_LIST = '試合結果 / 代表チーム / リーグ / 選手 / テクノロジー / ルール / スポンサー・パートナー / その他';

const LANG_NAMES = {
  ja: '日本語',
  en: 'English',
  nl: 'Nederlands',
  es: 'Español',
  hi: 'हिन्दी',
};

async function generateTranslations(article, targetLangs = ['ja', 'en', 'nl', 'hi', 'es']) {
  const langList = targetLangs.map(l => `${l} (${LANG_NAMES[l]})`).join(', ');

  const ehlTerm = article.source === 'England Hockey'
    ? '- EHL → in Japanese: イングランドホッケーリーグ / in English: England Hockey League'
    : '- EHL → in Japanese: ユーロホッケーリーグ / in English: Euro Hockey League (NOT "European Hockey League")';

  const prompt = `You are a field hockey news editor. Read the article below and generate concise summaries in multiple languages.

News source: ${article.source}
Source language: ${article.original_lang}
Title: ${article.original_title}
Content: ${article.original_content || '(title only)'}

Generate summaries in: ${langList}

Rules:
- headline: max 60 characters, clear and newsworthy
- summary: 300-400 characters, include key facts, context and outcome so readers understand the full story
- category: exactly one of [${CATEGORY_LIST}] — ALWAYS use the Japanese category name
- If original language matches the target, keep the meaning accurate. For other languages, re-express the facts naturally.
- Output ONLY valid JSON, no markdown, no explanation.

Category translations (use these exact translations for スポンサー・パートナー):
- スポンサー・パートナー → in English: Sponsor / Partner, in Dutch: Sponsor / Partner, in Hindi: प्रायोजक / साझेदार, in Spanish: Patrocinador

Terminology (always use these exact translations):
- Hockey (the sport) → in Japanese: ホッケー (NOT ホッキー)
${ehlTerm}
- Kampong → in Japanese: カンポン / in other languages: Kampong (unchanged)
- Old Georgians → in Japanese: オールドジョージアンズ
- Sander de Wijn → in Japanese: サンダー・デ・バイン

Output format:
{
  "ja": { "headline": "...", "summary": "...", "category": "..." },
  "en": { "headline": "...", "summary": "...", "category": "..." },
  "nl": { "headline": "...", "summary": "...", "category": "..." },
  "hi": { "headline": "...", "summary": "...", "category": "..." },
  "es": { "headline": "...", "summary": "...", "category": "..." }
}`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in response: ${text.slice(0, 100)}`);
  return JSON.parse(jsonMatch[0]);
}

// ─── メイン処理 ───────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }

  console.log(`[${new Date().toISOString()}] Starting hockey news fetch...`);

  // データディレクトリ作成
  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const existingIds = loadAllIds();
  const todayArticles = loadTodayArticles();
  console.log(`Existing IDs: ${existingIds.size}, Today's articles: ${todayArticles.length}`);

  let rawArticles = [];

  // RSS取得
  for (const source of sources.rss) {
    try {
      process.stdout.write(`  [RSS] ${source.name}... `);
      const items = await fetchRSS(source);
      const fresh = items.filter(a => !existingIds.has(a.id));
      console.log(`${fresh.length} new / ${items.length} total`);
      rawArticles.push(...fresh);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }

  // スクレイピング取得
  for (const source of sources.scrape) {
    try {
      process.stdout.write(`  [Scrape] ${source.name}... `);
      const items = await fetchScrape(source);
      const fresh = items.filter(a => !existingIds.has(a.id));
      console.log(`${fresh.length} new / ${items.length} total`);
      rawArticles.push(...fresh);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }

  // 重複排除
  const seen = new Set(todayArticles.map(a => a.id));
  rawArticles = rawArticles.filter(a => !seen.has(a.id));

  // minPublishedDate フィルタ: 日付が取得できていて minPublishedDate より古い記事を除外
  const allSources = [...sources.rss, ...sources.scrape];
  rawArticles = rawArticles.filter(a => {
    const src = allSources.find(s => s.name === a.source);
    if (!src || !src.minPublishedDate) return true;
    if (!a.published_at) return true; // 日付不明は通過
    return a.published_at >= src.minPublishedDate;
  });

  console.log(`\nNew articles to process: ${rawArticles.length}`);

  // 1回の実行で処理する上限（APIコスト・時間制限対策）
  const BATCH_LIMIT = 30;
  const batch = rawArticles.slice(0, BATCH_LIMIT);

  const processed = [];
  for (let i = 0; i < batch.length; i++) {
    const article = batch[i];
    try {
      process.stdout.write(`  [${i + 1}/${batch.length}] ${article.original_title.slice(0, 50)}... `);
      const translations = await withRetry(() => generateTranslations(article, ['ja', 'en', 'nl', 'hi', 'es']));
      processed.push({
        id: article.id,
        source: article.source,
        source_url: article.source_url,
        published_at: article.published_at || null,
        fetched_at: article.fetched_at,
        translations,
      });
      console.log('OK');
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }

  // 今日のファイルに保存（既存分 + 新規分）
  const allToday = [...todayArticles, ...processed];
  if (allToday.length > 0) {
    fs.writeFileSync(getTodayFile(), JSON.stringify(allToday, null, 2), 'utf-8');
  }
  console.log(`\nDone. Added: ${processed.length}, Total today (${getToday()}): ${allToday.length}`);

  // 失敗検知: 新規記事があったのに翻訳成功数が0件なら全滅とみなしてfailで終了
  // （ワークフローが「緑のまま静かに止まる」状態を防ぐ）
  if (batch.length > 0 && processed.length === 0) {
    console.error(`\nFATAL: All ${batch.length} translation attempts failed. Marking job as failed.`);
    process.exit(1);
  }

  // 全記事インデックスを再生成（横断検索用）
  const index = [];
  fs.readdirSync(dataDir)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/))
    .sort()
    .forEach(f => {
      const date = f.replace('.json', '');
      try {
        const articles = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'));
        articles.forEach(a => index.push({ ...a, date }));
      } catch (_) {}
    });
  fs.writeFileSync(path.join(dataDir, 'index.json'), JSON.stringify(index), 'utf-8');
  console.log(`Index rebuilt: ${index.length} total articles`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
