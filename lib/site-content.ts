export const MANAGED_CONTENT_KEYS = [
  "homepage.hero",
  "homepage.overview",
  "homepage.editorial",
  "info.page",
  "site.contact",
] as const;

export type ManagedContentKey = (typeof MANAGED_CONTENT_KEYS)[number];

export type BasicPageContent = {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
};

export type HomepageEditorialContent = {
  seo: {
    title: string;
    description: string;
  };
  hero: {
    eyebrow: string;
    secondaryCtaLabel: string;
    secondaryCtaHref: string;
    disciplinesAriaLabel: string;
    disciplines: string[];
    featuredLabel: string;
    deskLabel: string;
    awaitingLabel: string;
    emptyMessage: string;
    readPublicationLabel: string;
    lensLabel: string;
    publishedLabel: string;
    chapterLabel: string;
    defaultChapter: string;
    ruleLabels: string[];
  };
  purpose: {
    eyebrow: string;
  };
  latest: {
    eyebrow: string;
    title: string;
    ctaLabel: string;
    ctaHref: string;
    editionPrefix: string;
    defaultByline: string;
  };
  research: {
    eyebrow: string;
    title: string;
    introduction: string;
    areas: Array<{
      number: string;
      label: string;
      title: string;
      body: string;
      href: string;
      linkLabel: string;
    }>;
  };
  impact: {
    eyebrow: string;
    title: string;
    body: string;
    ctaLabel: string;
    ctaHref: string;
    stats: Array<{ value: string; label: string }>;
  };
  application: {
    openEyebrow: string;
    closedEyebrow: string;
    openTitle: string;
    closedTitle: string;
    body: string;
    openCtaLabel: string;
    closedCtaLabel: string;
    ctaHref: string;
  };
};

export type InfoContentBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "image"; src: string; alt: string; caption: string; width?: number; height?: number }
  | { type: "link"; label: string; href: string }
  | {
      type: "cta";
      eyebrow: string;
      heading: string;
      body: string;
      primaryLabel: string;
      primaryHref: string;
      secondaryLabel: string;
      secondaryHref: string;
    };

export type InfoPageContent = {
  seo: {
    title: string;
    description: string;
  };
  eyebrow: string;
  title: string;
  introduction: string;
  blocks: InfoContentBlock[];
};

export type SiteContactContent = {
  body: string;
  email: string;
  emailLabel: string;
  socialLinks: Array<{ label: string; href: string }>;
};

export type ManagedContentValue =
  | BasicPageContent
  | HomepageEditorialContent
  | InfoPageContent
  | SiteContactContent;

export const DEFAULT_HOMEPAGE_HERO: BasicPageContent = {
  title: "The deals that shape markets, examined by the people entering them.",
  body: "M&A Watch brings together ambitious students to research the strategy, law and market forces behind history's most consequential transactions.",
  ctaLabel: "Explore our research",
  ctaHref: "/reports/strategic",
};

export const DEFAULT_HOMEPAGE_OVERVIEW: BasicPageContent = {
  title: "We turn complex transactions into practical, rigorous learning.",
  body: "Our analysts investigate what happened, why it mattered and what the market can learn from it. Every report is designed to be useful to a curious reader, not only an industry insider.",
  ctaLabel: "Discover M&A Watch",
  ctaHref: "/info",
};

export const DEFAULT_HOMEPAGE_EDITORIAL: HomepageEditorialContent = {
  seo: {
    title: "Student-led deal intelligence",
    description: "Explore student-led strategic, legal and markets analysis from M&A Watch, or apply to join our growing research network.",
  },
  hero: {
    eyebrow: "Independent. Student-led. Global in outlook.",
    secondaryCtaLabel: "Join M&A Watch",
    secondaryCtaHref: "/apply",
    disciplinesAriaLabel: "Our research disciplines",
    disciplines: ["Finance", "Law", "Markets"],
    featuredLabel: "Featured research",
    deskLabel: "Research desk",
    awaitingLabel: "Awaiting publication",
    emptyMessage: "New research will appear here.",
    readPublicationLabel: "Read the publication",
    lensLabel: "Lens",
    publishedLabel: "Published",
    chapterLabel: "Chapter",
    defaultChapter: "M&A Watch",
    ruleLabels: ["Strategy", "Regulation", "Valuation", "Execution"],
  },
  purpose: {
    eyebrow: "01 / Our purpose",
  },
  latest: {
    eyebrow: "03 / Latest research",
    title: "Current thinking",
    ctaLabel: "View all publications",
    ctaHref: "/reports/strategic",
    editionPrefix: "M&A",
    defaultByline: "M&A Watch Research",
  },
  research: {
    eyebrow: "02 / Our work",
    title: "Three lenses. One market.",
    introduction: "Read a transaction from the commercial, legal and market perspectives that determine its outcome.",
    areas: [
      {
        number: "01",
        title: "Strategic",
        label: "Deal reports",
        body: "Retrospective analysis of the rationale, valuation and execution behind transactions that reshaped their industries.",
        href: "/reports/strategic",
        linkLabel: "Explore strategic reports",
      },
      {
        number: "02",
        title: "Legal",
        label: "Law and regulation",
        body: "Clear examinations of the cases, rules and regulatory decisions that determine how landmark deals get done.",
        href: "/reports/legal",
        linkLabel: "Explore legal reports",
      },
      {
        number: "03",
        title: "Markets",
        label: "Global outlook",
        body: "Student perspectives on macro themes, asset classes and the market conditions surrounding corporate activity.",
        href: "/markets",
        linkLabel: "Read markets newsletters",
      },
    ],
  },
  impact: {
    eyebrow: "04 / Growing together",
    title: "Research with reach.",
    body: "Our inter-university network gives students a platform to build commercial judgement, publish ambitious work and learn from one another.",
    ctaLabel: "Meet the network",
    ctaHref: "/team",
    stats: [
      { value: "19", label: "Published reports" },
      { value: "6+", label: "University chapters" },
      { value: "20+", label: "Student analysts" },
      { value: "3", label: "Research divisions" },
    ],
  },
  application: {
    openEyebrow: "2026 applications are open",
    closedEyebrow: "Applications are currently closed",
    openTitle: "Put your curiosity to work.",
    closedTitle: "Stay close to the next opportunity.",
    body: "Join a division in Finance, Law or Markets and help us make rigorous deal analysis accessible to the next generation.",
    openCtaLabel: "Start your application",
    closedCtaLabel: "View application information",
    ctaHref: "/apply",
  },
};

export const DEFAULT_INFO_PAGE: InfoPageContent = {
  seo: {
    title: "About",
    description: "Learn why M&A Watch exists, how our student-led research works and what our network offers its members.",
  },
  eyebrow: "About M&A Watch",
  title: "Opening the deal room to the next generation.",
  introduction: "We give university students a platform to understand landmark M&A activity, publish high-quality research and develop the judgement demanded by finance and law.",
  blocks: [
    {
      type: "heading",
      level: 2,
      text: "Potential is everywhere. Access to practical experience is not.",
    },
    {
      type: "paragraph",
      text: "Mergers and acquisitions, investment banking and corporate law can feel exclusive to students encountering them for the first time. We bridge that gap through meaningful, publishable work.",
    },
    {
      type: "paragraph",
      text: "Members research past transactions, test the original strategic case and explain how law, markets and execution shaped the result. The process builds knowledge that lectures alone cannot provide.",
    },
    {
      type: "heading",
      level: 2,
      text: "Build understanding. Expand opportunity.",
    },
    {
      type: "paragraph",
      text: "Our mission is to help students learn by producing work that matters: rigorous, accessible retrospectives on significant transactions.",
    },
    {
      type: "heading",
      level: 2,
      text: "From question to publication.",
    },
    {
      type: "paragraph",
      text: "Every report moves through a structured process: choosing the question, building the evidence, testing the argument with editors and sharing the finished work.",
    },
    {
      type: "cta",
      eyebrow: "Explore the work",
      heading: "See our principles in practice.",
      body: "Start with our latest strategic analysis, or find out how to contribute to the next edition.",
      primaryLabel: "Read reports",
      primaryHref: "/reports/strategic",
      secondaryLabel: "Apply to join",
      secondaryHref: "/apply",
    },
  ],
};

export const DEFAULT_SITE_CONTACT: SiteContactContent = {
  body: "Student-led research at the intersection of finance, law and global markets.",
  email: "hello@mawatch.org",
  emailLabel: "hello@mawatch.org",
  socialLinks: [],
};

export type ContentValidationResult =
  | { ok: true; value: ManagedContentValue }
  | { ok: false; error: string };

const MAX_CONTENT_BYTES = 60_000;
const MAX_INFO_BLOCKS = 18;
const MAX_RESEARCH_AREAS = 6;
const MAX_STATS = 8;
const MAX_SOCIAL_LINKS = 6;
const MAX_HOME_LABELS = 8;
const IMAGE_EXTENSIONS = /\.(?:avif|jpe?g|png|webp)$/i;
const MANAGED_INFO_IMAGE = /^\/api\/content\/info\/assets\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;

export function isManagedContentKey(value: string): value is ManagedContentKey {
  return (MANAGED_CONTENT_KEYS as readonly string[]).includes(value);
}

export function isSafeContentHref(value: string): boolean {
  const href = value.trim();
  if (!href || href.length > 500 || /[\u0000-\u001f\\]/.test(href)) return false;
  if (href.startsWith("/") && !href.startsWith("//")) {
    try {
      const url = new URL(href, "https://mawatch.invalid");
      return url.origin === "https://mawatch.invalid" && !hasTraversal(url.pathname);
    } catch {
      return false;
    }
  }
  try {
    const url = new URL(href);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isSafeContentImageSource(value: string): boolean {
  const src = value.trim();
  if (!src.startsWith("/") || src.startsWith("//") || !isSafeContentHref(src)) return false;
  if (MANAGED_INFO_IMAGE.test(src)) return true;
  try {
    const url = new URL(src, "https://mawatch.invalid");
    return url.origin === "https://mawatch.invalid" && IMAGE_EXTENSIONS.test(url.pathname) && !url.hash;
  } catch {
    return false;
  }
}

export function isSafeSocialHref(value: string): boolean {
  const href = value.trim();
  if (!isSafeContentHref(href) || href.startsWith("/")) return false;
  try {
    return new URL(href).protocol === "https:";
  } catch {
    return false;
  }
}

export function validateManagedContent(
  key: ManagedContentKey,
  input: unknown,
): ContentValidationResult {
  if (!isRecord(input)) return invalid("Content must be a JSON object.");
  try {
    if (JSON.stringify(input).length > MAX_CONTENT_BYTES) {
      return invalid("Content is too large. Shorten the copy or remove some items.");
    }
  } catch {
    return invalid("Content could not be serialised.");
  }

  try {
    if (key === "homepage.hero" || key === "homepage.overview") {
      return { ok: true, value: validateBasicContent(input) };
    }
    if (key === "homepage.editorial") {
      return { ok: true, value: validateHomepageEditorial(input) };
    }
    if (key === "info.page") {
      return { ok: true, value: validateInfoPage(input) };
    }
    return { ok: true, value: validateSiteContact(input) };
  } catch (cause) {
    return invalid(cause instanceof Error ? cause.message : "Content is invalid.");
  }
}

export function coerceManagedContent(
  key: ManagedContentKey,
  input: unknown,
): ManagedContentValue {
  const result = validateManagedContent(key, input);
  if (result.ok) return result.value;

  if ((key === "homepage.hero" || key === "homepage.overview") && isRecord(input)) {
    const fallback = key === "homepage.hero"
      ? DEFAULT_HOMEPAGE_HERO
      : DEFAULT_HOMEPAGE_OVERVIEW;
    const ctaHref = optionalText(input.ctaHref, 500);
    return {
      title: optionalText(input.title, 180) || fallback.title,
      body: optionalText(input.body, 8_000) || fallback.body,
      ctaLabel: optionalText(input.ctaLabel, 80) || fallback.ctaLabel,
      ctaHref: ctaHref && isSafeContentHref(ctaHref) ? ctaHref : fallback.ctaHref,
    };
  }

  if (key === "homepage.editorial" && isRecord(input)) {
    const fallback = clone(DEFAULT_HOMEPAGE_EDITORIAL);
    const expanded = {
      seo: { ...fallback.seo, ...recordOrEmpty(input.seo) },
      hero: { ...fallback.hero, ...recordOrEmpty(input.hero) },
      purpose: { ...fallback.purpose, ...recordOrEmpty(input.purpose) },
      latest: { ...fallback.latest, ...recordOrEmpty(input.latest) },
      research: { ...fallback.research, ...recordOrEmpty(input.research) },
      impact: { ...fallback.impact, ...recordOrEmpty(input.impact) },
      application: { ...fallback.application, ...recordOrEmpty(input.application) },
    };
    const expandedResult = validateManagedContent(key, expanded);
    if (expandedResult.ok) return expandedResult.value;
  }

  if (key === "info.page" && isRecord(input)) {
    const fallback = clone(DEFAULT_INFO_PAGE);
    const expanded = {
      ...fallback,
      ...input,
      seo: { ...fallback.seo, ...recordOrEmpty(input.seo) },
    };
    const expandedResult = validateManagedContent(key, expanded);
    if (expandedResult.ok) return expandedResult.value;

    const title = optionalText(input.title, 180);
    const body = optionalText(input.body, 8_000);
    if (title || body) {
      return {
        ...clone(DEFAULT_INFO_PAGE),
        title: title || DEFAULT_INFO_PAGE.title,
        introduction: body || DEFAULT_INFO_PAGE.introduction,
      };
    }
  }

  if (key === "site.contact" && isRecord(input)) {
    const body = optionalText(input.body, 1_000);
    const href = optionalText(input.ctaHref, 500);
    const legacyEmail = href.toLowerCase().startsWith("mailto:") ? href.slice(7) : "";
    if (body || isValidEmail(legacyEmail)) {
      return {
        ...clone(DEFAULT_SITE_CONTACT),
        body: body || DEFAULT_SITE_CONTACT.body,
        email: isValidEmail(legacyEmail) ? legacyEmail : DEFAULT_SITE_CONTACT.email,
        emailLabel: optionalText(input.ctaLabel, 80) || legacyEmail || DEFAULT_SITE_CONTACT.emailLabel,
      };
    }
  }

  return defaultForKey(key);
}

export function defaultForKey(key: ManagedContentKey): ManagedContentValue {
  if (key === "homepage.hero") return clone(DEFAULT_HOMEPAGE_HERO);
  if (key === "homepage.overview") return clone(DEFAULT_HOMEPAGE_OVERVIEW);
  if (key === "homepage.editorial") return clone(DEFAULT_HOMEPAGE_EDITORIAL);
  if (key === "info.page") return clone(DEFAULT_INFO_PAGE);
  return clone(DEFAULT_SITE_CONTACT);
}

function validateBasicContent(input: Record<string, unknown>): BasicPageContent {
  const ctaLabel = requiredText(input.ctaLabel, "Call-to-action label", 80);
  const ctaHref = requiredHref(input.ctaHref, "Call-to-action link");
  return {
    title: requiredText(input.title, "Title", 180),
    body: requiredText(input.body, "Body", 8_000),
    ctaLabel,
    ctaHref,
  };
}

function validateHomepageEditorial(input: Record<string, unknown>): HomepageEditorialContent {
  const seo = requiredRecord(input.seo, "Homepage search metadata");
  const hero = requiredRecord(input.hero, "Homepage hero supporting content");
  const purpose = requiredRecord(input.purpose, "Homepage purpose section");
  const latest = requiredRecord(input.latest, "Latest research section");
  const research = requiredRecord(input.research, "Research section");
  const impact = requiredRecord(input.impact, "Impact section");
  const application = requiredRecord(input.application, "Application section");
  const disciplines = requiredArray(hero.disciplines, "Research disciplines", 1, MAX_HOME_LABELS);
  const ruleLabels = requiredArray(hero.ruleLabels, "Hero rule labels", 1, MAX_HOME_LABELS);
  const areas = requiredArray(research.areas, "Research areas", 1, MAX_RESEARCH_AREAS);
  const stats = requiredArray(impact.stats, "Impact statistics", 1, MAX_STATS);

  return {
    seo: {
      title: requiredText(seo.title, "Homepage search title", 70),
      description: requiredText(seo.description, "Homepage search description", 180),
    },
    hero: {
      eyebrow: requiredText(hero.eyebrow, "Hero eyebrow", 120),
      secondaryCtaLabel: requiredText(hero.secondaryCtaLabel, "Hero secondary link label", 100),
      secondaryCtaHref: requiredHref(hero.secondaryCtaHref, "Hero secondary link"),
      disciplinesAriaLabel: requiredText(hero.disciplinesAriaLabel, "Research disciplines accessibility label", 100),
      disciplines: disciplines.map((item, index) => requiredText(item, `Research discipline ${index + 1}`, 40)),
      featuredLabel: requiredText(hero.featuredLabel, "Featured research label", 80),
      deskLabel: requiredText(hero.deskLabel, "Empty research desk label", 80),
      awaitingLabel: requiredText(hero.awaitingLabel, "Awaiting publication label", 80),
      emptyMessage: requiredText(hero.emptyMessage, "Empty research message", 240),
      readPublicationLabel: requiredText(hero.readPublicationLabel, "Publication link label", 100),
      lensLabel: requiredText(hero.lensLabel, "Lens fact label", 40),
      publishedLabel: requiredText(hero.publishedLabel, "Published fact label", 40),
      chapterLabel: requiredText(hero.chapterLabel, "Chapter fact label", 40),
      defaultChapter: requiredText(hero.defaultChapter, "Default chapter label", 80),
      ruleLabels: ruleLabels.map((item, index) => requiredText(item, `Hero rule label ${index + 1}`, 40)),
    },
    purpose: {
      eyebrow: requiredText(purpose.eyebrow, "Purpose section label", 80),
    },
    latest: {
      eyebrow: requiredText(latest.eyebrow, "Latest research section label", 80),
      title: requiredText(latest.title, "Latest research title", 180),
      ctaLabel: requiredText(latest.ctaLabel, "Latest research link label", 100),
      ctaHref: requiredHref(latest.ctaHref, "Latest research link"),
      editionPrefix: requiredText(latest.editionPrefix, "Publication edition prefix", 30),
      defaultByline: requiredText(latest.defaultByline, "Default publication byline", 100),
    },
    research: {
      eyebrow: requiredText(research.eyebrow, "Research eyebrow", 80),
      title: requiredText(research.title, "Research title", 180),
      introduction: requiredText(research.introduction, "Research introduction", 1_000),
      areas: areas.map((item, index) => {
        const area = requiredRecord(item, `Research area ${index + 1}`);
        return {
          number: requiredText(area.number, `Research area ${index + 1} number`, 8),
          label: requiredText(area.label, `Research area ${index + 1} label`, 80),
          title: requiredText(area.title, `Research area ${index + 1} title`, 120),
          body: requiredText(area.body, `Research area ${index + 1} body`, 1_000),
          href: requiredHref(area.href, `Research area ${index + 1} link`),
          linkLabel: requiredText(area.linkLabel, `Research area ${index + 1} link label`, 100),
        };
      }),
    },
    impact: {
      eyebrow: requiredText(impact.eyebrow, "Impact eyebrow", 80),
      title: requiredText(impact.title, "Impact title", 180),
      body: requiredText(impact.body, "Impact body", 1_500),
      ctaLabel: requiredText(impact.ctaLabel, "Impact link label", 100),
      ctaHref: requiredHref(impact.ctaHref, "Impact link"),
      stats: stats.map((item, index) => {
        const stat = requiredRecord(item, `Statistic ${index + 1}`);
        return {
          value: requiredText(stat.value, `Statistic ${index + 1} value`, 24),
          label: requiredText(stat.label, `Statistic ${index + 1} label`, 80),
        };
      }),
    },
    application: {
      openEyebrow: requiredText(application.openEyebrow, "Open-state eyebrow", 100),
      closedEyebrow: requiredText(application.closedEyebrow, "Closed-state eyebrow", 100),
      openTitle: requiredText(application.openTitle, "Open-state title", 180),
      closedTitle: requiredText(application.closedTitle, "Closed-state title", 180),
      body: requiredText(application.body, "Application body", 1_500),
      openCtaLabel: requiredText(application.openCtaLabel, "Open-state button label", 100),
      closedCtaLabel: requiredText(application.closedCtaLabel, "Closed-state button label", 100),
      ctaHref: requiredHref(application.ctaHref, "Application link"),
    },
  };
}

function validateInfoPage(input: Record<string, unknown>): InfoPageContent {
  const seo = requiredRecord(input.seo, "Info page search metadata");
  const blocks = requiredArray(input.blocks, "Info page blocks", 1, MAX_INFO_BLOCKS);
  return {
    seo: {
      title: requiredText(seo.title, "Info page search title", 70),
      description: requiredText(seo.description, "Info page search description", 180),
    },
    eyebrow: requiredText(input.eyebrow, "Page eyebrow", 100),
    title: requiredText(input.title, "Page title", 180),
    introduction: requiredText(input.introduction, "Page introduction", 2_000),
    blocks: blocks.map(validateInfoBlock),
  };
}

function validateInfoBlock(input: unknown, index: number): InfoContentBlock {
  const block = requiredRecord(input, `Block ${index + 1}`);
  const type = requiredText(block.type, `Block ${index + 1} type`, 20);
  if (type === "heading") {
    const level = Number(block.level);
    if (level !== 2 && level !== 3) throw new Error(`Block ${index + 1} heading level must be 2 or 3.`);
    return {
      type,
      level,
      text: requiredText(block.text, `Block ${index + 1} heading`, 240),
    };
  }
  if (type === "paragraph") {
    return { type, text: requiredText(block.text, `Block ${index + 1} text`, 4_000) };
  }
  if (type === "image") {
    const src = requiredText(block.src, `Block ${index + 1} image source`, 500);
    if (!isSafeContentImageSource(src)) {
      throw new Error(`Block ${index + 1} image must use a managed upload or safe site image path ending in PNG, JPEG, WebP or AVIF.`);
    }
    const managed = MANAGED_INFO_IMAGE.test(src);
    const width = optionalDimension(block.width);
    const height = optionalDimension(block.height);
    if (managed && (!width || !height || width * height > 24_000_000)) {
      throw new Error(`Block ${index + 1} managed image dimensions are invalid.`);
    }
    return {
      type,
      src,
      alt: requiredText(block.alt, `Block ${index + 1} image alternative text`, 300),
      caption: optionalText(block.caption, 500),
      ...(width && height ? { width, height } : {}),
    };
  }
  if (type === "link") {
    return {
      type,
      label: requiredText(block.label, `Block ${index + 1} link label`, 120),
      href: requiredHref(block.href, `Block ${index + 1} link`),
    };
  }
  if (type === "cta") {
    const secondaryLabel = optionalText(block.secondaryLabel, 100);
    const secondaryHref = optionalText(block.secondaryHref, 500);
    if (Boolean(secondaryLabel) !== Boolean(secondaryHref)) {
      throw new Error(`Block ${index + 1} secondary call to action needs both a label and a link.`);
    }
    if (secondaryHref && !isSafeContentHref(secondaryHref)) {
      throw new Error(`Block ${index + 1} secondary link must be a site path or HTTPS URL.`);
    }
    return {
      type,
      eyebrow: optionalText(block.eyebrow, 100),
      heading: requiredText(block.heading, `Block ${index + 1} call-to-action heading`, 180),
      body: requiredText(block.body, `Block ${index + 1} call-to-action body`, 1_500),
      primaryLabel: requiredText(block.primaryLabel, `Block ${index + 1} primary label`, 100),
      primaryHref: requiredHref(block.primaryHref, `Block ${index + 1} primary link`),
      secondaryLabel,
      secondaryHref,
    };
  }
  throw new Error(`Block ${index + 1} has an unsupported type.`);
}

function validateSiteContact(input: Record<string, unknown>): SiteContactContent {
  const email = requiredText(input.email, "Contact email", 254).toLowerCase();
  if (!isValidEmail(email)) throw new Error("Enter a valid contact email address.");
  const socialLinks = Array.isArray(input.socialLinks) ? input.socialLinks : [];
  if (socialLinks.length > MAX_SOCIAL_LINKS) {
    throw new Error(`Add no more than ${MAX_SOCIAL_LINKS} social links.`);
  }
  return {
    body: requiredText(input.body, "Footer description", 1_000),
    email,
    emailLabel: requiredText(input.emailLabel, "Contact email label", 100),
    socialLinks: socialLinks.map((item, index) => {
      const link = requiredRecord(item, `Social link ${index + 1}`);
      const href = requiredText(link.href, `Social link ${index + 1} URL`, 500);
      if (!isSafeSocialHref(href)) {
        throw new Error(`Social link ${index + 1} must use a valid HTTPS URL.`);
      }
      return {
        label: requiredText(link.label, `Social link ${index + 1} label`, 60),
        href,
      };
    }),
  };
}

function requiredHref(value: unknown, label: string): string {
  const href = requiredText(value, label, 500);
  if (!isSafeContentHref(href)) throw new Error(`${label} must be a site path or HTTPS URL.`);
  return href;
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const text = value.trim();
  if (!text) throw new Error(`${label} is required.`);
  if (text.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  if (/\u0000/.test(text)) throw new Error(`${label} contains an unsupported character.`);
  return text;
}

function optionalText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.slice(0, maxLength).replace(/\u0000/g, "");
}

function optionalDimension(value: unknown): number | undefined {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= 8_192
    ? Number(value)
    : undefined;
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} is required.`);
  return value;
}

function requiredArray(value: unknown, label: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error(`${label} must contain between ${min} and ${max} items.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function hasTraversal(pathname: string): boolean {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  return decoded.split("/").some((segment) => segment === ".." || segment === ".");
}

function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(value);
}

function invalid(error: string): ContentValidationResult {
  return { ok: false, error };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
