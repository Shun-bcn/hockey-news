// ─── 状態管理 ─────────────────────────────────────────────────
const state = {
  lang: 'ja',
  category: 'all',
  sort: 'newest',
  date: today(),
  articles: [],
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
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
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
    '選手': 'cat-選手', 'テクノロジー': 'cat-テクノロジー', 'ルール': 'cat-ルール', 'その他': 'cat-その他'
  };
  return map[cat] || 'cat-その他';
}

// 言語別カテゴリ表示名
const CAT_DISPLAY = {
  ja: { '試合結果': '試合結果', '代表チーム': '代表チーム', 'リーグ': 'リーグ', '選手': '選手', 'テクノロジー': 'テクノロジー', 'ルール': 'ルール', 'その他': 'その他' },
  en: { '試合結果': 'Match', '代表チーム': 'National Team', 'リーグ': 'League', '選手': 'Player', 'テクノロジー': 'Technology', 'ルール': 'Rules', 'その他': 'Other' },
  nl: { '試合結果': 'Wedstrijd', '代表チーム': 'Nationaal Team', 'リーグ': 'Competitie', '選手': 'Speler', 'テクノロジー': 'Technologie', 'ルール': 'Regels', 'その他': 'Overig' },
  es: { '試合結果': 'Partido', '代表チーム': 'Selección', 'リーグ': 'Liga', '選手': 'Jugador', 'テクノロジー': 'Tecnología', 'ルール': 'Reglamento', 'その他': 'Otros' },
};

const FILTER_LABELS = {
  ja: { all: 'すべて', '試合結果': '試合結果', '代表チーム': '代表チーム', 'リーグ': 'リーグ', '選手': '選手', 'テクノロジー': 'テクノロジー', 'ルール': 'ルール', 'その他': 'その他' },
  en: { all: 'All', '試合結果': 'Match', '代表チーム': 'National Team', 'リーグ': 'League', '選手': 'Player', 'テクノロジー': 'Technology', 'ルール': 'Rules', 'その他': 'Other' },
  nl: { all: 'Alle', '試合結果': 'Wedstrijd', '代表チーム': 'Nationaal', 'リーグ': 'Competitie', '選手': 'Speler', 'テクノロジー': 'Technologie', 'ルール': 'Regels', 'その他': 'Overig' },
  es: { all: 'Todo', '試合結果': 'Partidos', '代表チーム': 'Selección', 'リーグ': 'Liga', '選手': 'Jugadores', 'テクノロジー': 'Tecnología', 'ルール': 'Reglas', 'その他': 'Otros' },
};

const SORT_LABELS = {
  ja: { newest: '新着順', source: 'ソース別' },
  en: { newest: 'Newest', source: 'By Source' },
  nl: { newest: 'Nieuwste', source: 'Per bron' },
  es: { newest: 'Reciente', source: 'Por fuente' },
};

const SITE_TITLE = {
  ja: '🏑 Hockey433',
  en: '🏑 Hockey433',
  nl: '🏑 Hockey433',
  es: '🏑 Hockey433',
};

const LOADING_TEXT = {
  ja: '読み込み中...', en: 'Loading...', nl: 'Laden...', es: 'Cargando...',
};

const NO_ARTICLES_TEXT = {
  ja: 'この日のニュースはありません', en: 'No news for this day',
  nl: 'Geen nieuws voor deze dag', es: 'No hay noticias para este día',
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

  return `
<article class="article-card ${catClass(cat)}">
  <div class="article-headline">
    <a href="${escHtml(article.source_url)}" target="_blank" rel="noopener">${headline}</a>
  </div>
  <p class="article-summary">${summary}</p>
  <div class="article-meta">
    <span class="article-source">${escHtml(article.source)}</span>
    <span class="article-category">${escHtml(catLabel)}</span>
    <span class="article-time">${time}</span>
  </div>
</article>`;
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
  // URLパラメータから言語を取得
  const params = new URLSearchParams(window.location.search);
  const langParam = params.get('lang');
  if (langParam && ['ja', 'en', 'nl', 'es'].includes(langParam)) {
    state.lang = langParam;
    document.querySelectorAll('.lang-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === langParam);
    });
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

  // 今日のデータを読み込む
  state.articles = await loadArticles(state.date);
  updateDateNav();
  renderArticles();
}

document.addEventListener('DOMContentLoaded', init);
