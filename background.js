// === TraceTrust Background Service Worker ===
// Handles messaging, storage, and optional API-level credibility checks.

// Known high-authority domain list (extended)
const AUTHORITY_DOMAINS = [
  // Government & Intergovernmental
  '.gov', '.mil', 'who.int', 'un.org', 'worldbank.org', 'imf.org',
  'europa.eu', 'nasa.gov', 'cdc.gov', 'nih.gov', 'nsf.gov',
  // Education
  '.edu', '.ac.', 'mit.edu', 'stanford.edu', 'harvard.edu', 'ox.ac.uk',
  'cam.ac.uk', 'berkeley.edu', 'caltech.edu', 'ethz.ch',
  // Academic publishers & repositories
  'nature.com', 'science.org', 'lancet.com', 'nejm.org',
  'ieee.org', 'acm.org', 'springer.com', 'elsevier.com', 'wiley.com',
  'arxiv.org', 'pubmed.ncbi.nlm.nih.gov', 'scholar.google.com',
  'researchgate.net', 'semanticscholar.org',
  // Major news (high editorial standards)
  'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'npr.org',
  'pbs.org', 'economist.com', 'ft.com', 'wsj.com', 'nytimes.com',
  'bloomberg.com', 'propublica.org', 'pulitzer.org',
  // Encyclopedia & reference
  'wikipedia.org', 'wikimedia.org', 'britannica.com',
  // Data / statistics
  'census.gov', 'data.gov', 'data.worldbank.org', 'ourworldindata.org',
  // Chinese official & academic
  'gov.cn', 'edu.cn', 'xinhuanet.com', 'people.com.cn', 'cctv.com',
  'cnki.net', 'cqvip.com', 'wanfangdata.com',
];

// Low credibility indicators
const LOW_CRED_TLDS = ['.xyz', '.top', '.tk', '.ml', '.ga', '.cf', '.gq', '.info', '.cc', '.pw', '.bid', '.win', '.download'];

chrome.runtime.onInstalled.addListener(() => {
  console.log('[TraceTrust] Extension installed.');
  // Initialize default settings
  chrome.storage.local.set({
    settings: {
      showInlineBadge: true,
      autoAnalyze: true,
      historyEnabled: true,
    },
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PAGE_SIGNALS') {
    handleGetSignals(sender.tab.id).then(sendResponse);
    return true; // async
  }

  if (message.type === 'SCORE_REQUEST') {
    const result = scoreFromSignals(message.signals);
    sendResponse(result);
    return false;
  }
});

async function handleGetSignals(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__traceTrustSignals || null,
    });
    return results[0]?.result || null;
  } catch (err) {
    console.error('[TraceTrust] Failed to get signals:', err);
    return null;
  }
}

function scoreFromSignals(signals) {
  if (!signals) return { total: 0, breakdown: {}, label: 'unknown' };

  const breakdown = {
    domain: scoreDomain(signals.domain, signals.protocol),
    security: scoreSecurity(signals.protocol),
    citations: scoreCitations(signals.citationCount, signals.highAuthorityCount, signals.hasReferences),
    author: scoreAuthor(signals.author, signals.hasAuthorBio, signals.schemaTypes),
    structure: scoreStructure(signals),
    content: scoreContent(signals),
  };

  // Weighted total
  const weights = { domain: 0.30, security: 0.10, citations: 0.25, author: 0.15, structure: 0.10, content: 0.10 };
  let total = 0;
  for (const [key, weight] of Object.entries(weights)) {
    total += (breakdown[key] || 0) * weight;
  }
  total = Math.round(Math.min(100, Math.max(0, total)));

  let label;
  if (total >= 75) label = 'trusted';
  else if (total >= 45) label = 'caution';
  else label = 'untrusted';

  return { total, breakdown, label };
}

function scoreDomain(domain, protocol) {
  if (!domain) return 0;
  let score = 50; // neutral baseline

  // TLD check
  if (AUTHORITY_DOMAINS.some((d) => domain.includes(d))) {
    score += 35;
  }

  // Specific high-trust domain patterns
  if (domain.endsWith('.gov') || domain.endsWith('.gov.cn')) score += 40;
  else if (domain.endsWith('.edu') || domain.endsWith('.edu.cn') || domain.includes('.ac.')) score += 35;
  else if (domain.endsWith('.org') || domain.endsWith('.org.cn')) score += 10;

  // Low credibility TLDs
  if (LOW_CRED_TLDS.some((tld) => domain.endsWith(tld))) {
    score -= 30;
  }

  // Remove www prefix for checks
  const cleanDomain = domain.replace(/^www\./, '');

  // Known reputable domains boost
  const reputableDomains = [
    'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'npr.org', 'pbs.org',
    'nature.com', 'science.org', 'lancet.com',
    'xinhuanet.com', 'people.com.cn',
    'wikipedia.org', 'britannica.com',
  ];
  if (reputableDomains.some((d) => cleanDomain === d || cleanDomain.endsWith('.' + d))) {
    score += 15;
  }

  // Blog / personal subdomain penalty (subdomain patterns common in low-effort sites)
  if (/^(blog|www\d|news|top|best|free|online)\./.test(cleanDomain)) {
    score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

function scoreSecurity(protocol) {
  return protocol === 'https:' ? 100 : 20;
}

function scoreCitations(citationCount, highAuthorityCount, hasReferences) {
  let score = 30; // baseline

  if (citationCount > 0) score += Math.min(citationCount * 8, 30);
  if (highAuthorityCount > 0) score += Math.min(highAuthorityCount * 15, 30);
  if (hasReferences) score += 10;

  return Math.min(100, score);
}

function scoreAuthor(author, hasAuthorBio, schemaTypes) {
  let score = 20;
  if (author) score += 30;
  if (hasAuthorBio) score += 20;
  if (schemaTypes.some((t) => ['Article', 'NewsArticle', 'BlogPosting', 'ScholarlyArticle', 'Report', 'ResearchPaper'].includes(t))) {
    score += 30;
  }
  return Math.min(100, score);
}

function scoreStructure(signals) {
  let score = 30;
  if (signals.hasAboutPage) score += 15;
  if (signals.hasContactPage) score += 15;
  if (signals.hasPrivacyPolicy) score += 10;
  if (signals.description) score += 15;
  if (signals.publishedTime) score += 15;
  return Math.min(100, score);
}

function scoreContent(signals) {
  let score = 30;
  // Substantial content
  if (signals.wordCount > 300) score += 15;
  if (signals.wordCount > 1000) score += 15;
  // Headings indicate structured content
  if (signals.headings && signals.headings.length >= 2) score += 10;
  if (signals.headings && signals.headings.length >= 5) score += 10;
  // Fact-check / corrections indicate editorial rigor
  if (signals.hasFactCheck) score += 10;
  if (signals.hasCorrections) score += 10;
  return Math.min(100, score);
}
