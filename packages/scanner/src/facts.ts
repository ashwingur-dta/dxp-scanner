import type { CssFacts, DomFacts } from '@dxp/schema';

export interface CollectedFacts {
  dom: DomFacts;
  css: CssFacts;
  mainText: string;
  mainWordCount: number;
}

export function collectFacts(): CollectedFacts {
  const JUNK_ALT =
    /^(?:image|img|photo|picture|graphic|icon|logo|spacer|blank|untitled|thumbnail)\b|\.(?:jpe?g|png|gif|svg|webp)$|^(?:dsc|img)[-_]?\d+$/i;
  const NONDESCRIPTIVE_LINK =
    /^(?:click here|click|here|read more|more|more info(?:rmation)?|learn more|find out more|details|link|this link|continue|go|download|view)\.?$/i;
  const FEEDBACK_PHRASE =
    /(?:was|is)\s+this\s+page\s+(?:helpful|useful)|did you find (?:this|what)|give feedback|page feedback|rate this page|help us improve|tell us what you think|report a problem with this page|how (?:easy|useful) was/i;
  const CONTACT_ONLY = /^(?:contact us|contact|complaints?|make a complaint|get in touch)$/i;
  const SENTIMENT =
    /thumbs?[-_ ]?(?:up|down)|\bhelpful\b|\bnot helpful\b|\byes\b\s*\/?\s*\bno\b|rate|satisfaction|star-rating/i;
  const PERSONALISATION =
    /dark mode|light mode|high contrast|contrast|text size|font size|increase text|larger text|change theme|appearance/i;
  const COOKIE_BANNER =
    /cookie|consent|we use cookies|accept all|manage preferences|privacy settings/i;

  const text = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05;
  };

  const headings: DomFacts['headings'] = [];
  for (const h of Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))) {
    headings.push({ level: Number(h.tagName[1]), text: text(h).slice(0, 160) });
  }

  let fauxCount = 0;
  for (const el of Array.from(document.querySelectorAll('div,p,span,strong,b'))) {
    if (el.closest('h1,h2,h3,h4,h5,h6,nav,footer,header')) continue;
    const t = text(el);
    if (t.length < 3 || t.length > 90) continue;
    if (el.children.length > 0) continue;
    const s = getComputedStyle(el);
    const size = parseFloat(s.fontSize);
    if (size >= 20 && Number(s.fontWeight) >= 600) {
      fauxCount++;
      if (fauxCount <= 5) headings.push({ level: 0, text: t.slice(0, 160), faux: true });
    }
  }

  const images: DomFacts['images'] = Array.from(document.querySelectorAll('img')).map((img) => {
    const alt = img.getAttribute('alt');
    const src = img.getAttribute('src') ?? '';
    const base = src.split('/').pop()?.split('?')[0] ?? '';
    return {
      src: src.slice(0, 300),
      alt,
      decorative: alt === '' || img.getAttribute('role') === 'presentation',
      junkAlt: !!alt && alt.trim().length > 0 && (JUNK_ALT.test(alt.trim()) || alt.trim() === base),
      width: img.naturalWidth || img.clientWidth,
      height: img.naturalHeight || img.clientHeight,
    };
  });

  const origin = location.hostname;
  const links: DomFacts['links'] = Array.from(document.querySelectorAll('a[href]')).map((a) => {
    const href = a.getAttribute('href') ?? '';
    const label = a.getAttribute('aria-label');
    const t = text(a) || (a.querySelector('img')?.getAttribute('alt') ?? '');
    let external = false;
    try {
      external = new URL(href, location.href).hostname !== origin;
    } catch {
      external = false;
    }
    const effective = (label ?? t).trim();
    return {
      href: href.slice(0, 400),
      text: t.slice(0, 160),
      ariaLabel: label,
      nondescriptive:
        effective.length === 0 ||
        NONDESCRIPTIVE_LINK.test(effective) ||
        /^https?:\/\//i.test(effective),
      external,
      document: /\.(?:pdf|docx?|xlsx?|pptx?|csv|zip|rtf)(?:$|\?)/i.test(href),
      newWindow: a.getAttribute('target') === '_blank',
    };
  });

  const forms: DomFacts['forms'] = Array.from(document.querySelectorAll('form')).map((f) => {
    const fields = Array.from(f.querySelectorAll('input,select,textarea')).filter(
      (el) => (el as HTMLInputElement).type !== 'hidden',
    );
    let unlabelled = 0;
    for (const el of fields) {
      const id = el.getAttribute('id');
      const labelled =
        (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby') ||
        el.closest('label') ||
        el.getAttribute('title');
      if (!labelled) unlabelled++;
    }
    return {
      action: f.getAttribute('action'),
      method: (f.getAttribute('method') ?? 'get').toLowerCase(),
      fieldCount: fields.length,
      requiredCount: fields.filter((el) => el.hasAttribute('required') || el.getAttribute('aria-required') === 'true').length,
      hasTextarea: !!f.querySelector('textarea'),
      unlabelledCount: unlabelled,
    };
  });

  const media: DomFacts['media'] = [];
  for (const v of Array.from(document.querySelectorAll('video,audio'))) {
    const el = v as HTMLMediaElement;
    media.push({
      kind: v.tagName.toLowerCase() === 'video' ? 'video' : 'audio',
      src: (el.getAttribute('src') ?? el.querySelector('source')?.getAttribute('src') ?? '').slice(0, 300),
      autoplay: el.hasAttribute('autoplay'),
      muted: el.hasAttribute('muted') || el.muted,
      hasCaptionsTrack: !!v.querySelector('track[kind="captions"],track[kind="subtitles"]'),
      hasDescriptionsTrack: !!v.querySelector('track[kind="descriptions"]'),
    });
  }
  for (const f of Array.from(document.querySelectorAll('iframe[src]'))) {
    const src = f.getAttribute('src') ?? '';
    if (/youtube|youtu\.be|vimeo|brightcove|dailymotion|wistia|kaltura/i.test(src)) {
      media.push({
        kind: 'iframe-embed',
        src: src.slice(0, 300),
        autoplay: /autoplay=1/i.test(src),
        muted: /mute=1|muted=1/i.test(src),
        hasCaptionsTrack: /cc_load_policy=1/i.test(src),
        hasDescriptionsTrack: false,
      });
    }
  }

  let feedback: DomFacts['feedback'] = null;
  const bodyText = text(document.body);
  const phraseMatch = bodyText.match(FEEDBACK_PHRASE);
  const feedbackLink = links.find(
    (l) => FEEDBACK_PHRASE.test(l.text) || /\/feedback|page-feedback|report-a-problem/i.test(l.href),
  );
  const contactOnly = links.find((l) => CONTACT_ONLY.test(l.text.trim()));

  if (phraseMatch || feedbackLink) {
    let container: Element | null = null;
    for (const el of Array.from(document.querySelectorAll('form,section,aside,div,footer'))) {
      if (FEEDBACK_PHRASE.test(text(el)) && text(el).length < 600) {
        container = el;
        break;
      }
    }
    const scope: Element = container ?? document.body;
    const buttons = Array.from(scope.querySelectorAll('button,[role="button"],input[type="radio"],a'));
    const sentiment = buttons.some((b) => {
      const label = `${text(b)} ${b.getAttribute('aria-label') ?? ''} ${b.className ?? ''} ${b.getAttribute('value') ?? ''}`;
      return SENTIMENT.test(label);
    });
    const freeText = !!scope.querySelector('textarea') || !!feedbackLink;
    const identityFields = Array.from(scope.querySelectorAll('input')).filter((inp) => {
      const n = `${inp.getAttribute('name') ?? ''} ${inp.getAttribute('type') ?? ''} ${inp.getAttribute('id') ?? ''}`;
      return /email|name|phone/i.test(n) && inp.hasAttribute('required');
    });

    feedback = {
      phrase: phraseMatch ? phraseMatch[0] : (feedbackLink?.text ?? null),
      sentimentControl: sentiment,
      freeText,
      accessibleName:
        container?.getAttribute('aria-label') ??
        text(container?.querySelector('h2,h3,legend,label') ?? null) ??
        null,
      requiresIdentity: identityFields.length > 0,
      genericContactOnly: false,
    };
  } else if (contactOnly) {
    feedback = {
      phrase: contactOnly.text,
      sentimentControl: false,
      freeText: false,
      accessibleName: contactOnly.text,
      requiresIdentity: false,
      genericContactOnly: true,
    };
  }

  const viewportMeta = document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null;
  const maxScale = viewportMeta?.match(/maximum-scale\s*=\s*([\d.]+)/i)?.[1];
  const zoomBlocked =
    !!viewportMeta &&
    (/user-scalable\s*=\s*(?:no|0)/i.test(viewportMeta) || (maxScale !== undefined && Number(maxScale) < 2));

  const interactiveSel = 'a[href],button,input:not([type="hidden"]),select,textarea,[role="button"],[role="link"],[tabindex]:not([tabindex="-1"])';
  const interactives = Array.from(document.querySelectorAll(interactiveSel)).filter(visible);
  let smallTargets = 0;
  for (const el of interactives) {
    const r = el.getBoundingClientRect();
    const inlineInText = el.tagName === 'A' && !!el.closest('p,li,td');
    if (!inlineInText && (r.width < 24 || r.height < 24)) smallTargets++;
  }

  const focusables = Array.from(
    document.querySelectorAll('a[href],button,input:not([type="hidden"]),select,textarea,[tabindex]:not([tabindex="-1"])'),
  );
  const skipCandidate = focusables.findIndex(
    (el) => /^#/.test(el.getAttribute('href') ?? '') && /skip|jump to/i.test(text(el)),
  );

  const personalisation = new Set<string>();
  for (const el of interactives) {
    const label = `${text(el)} ${el.getAttribute('aria-label') ?? ''}`;
    const m = label.match(PERSONALISATION);
    if (m) personalisation.add(m[0].toLowerCase());
  }

  let cookieBanner = false;
  for (const el of Array.from(document.querySelectorAll('div,section,aside,dialog,[role="dialog"]'))) {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' && s.position !== 'sticky') continue;
    const t = text(el);
    if (t.length > 20 && t.length < 1200 && COOKIE_BANNER.test(t)) {
      cookieBanner = true;
      break;
    }
  }

  let prefersColorScheme = false;
  let prefersReducedMotion = false;
  let prefersContrast = false;
  let forcedColors = false;
  let hasPrintStylesheet = !!document.querySelector('link[rel="stylesheet"][media*="print"]');

  const scanRules = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      const media = (rule as CSSMediaRule).conditionText ?? (rule as CSSMediaRule).media?.mediaText;
      if (media) {
        if (/prefers-color-scheme/i.test(media)) prefersColorScheme = true;
        if (/prefers-reduced-motion/i.test(media)) prefersReducedMotion = true;
        if (/prefers-contrast/i.test(media)) prefersContrast = true;
        if (/forced-colors/i.test(media)) forcedColors = true;
        if (/\bprint\b/i.test(media)) hasPrintStylesheet = true;
      }
      const nested = (rule as CSSGroupingRule).cssRules;
      if (nested) scanRules(nested);
    }
  };

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      if (sheet.media?.mediaText && /\bprint\b/i.test(sheet.media.mediaText)) hasPrintStylesheet = true;
      if (sheet.cssRules) scanRules(sheet.cssRules);
    } catch {
      continue;
    }
  }

  let justifiedBlocks = 0;
  let allCapsBlocks = 0;
  for (const el of Array.from(document.querySelectorAll('p,li,div,td,h1,h2,h3'))) {
    const t = text(el);
    if (t.length < 50) continue;
    const s = getComputedStyle(el);
    if (s.textAlign === 'justify') justifiedBlocks++;
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? '')
      .join(' ')
      .trim();
    if (own.length >= 50) {
      if (s.textTransform === 'uppercase') allCapsBlocks++;
      else if (own === own.toUpperCase() && /[A-Z]{4,}/.test(own)) allCapsBlocks++;
    }
  }

  const mainEl =
    document.querySelector('main') ??
    document.querySelector('[role="main"]') ??
    document.querySelector('article') ??
    document.querySelector('#content, #main-content, .main-content') ??
    document.body;

  const clone = mainEl.cloneNode(true) as HTMLElement;
  for (const el of Array.from(
    clone.querySelectorAll('nav,header,footer,aside,script,style,noscript,form,button,svg,[aria-hidden="true"],.breadcrumb,.breadcrumbs,.skip-link'),
  )) {
    el.remove();
  }
  const mainText = (clone.innerText ?? clone.textContent ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  return {
    dom: {
      title: document.title ?? '',
      lang: document.documentElement.getAttribute('lang'),
      h1Count: document.querySelectorAll('h1').length,
      headings,
      landmarks: {
        main: document.querySelectorAll('main,[role="main"]').length,
        nav: document.querySelectorAll('nav,[role="navigation"]').length,
        banner: document.querySelectorAll('header,[role="banner"]').length,
        contentinfo: document.querySelectorAll('footer,[role="contentinfo"]').length,
      },
      skipLink: {
        present: skipCandidate >= 0,
        firstFocusable: skipCandidate === 0,
        text: skipCandidate >= 0 ? text(focusables[skipCandidate] ?? null) : null,
      },
      images,
      links,
      forms,
      media,
      feedback,
      metaViewport: viewportMeta,
      zoomBlocked,
      metaRefresh: !!document.querySelector('meta[http-equiv="refresh" i]'),
      smallTargets,
      interactiveCount: interactives.length,
      personalisationControls: Array.from(personalisation),
      cookieBanner,
    },
    css: {
      prefersColorScheme,
      prefersReducedMotion,
      prefersContrast,
      forcedColors,
      hasPrintStylesheet,
      justifiedBlocks,
      allCapsBlocks,
    },
    mainText: mainText.slice(0, 120_000),
    mainWordCount: mainText.split(/\s+/).filter(Boolean).length,
  };
}
