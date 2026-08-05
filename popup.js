// === TraceTrust Popup Logic ===

// --- Credibility Scoring Engine ---

// TLD reputation weights
const TLD_WEIGHTS = {
  'gov': 95, 'edu': 90, 'mil': 85,
  'org': 70, 'int': 70,
  'com': 50, 'net': 50, 'co': 50,
  'io': 45, 'ai': 40, 'dev': 40,
  'info': 30, 'xyz': 20, 'top': 15, 'tk': 10,
  'cn': 55, 'uk': 60, 'jp': 60, 'de': 60
};

// Domains with known high credibility — broad coverage across industries
const KNOWN_TRUSTED_DOMAINS = [
  // Academic / Research
  'wikipedia.org', 'wikimedia.org', 'britannica.com',
  'nih.gov', 'cdc.gov', 'who.int', 'nasa.gov', 'nsf.gov',
  'nature.com', 'science.org', 'ieee.org', 'acm.org', 'lancet.com',
  'arxiv.org', 'scholar.google.com', 'researchgate.net',
  // Developer / Tech
  'github.com', 'gitlab.com', 'stackoverflow.com', 'npmjs.com',
  'developer.mozilla.org', 'docs.python.org', 'w3.org',
  // Major tech platforms (high trust by default)
  'google.com', 'microsoft.com', 'apple.com', 'amazon.com',
  'cloudflare.com', 'fastly.com', 'akamai.com',
  // Top news (high editorial standard)
  'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'npr.org', 'pbs.org',
  'economist.com', 'ft.com', 'wsj.com', 'nytimes.com', 'washingtonpost.com',
  'bloomberg.com', 'propublica.org', 'theguardian.com',
  // Chinese official / academic
  'gov.cn', 'edu.cn', 'xinhuanet.com', 'people.com.cn', 'cctv.com',
  'cnki.net', 'cqvip.com', 'wanfangdata.com',
  // Social / video (domain authority, not content)
  'youtube.com', 'vimeo.com', 'ted.com',
  // Encyclopedia / Data
  'data.gov', 'ourworldindata.org', 'worldbank.org', 'un.org', 'europa.eu',
  // Medical / Health
  'mayoclinic.org', 'clevelandclinic.org', 'webmd.com', 'health.harvard.edu'
];

// Domains with known low credibility
const KNOWN_LOW_CRED_DOMAINS = [
  'breitbart.com', 'infowars.com', 'naturalnews.com'
];

// UGC / Social platforms — brand is legit but content is user-generated, not vetted
const KNOWN_UGC_PLATFORMS = [
  // Global social
  'youtube.com', 'youtu.be', 'tiktok.com', 'instagram.com', 'facebook.com', 'fb.com',
  'twitter.com', 'x.com', 'reddit.com', 'linkedin.com', 'pinterest.com', 'snapchat.com',
  'tumblr.com', 'medium.com', 'quora.com', 'twitch.tv', 'discord.com',
  // Developer UGC
  'github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com', 'npmjs.com',
  'dev.to', 'hashnode.dev', 'codesandbox.io', 'replit.com', 'jsfiddle.net',
  // Chinese platforms
  'douyin.com', 'weibo.com', 'zhihu.com', 'bilibili.com', 'xiaohongshu.com',
  'jianshu.com', 'csdn.net', 'juejin.cn', 'oschina.net', 'segmentfault.com',
  'qzone.qq.com', 'tieba.baidu.com', 'zhidao.baidu.com', 'baijiahao.baidu.com',
  'weixin.qq.com', 'mp.weixin.qq.com',
  // Video / live
  'vimeo.com', 'dailymotion.com', 'live.bilibili.com',
  // E-commerce UGC (reviews)
  'amazon.com', 'taobao.com', 'jd.com', 'shopee.com',
];

/**
 * Score source authority (0-100) — combines domain TLD, known trust, and UGC detection.
 * Returns polar scores: 95 for top-tier, 15 for junk, fewer in the middle.
 */
function scoreSourceAuthority(data) {
  const hostname = data.hostname || '';
  if (!hostname) return 5;
  const pageIsUGC = data.contentType === 'ugc';
  const pageIsMixed = data.contentType === 'mixed';

  // Tier 1: Known trusted domain → 95, or 45 if page is UGC
  for (const trusted of KNOWN_TRUSTED_DOMAINS) {
    if (hostname.endsWith(trusted)) {
      return pageIsUGC ? 45 : pageIsMixed ? 65 : 95;
    }
  }

  // Tier 2: Gov/Edu → 90
  if (hostname.endsWith('.gov') || hostname.endsWith('.edu') ||
      hostname.endsWith('.gov.cn') || hostname.endsWith('.edu.cn') || hostname.includes('.ac.')) {
    return 90;
  }

  // Tier 3: Known low-cred → 15
  for (const low of KNOWN_LOW_CRED_DOMAINS) {
    if (hostname.endsWith(low)) return 15;
  }

  // Tier 4: TLD-based
  const parts = hostname.split('.');
  const tld = parts[parts.length - 1].toLowerCase();
  let score;
  if (TLD_WEIGHTS[tld] !== undefined) {
    score = TLD_WEIGHTS[tld];
  } else {
    score = 25; // unknown TLD → low trust
  }

  // UGC page penalty
  if (pageIsUGC) score = Math.min(score, 40);
  if (pageIsMixed) score = Math.min(score, 60);

  // Penalties
  if (parts.length > 4) score = Math.max(10, score - 20);
  const digitRatio = (hostname.match(/\d/g) || []).length / (hostname.length || 1);
  if (digitRatio > 0.3) score = Math.max(10, score - 25);

  return Math.min(100, Math.max(5, score));
}

/**
 * Score content depth (0-100) — how substantial and well-structured the page is.
 * High-quality articles score high; thin/social pages score low.
 */
function scoreContentDepth(data) {
  const wc = data.wordCount || 0;
  const hCount = data.headingCount || 0;
  const hasImages = data.hasImages;
  const hasDataTable = data.hasDataTable;
  let score = 0;

  // Word count is the primary signal
  if (wc > 2000) score += 40;
  else if (wc > 800) score += 30;
  else if (wc > 200) score += 15;
  else if (wc > 50) score += 5;
  else score += 0; // very short → likely not informational

  // Structure: headings indicate organized content
  if (hCount >= 5) score += 25;
  else if (hCount >= 2) score += 15;
  else if (hCount >= 1) score += 5;

  // Rich media: images suggest effort
  if (hasImages > 5) score += 15;
  else if (hasImages > 0) score += 10;

  // Data tables / charts suggest research
  if (hasDataTable) score += 20;

  return Math.min(100, score);
}

/**
 * Score HTTPS security (0-100)
 */
function scoreHTTPS(protocol) {
  if (protocol === 'https:') return 100;
  return 10;
}

/**
 * Score citations / references from extracted page data (0-100)
 */
function scoreCitations(data) {
  let score = 0;

  // Reference-list items
  score += Math.min((data.refListItems || 0) * 5, 40);

  // Footnote-style links
  score += Math.min((data.supFootnotes || 0) * 5, 20);

  // Blockquote count
  score += Math.min((data.blockquoteCount || 0) * 5, 15);

  // External authoritative links
  score += Math.min((data.authoritativeLinkCount || 0) * 3, 25);

  return Math.min(100, score);
}

/**
 * Score author attribution from extracted page data (0-100)
 */
function scoreAuthor(data) {
  let score = 20; // base

  // Meta author tag
  if (data.metaAuthor) score += 30;

  // Schema.org author
  if (data.schemaAuthor) score += 20;

  // Author element found
  if (data.foundAuthorEl) score += 20;

  // Publication date present
  if (data.hasPublishedTime) score += 20;

  // No author at all is suspicious
  if (score <= 20) score = 10;

  return Math.min(100, score);
}

/**
 * Compute total credibility score (0-100) — 5 sharp dimensions
 */
function computeTotalScore(sourceScore, httpsScore, citationScore, authorScore, depthScore) {
  // Weighted average with sharper differentiation
  const weights = { source: 0.25, https: 0.10, citations: 0.30, author: 0.20, depth: 0.15 };
  const total = sourceScore * weights.source +
                httpsScore * weights.https +
                citationScore * weights.citations +
                authorScore * weights.author +
                depthScore * weights.depth;
  return Math.round(Math.min(100, Math.max(0, total)));
}

// --- UI helpers ---

function setColorClass(el, score, prefix) {
  el.classList.remove('high', 'medium', 'low');
  if (score >= 70) el.classList.add('high');
  else if (score >= 40) el.classList.add('medium');
  else el.classList.add('low');
}

function updateBadge(totalScore) {
  const badge = document.getElementById('badge');
  badge.classList.remove('trusted', 'caution', 'untrusted');
  if (totalScore >= 70) { badge.textContent = '可信'; badge.classList.add('trusted'); }
  else if (totalScore >= 40) { badge.textContent = '存疑'; badge.classList.add('caution'); }
  else { badge.textContent = '低可信'; badge.classList.add('untrusted'); }
}

function setDetailBar(fillEl, score) {
  fillEl.style.width = score + '%';
  setColorClass(fillEl, score);
}

// --- Page Data Extraction (runs in page context) ---

function extractPageData() {
  const doc = document;
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  const pageHost = hostname.replace('www.', '');

  // Known trusted domains for authoritative link detection
  var KNOWN = [
    'wikipedia.org','wikimedia.org','nih.gov','cdc.gov','who.int',
    'nature.com','science.org','ieee.org','acm.org','reuters.com',
    'apnews.com','bbc.com','bbc.co.uk','arxiv.org','scholar.google.com',
    'gov.cn','edu.cn','xinhuanet.com','people.com.cn','cctv.com'
  ];

  // --- Citation data ---
  var refListItems = 0;
  var refLists = doc.querySelectorAll('ol, ul');
  for (var i = 0; i < refLists.length; i++) {
    var text = (refLists[i].textContent || '').toLowerCase();
    if (text.indexOf('reference') !== -1 || text.indexOf('citation') !== -1 ||
        text.indexOf('source') !== -1 || text.indexOf('bibliography') !== -1 ||
        text.indexOf('参考') !== -1 || text.indexOf('引用') !== -1 ||
        text.indexOf('来源') !== -1 || text.indexOf('文献') !== -1) {
      refListItems += refLists[i].querySelectorAll('li').length;
    }
  }

  var supFootnotes = doc.querySelectorAll('sup a, sup[class*="ref"], sup[class*="footnote"]').length;
  var blockquoteCount = doc.querySelectorAll('blockquote').length;

  var totalCitationCount = refListItems + supFootnotes + blockquoteCount;

  // --- Author data ---
  var metaAuthorEl = doc.querySelector('meta[name="author"], meta[property="article:author"]');
  var metaAuthor = metaAuthorEl ? metaAuthorEl.getAttribute('content') : null;

  var schemaEl = doc.querySelector('[itemprop="author"], [property="author"]');
  var schemaAuthor = schemaEl ? schemaEl.textContent.trim() : null;

  var authorEls = doc.querySelectorAll('.author, .byline, [class*="author"], [class*="byline"], [id*="author"], [rel="author"]');
  var foundAuthorEl = false;
  for (var j = 0; j < authorEls.length; j++) {
    var t = (authorEls[j].textContent || '').trim();
    if (t.length > 2 && t.length < 100 && t.indexOf('©') === -1) { foundAuthorEl = true; break; }
  }

  var hasPublishedTime = !!(doc.querySelector('meta[name="date"], meta[property="article:published_time"]') ||
                             doc.querySelector('time[datetime]'));

  // --- Link analysis ---
  var externalLinkCount = 0;
  var authoritativeLinkCount = 0;
  var allLinks = doc.querySelectorAll('a[href^="http"]');
  for (var k = 0; k < allLinks.length; k++) {
    try {
      var u = new URL(allLinks[k].href);
      var linkHost = u.hostname.replace('www.', '');
      if (linkHost !== pageHost) {
        externalLinkCount++;
        for (var m = 0; m < KNOWN.length; m++) {
          if (linkHost.indexOf(KNOWN[m]) !== -1) { authoritativeLinkCount++; break; }
        }
      }
    } catch (_) {}
  }

  // --- Content type detection: publisher vs UGC ---
  var contentType = 'publisher';
  var ugcScore = 0;

  // Rule 0: URL path is an official page → always publisher
  var path = window.location.pathname.toLowerCase();
  var officialPaths = ['/about', '/about-us', '/help', '/contact', '/terms', '/privacy',
    '/press', '/news', '/blog', '/careers', '/security', '/legal', '/policies',
    '/docs', '/documentation', '/api', '/status', '/shop', '/store', '/product',
    '/features', '/pricing', '/enterprise', '/company', '/investors', '/sustainability'];
  var isOfficialPage = officialPaths.some(function(p) { return path.indexOf(p) === 0; });
  if (isOfficialPage) { ugcScore = -100; }

  // Rule 1: User profile indicators (follower count, bio, avatar patterns)
  var followerLabels = doc.querySelectorAll('[class*="follower"], [class*="following"], ' +
    '[class*="subscriber"], [class*="粉丝"], [class*="关注"]');
  if (followerLabels.length > 0) ugcScore += 30;

  // Profile avatar / user card patterns
  var profileEls = doc.querySelectorAll('[class*="profile"], [class*="user-card"], ' +
    '[class*="author-card"], [class*="creator-card"], [class*="avatar"]');
  if (profileEls.length >= 2) ugcScore += 20;

  // Rule 2: Comment / reply section
  var commentEls = doc.querySelectorAll('[class*="comment"], [class*="reply"], ' +
    '[class*="discussion"], [id*="comment"], [class*="评论"], [class*="回复"]');
  if (commentEls.length >= 2) ugcScore += 25;

  // Rule 3: Social engagement buttons (like, share, repost)
  var socialBtns = doc.querySelectorAll('[class*="like"], [class*="share"], [class*="repost"], ' +
    '[class*="retweet"], [class*="forward"], [class*="收藏"], [class*="点赞"], ' +
    '[class*="分享"], [class*="转发"], [aria-label*="like"], [aria-label*="Like"]');
  if (socialBtns.length >= 3) ugcScore += 20;

  // Rule 4: Post/article list with timestamps (feed pattern)
  var timeEls = doc.querySelectorAll('time, [class*="timestamp"], [class*="post-time"], ' +
    '[class*="publish"], [datetime]');
  var postItems = doc.querySelectorAll('[class*="post"], [class*="article"], [class*="feed"], ' +
    '[class*="story"], [class*="tweet"], [class*="动态"], [class*="笔记"]');
  if (timeEls.length >= 3 && postItems.length >= 2) ugcScore += 25;

  // Rule 5: Follow / subscribe call-to-action
  var followBtns = doc.querySelectorAll('[class*="follow"], [class*="subscribe"], ' +
    '[class*="subscribe"], [class*="member"]');
  // Exclude newsletter signup (often has email input)
  var hasNewsletter = doc.querySelectorAll('input[type="email"], [class*="newsletter"]').length > 0;
  if (followBtns.length >= 2 && !hasNewsletter) ugcScore += 15;

  // Rule 6: Username / handle display
  var handleEls = doc.querySelectorAll('[class*="username"], [class*="handle"], ' +
    '[class*="nickname"], [class*="display-name"]');
  if (handleEls.length >= 1) ugcScore += 10;

  // Rule 7: Login prompt for interaction
  var bodyText = (doc.body.innerText || '').toLowerCase();
  var loginPrompts = 0;
  if (bodyText.indexOf('sign in to') !== -1 || bodyText.indexOf('log in to') !== -1 ||
      bodyText.indexOf('登录后') !== -1 || bodyText.indexOf('请先登录') !== -1) loginPrompts++;
  if (bodyText.indexOf('create an account to') !== -1 || bodyText.indexOf('注册后') !== -1) loginPrompts++;
  ugcScore += loginPrompts * 10;

  // Rule 8: Single author note with large following (personal blog / newsletter)
  if (followerLabels.length === 0 && profileEls.length === 1 && commentEls.length === 0 &&
      socialBtns.length >= 2 && followBtns.length >= 1) {
    ugcScore += 15; // likely personal blog with social sharing
  }

  // Classify
  if (isOfficialPage) {
    contentType = 'publisher';
  } else if (ugcScore >= 40) {
    contentType = 'ugc';
  } else if (ugcScore >= 20) {
    contentType = 'mixed'; // e.g. news site with comments section
  } else {
    contentType = 'publisher';
  }

  // --- Content depth signals ---
  // Word count (CJK + Latin words)
  var mainContent = doc.querySelector('article, main, [role=\"main\"], .post-content, .article-content, .entry-content');
  var bodyEl = mainContent || doc.body;
  var bodyText = (bodyEl.innerText || '');
  var cjkChars = (bodyText.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  var latinWords = (bodyText.match(/\b[a-zA-Z]{2,}\b/g) || []).length;
  var wordCount = cjkChars + latinWords;

  // Heading count
  var headingCount = doc.querySelectorAll('h1, h2, h3').length;

  // Image count
  var hasImages = doc.querySelectorAll('img').length;

  // Data tables (indicates research/data-driven content)
  var hasDataTable = doc.querySelectorAll('table[class*=\"data\"], table[class*=\"wikitable\"], ' +
    'table[class*=\"infobox\"], figure[class*=\"table\"]').length > 0;

  return {
    hostname: hostname,
    protocol: protocol,
    citationCount: totalCitationCount,
    externalLinkCount: externalLinkCount,
    refListItems: refListItems,
    supFootnotes: supFootnotes,
    blockquoteCount: blockquoteCount,
    authoritativeLinkCount: authoritativeLinkCount,
    metaAuthor: metaAuthor,
    schemaAuthor: schemaAuthor,
    foundAuthorEl: foundAuthorEl,
    hasPublishedTime: hasPublishedTime,
    contentType: contentType,
    ugcScore: ugcScore,
    wordCount: wordCount,
    headingCount: headingCount,
    hasImages: hasImages,
    hasDataTable: hasDataTable
  };
}

// --- Main ---

async function analyzePage(tab) {
  const btn = document.getElementById('btnRefresh');
  btn.disabled = true;
  btn.textContent = '分析中...';

  try {
    // Execute content script function in the active tab
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageData
    });

    if (!results || results.length === 0) throw new Error('No results');

    const data = results[0].result;
    renderResults(data);
  } catch (err) {
    console.error('TraceTrust analysis error:', err);
    document.getElementById('scoreValue').textContent = '!';
    document.getElementById('scoreLabel').textContent = '分析失败，请刷新页面后重试';
    document.getElementById('badge').textContent = '错误';
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 重新分析';
  }
}

function renderResults(data) {
  const sourceScore = scoreSourceAuthority(data);
  const httpsScore = scoreHTTPS(data.protocol);
  const citationScore = scoreCitations(data);
  const authorScore = scoreAuthor(data);
  const depthScore = scoreContentDepth(data);
  const totalScore = computeTotalScore(sourceScore, httpsScore, citationScore, authorScore, depthScore);

  // Show UGC warning based on page-level content type detection
  const ugcWarn = document.getElementById('ugcWarning');
  if (data.contentType === 'ugc') {
    ugcWarn.style.display = 'flex';
    document.getElementById('ugcWarning').querySelector('.ugc-text').textContent =
      '此页面检测为用户生成内容（UGC），信息由个人发布，请核实发布者身份与引用来源。';
  } else if (data.contentType === 'mixed') {
    ugcWarn.style.display = 'flex';
    document.getElementById('ugcWarning').querySelector('.ugc-text').textContent =
      '此页面包含用户生成内容（如评论区），主体内容可能来自出版方，建议关注引用和作者信息。';
  } else {
    ugcWarn.style.display = 'none';
  }

  // Update main score
  document.getElementById('scoreValue').textContent = totalScore;

  const label = document.getElementById('scoreLabel');
  if (totalScore >= 70) label.textContent = '该页面信息可信度较高';
  else if (totalScore >= 40) label.textContent = '该页面信息可信度一般，请交叉验证';
  else label.textContent = '该页面信息可信度较低，请谨慎采信';

  // Update ring
  const circle = document.getElementById('progressCircle');
  const circumference = 326.73;
  const offset = circumference - (totalScore / 100) * circumference;
  circle.style.strokeDashoffset = offset;
  setColorClass(circle, totalScore);

  // Update badge
  updateBadge(totalScore);

  // Update detail items
  document.getElementById('sourceScore').textContent = sourceScore;
  setDetailBar(document.getElementById('sourceFill'), sourceScore);

  document.getElementById('httpsScore').textContent = httpsScore;
  setDetailBar(document.getElementById('httpsFill'), httpsScore);

  document.getElementById('citationScore').textContent = citationScore;
  setDetailBar(document.getElementById('citationFill'), citationScore);

  document.getElementById('depthScore').textContent = depthScore;
  setDetailBar(document.getElementById('depthFill'), depthScore);

  document.getElementById('authorScore').textContent = authorScore;
  setDetailBar(document.getElementById('authorFill'), authorScore);

  // Source info
  document.getElementById('domainName').textContent = data.hostname || '--';
  document.getElementById('citationCount').textContent =
    data.citationCount != null ? data.citationCount + ' 个' : '--';
  document.getElementById('externalLinks').textContent =
    data.externalLinkCount != null ? data.externalLinkCount + ' 个' : '--';

  // Author details
  document.getElementById('authorMeta').textContent = data.metaAuthor ? '✓ ' + truncate(data.metaAuthor, 30) : '✗ 未找到';
  document.getElementById('authorMeta').style.color = data.metaAuthor ? '#86efac' : '#fca5a5';
  document.getElementById('authorSchema').textContent = data.schemaAuthor ? '✓ ' + truncate(data.schemaAuthor, 30) : '✗ 未找到';
  document.getElementById('authorSchema').style.color = data.schemaAuthor ? '#86efac' : '#fca5a5';
  document.getElementById('authorEl').textContent = data.foundAuthorEl ? '✓ 已检测到' : '✗ 未找到';
  document.getElementById('authorEl').style.color = data.foundAuthorEl ? '#86efac' : '#fca5a5';
  document.getElementById('authorDate').textContent = data.hasPublishedTime ? '✓ 已检测到' : '✗ 未找到';
  document.getElementById('authorDate').style.color = data.hasPublishedTime ? '#86efac' : '#fca5a5';

  // Content depth details
  document.getElementById('wordCount').textContent = (data.wordCount || 0) + ' 词';
  document.getElementById('headingInfo').textContent = (data.headingCount || 0) + ' 个标题';
  var mediaParts = [];
  if (data.hasImages > 0) mediaParts.push(data.hasImages + ' 图');
  if (data.hasDataTable) mediaParts.push('含数据表');
  document.getElementById('mediaInfo').textContent = mediaParts.length > 0 ? mediaParts.join(' · ') : '无';

  // Score formula
  const formulaEl = document.getElementById('formulaText');
  formulaEl.innerHTML =
    '来源 ' + sourceScore + '×25%=' + (sourceScore * 0.25).toFixed(1) + '<br>' +
    '安全 ' + httpsScore + '×10%=' + (httpsScore * 0.10).toFixed(1) + '<br>' +
    '引用 ' + citationScore + '×30%=' + (citationScore * 0.30).toFixed(1) + '<br>' +
    '作者 ' + authorScore + '×20%=' + (authorScore * 0.20).toFixed(1) + '<br>' +
    '深度 ' + depthScore + '×15%=' + (depthScore * 0.15).toFixed(1) + '<br>' +
    '━━━━━━━━━━━━<br>' +
    '总分 = <b>' + totalScore + '</b>';
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// --- Init ---

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    document.getElementById('scoreLabel').textContent = '无法获取当前页面';
    return;
  }

  // Check if we can access this page
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
    document.getElementById('scoreValue').textContent = '--';
    document.getElementById('scoreLabel').textContent = '无法分析浏览器内部页面';
    document.getElementById('badge').textContent = '受限';
    document.getElementById('btnRefresh').disabled = true;
    return;
  }

  await analyzePage(tab);

  document.getElementById('btnRefresh').addEventListener('click', async () => {
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    await analyzePage(t);
  });
});
