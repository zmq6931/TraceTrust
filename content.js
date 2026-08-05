// === TraceTrust Content Script ===
// Extracts page metadata, citations, and structural signals for credibility scoring.

(function () {
  if (window.__traceTrustExtracted) return;
  window.__traceTrustExtracted = true;

  /**
   * Extract all relevant credibility signals from the page.
   */
  function extractPageSignals() {
    const signals = {
      // Basic metadata
      url: window.location.href,
      domain: window.location.hostname,
      protocol: window.location.protocol,
      title: document.title,

      // Meta tags
      description: getMeta('description'),
      author: getMeta('author'),
      keywords: getMeta('keywords'),
      publishedTime: getMeta('article:published_time') || getMeta('date'),
      ogSiteName: getMeta('og:site_name'),

      // Structured data
      schemaTypes: extractSchemaTypes(),

      // Citations & references
      citations: extractCitations(),
      citationCount: 0,

      // Link analysis
      externalLinks: [],
      externalLinkCount: 0,
      internalLinkCount: 0,
      highAuthorityLinks: [],
      highAuthorityCount: 0,

      // Content signals
      headings: extractHeadings(),
      wordCount: extractWordCount(),
      hasReferences: false,
      hasAuthorBio: false,
      hasFactCheck: false,
      hasCorrections: false,

      // Footer / masthead
      hasAboutPage: false,
      hasContactPage: false,
      hasPrivacyPolicy: false,

      // Social signals
      shareCount: 0,
    };

    // Link analysis
    const links = document.querySelectorAll('a[href]');
    const pageDomain = window.location.hostname.replace('www.', '');

    links.forEach((link) => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

      try {
        const url = new URL(href, window.location.origin);
        const linkDomain = url.hostname.replace('www.', '');

        if (linkDomain === pageDomain) {
          signals.internalLinkCount++;
        } else {
          signals.externalLinkCount++;
          signals.externalLinks.push({ url: href, domain: linkDomain, text: link.textContent.trim().slice(0, 80) });

          // Check if it's a high-authority domain
          if (isHighAuthorityDomain(linkDomain)) {
            signals.highAuthorityLinks.push({ url: href, domain: linkDomain, text: link.textContent.trim().slice(0, 80) });
            signals.highAuthorityCount++;
          }
        }
      } catch (_) {
        // Invalid URL, ignore
      }
    });

    // Deduplicate and count citations
    signals.citationCount = signals.citations.length;

    // Check for reference/bibliography section
    const refIndicators = ['reference', 'bibliography', 'source', 'footnote', 'citation', '参考文献', '参考来源', '参考资料', '引用'];
    const allText = document.body.innerText.toLowerCase();
    signals.hasReferences = refIndicators.some((w) => allText.includes(w));

    // Check for author bio
    signals.hasAuthorBio = !!(
      document.querySelector('.author-bio') ||
      document.querySelector('[class*="author-bio"]') ||
      document.querySelector('.byline') ||
      document.querySelector('[rel="author"]')
    );

    // Check for fact-check / corrections
    const factCheckIndicators = ['fact-check', 'fact check', 'correction', 'update:', 'editor\'s note', '事实核查', '更正'];
    signals.hasFactCheck = factCheckIndicators.some((w) => allText.includes(w.toLowerCase()));
    signals.hasCorrections = allText.includes('correction') || allText.includes('更正');

    // Check for key pages in footer/nav
    signals.hasAboutPage = !!document.querySelector('a[href*="about"]');
    signals.hasContactPage = !!document.querySelector('a[href*="contact"]');
    signals.hasPrivacyPolicy = !!document.querySelector('a[href*="privacy"]');

    return signals;
  }

  function getMeta(name) {
    const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
    return el ? el.getAttribute('content') : null;
  }

  function extractSchemaTypes() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const types = [];
    scripts.forEach((s) => {
      try {
        const data = JSON.parse(s.textContent);
        if (data['@type']) types.push(data['@type']);
        if (Array.isArray(data['@graph'])) {
          data['@graph'].forEach((item) => {
            if (item['@type']) types.push(item['@type']);
          });
        }
      } catch (_) {}
    });
    return types;
  }

  function extractCitations() {
    const citations = [];
    // Look for blockquotes with cite attributes
    document.querySelectorAll('blockquote[cite], q[cite]').forEach((el) => {
      citations.push({ url: el.getAttribute('cite'), type: 'explicit' });
    });
    // Look for <cite> tags
    document.querySelectorAll('cite').forEach((el) => {
      const text = el.textContent.trim();
      if (text) citations.push({ text, type: 'tag' });
    });
    // Look for links that appear to be citations (footnote-style)
    document.querySelectorAll('a[href]').forEach((a) => {
      const text = a.textContent.trim();
      if (/^\[\d+\]$|^\[\d+,\d+\]$|^\[[\w\s-]+\]$/.test(text)) {
        citations.push({ url: a.href, text, type: 'footnote' });
      }
    });
    return citations;
  }

  function extractHeadings() {
    const headings = [];
    for (let i = 1; i <= 3; i++) {
      document.querySelectorAll(`h${i}`).forEach((h) => {
        headings.push({ level: i, text: h.textContent.trim().slice(0, 100) });
      });
    }
    return headings;
  }

  function extractWordCount() {
    const main = document.querySelector('article, main, [role="main"], .post-content, .article-content, .entry-content');
    const target = main || document.body;
    const text = target.innerText || '';
    // Count CJK characters and Latin words
    const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const latin = (text.match(/\b[a-zA-Z]{2,}\b/g) || []).length;
    return cjk + latin;
  }

  function isHighAuthorityDomain(domain) {
    const highAuth = [
      '.gov', '.edu', '.mil', '.ac.',
      'who.int', 'un.org', 'worldbank.org',
      'nature.com', 'science.org', 'lancet.com',
      'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk',
      'npr.org', 'pbs.org',
      'wikipedia.org', 'wikimedia.org',
      'ieee.org', 'acm.org',
      'springer.com', 'elsevier.com', 'wiley.com',
      'arxiv.org', 'pubmed.ncbi.nlm.nih.gov',
      'census.gov', 'data.gov',
      'cnki.net', 'cqvip.com', 'wanfangdata.com', // Chinese academic
      'xinhuanet.com', 'people.com.cn', 'cctv.com', // Chinese official media
    ];
    return highAuth.some((h) => domain.includes(h));
  }

  // Expose signals for popup to read
  window.__traceTrustSignals = extractPageSignals();
})();
