/**
 * 既存記事にスペイン語翻訳を追加するスクリプト
 * 実行: node scripts/add-spanish.js
 */
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const dataDir = path.join(__dirname, '../public/data');

async function translateToSpanish(article) {
  const prompt = `You are a field hockey news editor. Translate/summarize the following field hockey news into Spanish (Español).

Title: ${article.original_title || article.translations?.en?.headline || ''}
Summary (English): ${article.translations?.en?.summary || ''}
Category (Japanese): ${article.translations?.ja?.category || 'その他'}

Category translations to Spanish:
- 試合結果 → Resultado
- 代表チーム → Selección Nacional
- リーグ → Liga
- 選手 → Jugador
- テクノロジー → Tecnología
- ルール → Reglamento
- スポンサー・パートナー → Patrocinador
- その他 → Otros

Rules:
- headline: max 60 characters in Spanish, clear and newsworthy
- summary: 300-400 characters in Spanish
- category: use the Spanish translation listed above
- Output ONLY valid JSON, no markdown.

Output format:
{ "headline": "...", "summary": "...", "category": "..." }`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON: ${text.slice(0, 80)}`);
  return JSON.parse(jsonMatch[0]);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  const files = fs.readdirSync(dataDir)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/))
    .sort();

  let total = 0, updated = 0, skipped = 0, failed = 0;

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const articles = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let changed = false;

    for (const article of articles) {
      total++;
      if (article.translations?.es) { skipped++; continue; }

      process.stdout.write(`  [${file}] ${(article.translations?.en?.headline || article.id).slice(0, 45)}... `);
      try {
        article.translations.es = await translateToSpanish(article);
        console.log('OK');
        updated++;
        changed = true;
      } catch (e) {
        console.log(`FAILED: ${e.message}`);
        failed++;
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, JSON.stringify(articles, null, 2), 'utf-8');
    }
  }

  // index.json を再構築
  const index = [];
  files.forEach(f => {
    const date = f.replace('.json', '');
    try {
      const articles = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'));
      articles.forEach(a => index.push({ ...a, date }));
    } catch (_) {}
  });
  fs.writeFileSync(path.join(dataDir, 'index.json'), JSON.stringify(index), 'utf-8');

  console.log(`\nDone. Total: ${total}, Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);
  console.log(`Index rebuilt: ${index.length} articles`);
}

main().catch(e => { console.error(e); process.exit(1); });
