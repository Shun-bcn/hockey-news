const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const sources = require('./sources.json');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── ユーティリティ ────────────────────────────────────────────

function hashUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex').slice(0, 12);
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getDataDir() {
  return path.join(__dirname, '../public/data');
}

function getTodayFile() {
  return path.join(getDataDir(), `${getToday()}.json`);
}

/** 過去全データのIDセットを返す（重複スキップ用） */
function loadAllIds() {
  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir)) return new Set();
  const ids = new Set();
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
  const res = await axios.get(source.url, {
    timeout: 15000,
    headers: { 'User-Agent': 'HockeyNews/1.0 (+https://hockey-news.pages.dev)' },
  });
  const $ = cheerio.load(res.data);
  const items = [];

  $(source.selector.list).each((_, el) => {
    const titleEl = $(el).find(source.selector.title).first();
    const linkEl = $(el).find(source.selector.link).first();
    const title = titleEl.text().trim();
    const href = linkEl.attr('href') || '';
    if (!title || !href) return;

    const url = href.startsWith('http') ? href : source.selector.base + href;
    items.push({
      id: hashUrl(url),
      source: source.name,
      source_url: url,
      original_title: title,
      original_content: '',
      original_lang: source.lang,
      fetched_at: new Date().toISOString(),
    });
  });

  return items;
}

// ─── Claude Haiku による多言語要約生成 ────────────────────────

const CATEGORY_LIST = '試合結果 / 代表チーム / リーグ / 選手 / テクノロジー / ルール / その他';

const LANG_NAMES = {
  ja: '日本語',
  en: 'English',
  nl: 'Nederlands',
  es: 'Español',
  hi: 'हिन्दी',
};

async function generateTranslations(article, targetLangs = ['ja', 'en', 'nl']) {
  const langList = targetLangs.map(l => `${l} (${LANG_NAMES[l]})`).join(', ');

  const prompt = `You are a field hockey news editor. Read the article below and generate concise summaries in multiple languages.

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

Terminology (always use these exact translations):
- EHL → in Japanese: ユーロホッケーリーグ / in English: Euro Hockey League (NOT "European Hockey League")
- Kampong → in Japanese: カンポン / in other languages: Kampong (unchanged)
- Old Georgians → in Japanese: オールドジョージアンズ

Output format:
{
  "ja": { "headline": "...", "summary": "...", "category": "..." },
  "en": { "headline": "...", "summary": "...", "category": "..." },
  "nl": { "headline": "...", "summary": "...", "category": "..." }
}`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
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
  console.log(`\nNew articles to process: ${rawArticles.length}`);

  // 1回の実行で処理する上限（APIコスト・時間制限対策）
  const BATCH_LIMIT = 30;
  const batch = rawArticles.slice(0, BATCH_LIMIT);

  const processed = [];
  for (let i = 0; i < batch.length; i++) {
    const article = batch[i];
    try {
      process.stdout.write(`  [${i + 1}/${batch.length}] ${article.original_title.slice(0, 50)}... `);
      const translations = await generateTranslations(article, ['ja', 'en', 'nl']);
      processed.push({
        id: article.id,
        source: article.source,
        source_url: article.source_url,
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
  fs.writeFileSync(getTodayFile(), JSON.stringify(allToday, null, 2), 'utf-8');
  console.log(`\nDone. Added: ${processed.length}, Total today (${getToday()}): ${allToday.length}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
