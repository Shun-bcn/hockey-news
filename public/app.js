// ─── 状態管理 ─────────────────────────────────────────────────
const state = {
  lang: 'ja',
  category: 'all',
  sort: 'newest',
  date: today(),
  articles: [],
  search: '',
};

// ─── ユーティリティ ───────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  return dateStr.replace(/-/g, '/');
}

function timeAgo(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

function catClass(cat) {
  const map = {
    '試合結果': 'cat-試合結果', '代表チーム': 'cat-代表チーム', 'リーグ': 'cat-リーグ',
    '選手': 'cat-選手', 'テクノロジー': 'cat-テクノロジー', 'ルール': 'cat-ルール',
    'スポンサー・パートナー': 'cat-スポンサー', 'その他': 'cat-その他'
  };
  return map[cat] || 'cat-その他';
}

// 言語別カテゴリ表示名
const CAT_DISPLAY = {
  ja: { '試合結果': '試合結果', '代表チーム': '代表チーム', 'リーグ': 'リーグ', '選手': '選手', 'テクノロジー': 'テクノロジー', 'ルール': 'ルール', 'スポンサー・パートナー': 'スポンサー', 'その他': 'その他' },
  en: { '試合結果': 'Match', '代表チーム': 'National Team', 'リーグ': 'League', '選手': 'Player', 'テクノロジー': 'Technology', 'ルール': 'Rules', 'スポンサー・パートナー': 'Sponsor', 'その他': 'Other' },
  nl: { '試合結果': 'Wedstrijd', '代表チーム': 'Nationaal Team', 'リーグ': 'Competitie', '選手': 'Speler', 'テクノロジー': 'Technologie', 'ルール': 'Regels', 'スポンサー・パートナー': 'Sponsor', 'その他': 'Overig' },
  es: { '試合結果': 'Partido', '代表チーム': 'Selección', 'リーグ': 'Liga', '選手': 'Jugador', 'テクノロジー': 'Tecnología', 'ルール': 'Reglamento', 'スポンサー・パートナー': 'Patrocinador', 'その他': 'Otros' },
  hi: { '試合結果': 'मैच', '代表チーム': 'राष्ट्रीय टीम', 'リーグ': 'लीग', '選手': 'खिलाड़ी', 'テクノロジー': 'तकनीक', 'ルール': 'नियम', 'スポンサー・パートナー': 'प्रायोजक', 'その他': 'अन्य' },
};

const FILTER_LABELS = {
  ja: { all: 'すべて', '試合結果': '試合結果', '代表チーム': '代表チーム', 'リーグ': 'リーグ', '選手': '選手', 'テクノロジー': 'テクノロジー', 'ルール': 'ルール', 'スポンサー・パートナー': 'スポンサー', 'その他': 'その他' },
  en: { all: 'All', '試合結果': 'Match', '代表チーム': 'National Team', 'リーグ': 'League', '選手': 'Player', 'テクノロジー': 'Technology', 'ルール': 'Rules', 'スポンサー・パートナー': 'Sponsor', 'その他': 'Other' },
  nl: { all: 'Alle', '試合結果': 'Wedstrijd', '代表チーム': 'Nationaal', 'リーグ': 'Competitie', '選手': 'Speler', 'テクノロジー': 'Technologie', 'ルール': 'Regels', 'スポンサー・パートナー': 'Sponsor', 'その他': 'Overig' },
  es: { all: 'Todo', '試合結果': 'Partidos', '代表チーム': 'Selección', 'リーグ': 'Liga', '選手': 'Jugadores', 'テクノロジー': 'Tecnología', 'ルール': 'Reglas', 'スポンサー・パートナー': 'Patrocinador', 'その他': 'Otros' },
  hi: { all: 'सभी', '試合結果': 'मैच', '代表チーム': 'राष्ट्रीय टीम', 'リーグ': 'लीग', '選手': 'खिलाड़ी', 'テクノロジー': 'तकनीक', 'ルール': 'नियम', 'スポンサー・パートナー': 'प्रायोजक', 'その他': 'अन्य' },
};

const SORT_LABELS = {
  ja: { newest: '新着順', source: 'ソース別' },
  en: { newest: 'Newest', source: 'By Source' },
  nl: { newest: 'Nieuwste', source: 'Per bron' },
  es: { newest: 'Reciente', source: 'Por fuente' },
  hi: { newest: 'नवीनतम', source: 'स्रोत से' },
};

const SITE_TITLE = {
  ja: '🏑 Hockey Deflect',
  en: '🏑 Hockey Deflect',
  nl: '🏑 Hockey Deflect',
  es: '🏑 Hockey Deflect',
  hi: '🏑 Hockey Deflect',
};

const LOADING_TEXT = {
  ja: '読み込み中...', en: 'Loading...', nl: 'Laden...', es: 'Cargando...', hi: 'लोड हो रहा है...',
};

const NO_ARTICLES_TEXT = {
  ja: 'この日のニュースはありません', en: 'No news for this day',
  nl: 'Geen nieuws voor deze dag', es: 'No hay noticias para este día',
  hi: 'इस दिन कोई समाचार नहीं है',
};

// ─── データ取得 ───────────────────────────────────────────────

async function loadArticles(date) {
  try {
    const res = await fetch(`/data/${date}.json`);
    if (!res.ok) return [];
    return await res.json();
  } catch (_) {
    return [];
  }
}

// ─── レンダリング ─────────────────────────────────────────────

function renderArticles() {
  const container = document.getElementById('articles-container');
  const noArticles = document.getElementById('no-articles');

  let articles = [...state.articles];

  // カテゴリフィルター
  if (state.category !== 'all') {
    articles = articles.filter(a => {
      const t = a.translations?.[state.lang];
      return t && t.category === state.category;
    });
  }

  // キーワード検索
  if (state.search) {
    const q = state.search.toLowerCase();
    articles = articles.filter(a => {
      const t = a.translations?.[state.lang];
      if (!t) return false;
      return (t.headline || '').toLowerCase().includes(q) ||
             (t.summary || '').toLowerCase().includes(q) ||
             (a.source || '').toLowerCase().includes(q);
    });
  }

  // ソート
  if (state.sort === 'newest') {
    articles.sort((a, b) => new Date(b.fetched_at) - new Date(a.fetched_at));
  } else {
    articles.sort((a, b) => a.source.localeCompare(b.source));
  }

  if (articles.length === 0) {
    container.innerHTML = '';
    noArticles.style.display = 'block';
    noArticles.querySelector('p').textContent = NO_ARTICLES_TEXT[state.lang] || NO_ARTICLES_TEXT.ja;
    return;
  }

  noArticles.style.display = 'none';
  container.innerHTML = articles.map(a => renderCard(a)).join('');
}

function renderCard(article) {
  const t = article.translations?.[state.lang];
  if (!t) return '';

  const headline = escHtml(t.headline || '');
  const summary = escHtml(t.summary || '');
  const cat = t.category || 'その他';
  const catLabel = (CAT_DISPLAY[state.lang] || CAT_DISPLAY.ja)[cat] || cat;
  const time = timeAgo(article.fetched_at);
  const shareUrl = `${location.origin}${location.pathname}?date=${state.date}&lang=${state.lang}#article-${article.id}`;

  return `
<article id="article-${article.id}" class="article-card ${catClass(cat)}">
  <div class="article-headline">
    <a href="${escHtml(article.source_url)}" target="_blank" rel="noopener">${headline}</a>
  </div>
  <p class="article-summary">${summary}</p>
  <div class="article-meta">
    <span class="article-source">${escHtml(article.source)}</span>
    <span class="article-category">${escHtml(catLabel)}</span>
    <span class="article-time">${time}</span>
    <button class="share-btn" data-url="${escHtml(shareUrl)}" data-title="${headline}" aria-label="Share">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
      </svg>
    </button>
  </div>
</article>`;
}

function showShareMenu(btn, url, title) {
  document.querySelector('.share-menu')?.remove();

  const waUrl = `https://wa.me/?text=${encodeURIComponent(title + '\n' + url)}`;
  const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;

  const menu = document.createElement('div');
  menu.className = 'share-menu';
  menu.innerHTML = `
    <a href="${waUrl}" target="_blank" rel="noopener">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.556 4.116 1.528 5.845L0 24l6.335-1.652A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.65-.52-5.166-1.427l-.371-.22-3.828.999 1.023-3.713-.241-.383A9.937 9.937 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
      WhatsApp
    </a>
    <a href="${xUrl}" target="_blank" rel="noopener">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      X (Twitter)
    </a>
    <button class="copy-link-btn" data-url="${escHtml(url)}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      リンクをコピー
    </button>`;

  const rect = btn.getBoundingClientRect();
  const menuLeft = Math.min(rect.left, window.innerWidth - 180);
  menu.style.cssText = `position:fixed;top:${rect.bottom + 6}px;left:${menuLeft}px;`;
  document.body.appendChild(menu);

  menu.querySelector('.copy-link-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(url).then(() => {
      const svg = btn.innerHTML;
      btn.textContent = '✓';
      setTimeout(() => { btn.innerHTML = svg; }, 2000);
    });
    menu.remove();
  });

  setTimeout(() => {
    document.addEventListener('click', () => menu.remove(), { once: true });
  }, 0);
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── UIの更新 ─────────────────────────────────────────────────

function updateFilterLabels() {
  const labels = FILTER_LABELS[state.lang] || FILTER_LABELS.ja;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    const cat = btn.dataset.cat;
    btn.textContent = labels[cat] || cat;
  });
}

function updateSortLabels() {
  const labels = SORT_LABELS[state.lang] || SORT_LABELS.ja;
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.textContent = labels[btn.dataset.sort] || btn.dataset.sort;
  });
}

function updateDateNav() {
  document.getElementById('current-date').textContent = formatDate(state.date);
  document.getElementById('next-day').disabled = state.date >= today();
  document.getElementById('last-updated').textContent =
    state.articles.length > 0 ? `${state.articles.length} articles` : '';
}

// ─── イベントハンドラ ─────────────────────────────────────────

async function changeDate(date) {
  state.date = date;
  state.articles = [];
  state.search = '';
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  document.getElementById('articles-container').innerHTML =
    `<div class="loading">${LOADING_TEXT[state.lang]}</div>`;
  state.articles = await loadArticles(date);
  updateDateNav();
  renderArticles();
}

function setupEventListeners() {
  // 言語切替
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.lang = btn.dataset.lang;
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b === btn));
      updateFilterLabels();
      updateSortLabels();
      renderArticles();
      // URLパラメータ更新
      const url = new URL(window.location);
      url.searchParams.set('lang', state.lang);
      history.replaceState(null, '', url);
    });
  });

  // カテゴリフィルター
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.category = btn.dataset.cat;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderArticles();
    });
  });

  // ソート
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.sort = btn.dataset.sort;
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderArticles();
    });
  });

  // 日付ナビ
  document.getElementById('prev-day').addEventListener('click', () => {
    changeDate(offsetDate(state.date, -1));
  });
  document.getElementById('next-day').addEventListener('click', () => {
    if (state.date < today()) changeDate(offsetDate(state.date, 1));
  });

  // キーワード検索
  document.getElementById('search-input').addEventListener('input', e => {
    state.search = e.target.value.trim();
    renderArticles();
  });

  // 共有ボタン（イベント委任）
  document.getElementById('articles-container').addEventListener('click', e => {
    const btn = e.target.closest('.share-btn');
    if (!btn) return;
    e.stopPropagation();
    if (navigator.share) {
      navigator.share({ title: btn.dataset.title, url: btn.dataset.url }).catch(() => {});
    } else {
      showShareMenu(btn, btn.dataset.url, btn.dataset.title);
    }
  });

  // テーマ切替
  const themeBtn = document.getElementById('theme-toggle');
  themeBtn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? '' : 'dark');
    themeBtn.textContent = isDark ? '🌙' : '☀️';
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
  });
}

// ─── 初期化 ───────────────────────────────────────────────────

async function init() {
  // URLパラメータから言語・日付を取得
  const params = new URLSearchParams(window.location.search);
  const langParam = params.get('lang');
  if (langParam && ['ja', 'en', 'nl', 'es', 'hi'].includes(langParam)) {
    state.lang = langParam;
    document.querySelectorAll('.lang-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === langParam);
    });
  }
  const dateParam = params.get('date');
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam <= today()) {
    state.date = dateParam;
  }

  // 保存されたテーマを復元
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('theme-toggle').textContent = '☀️';
  }

  setupEventListeners();
  updateFilterLabels();
  updateSortLabels();
  updateDateNav();

  // データを読み込む
  state.articles = await loadArticles(state.date);
  updateDateNav();
  renderArticles();

  // 共有リンクで来た場合：記事にスクロール＆ハイライト
  const hash = window.location.hash;
  if (hash && hash.startsWith('#article-')) {
    const el = document.getElementById(hash.slice(1));
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('article-highlighted');
        setTimeout(() => el.classList.remove('article-highlighted'), 3000);
      }, 200);
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
