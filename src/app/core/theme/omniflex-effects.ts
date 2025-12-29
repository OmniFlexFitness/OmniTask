type Cleanup = () => void;

type RGB = { r: number; g: number; b: number };

export function initOmniFlexEffects(): Cleanup {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return () => {};
  }

  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let ring: HTMLDivElement | null = null;
  let rafId: number | null = null;
  let observer: IntersectionObserver | null = null;
  let scanlineEl: HTMLDivElement | null = null;
  let scanCssEl: HTMLStyleElement | null = null;

  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let currentX = targetX;
  let currentY = targetY;

  const cleanups: Cleanup[] = [];

  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const parseRGB = (str?: string | null): RGB | null => {
    if (!str) return null;
    const value = String(str).trim();
    const m = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/i);
    if (m) {
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
    }
    const hx = value.replace(/[^#0-9a-f]/gi, '');
    if (/^#([0-9a-f]{3})$/i.test(hx)) {
      const h = hx.slice(1);
      return {
        r: parseInt(h[0] + h[0], 16),
        g: parseInt(h[1] + h[1], 16),
        b: parseInt(h[2] + h[2], 16)
      };
    }
    if (/^#([0-9a-f]{6})$/i.test(hx)) {
      const h = hx.slice(1);
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16)
      };
    }
    return null;
  };

  const getComputedColor = (el: Element): RGB => {
    let color = getComputedStyle(el).color;
    if (!color || color === 'transparent') {
      let p = el.parentElement;
      while (p && (!color || color === 'transparent')) {
        color = getComputedStyle(p).color;
        p = p.parentElement;
      }
    }
    return parseRGB(color) || { r: 255, g: 255, b: 255 };
  };

  const makeGlowShadow = (rgb: RGB, strength = 1) => {
    const { r, g, b } = rgb;
    const a1 = 0.85 * strength;
    const a2 = 0.55 * strength;
    const a3 = 0.3 * strength;
    return `0 0 10px rgba(${r}, ${g}, ${b}, ${a1}), 0 0 20px rgba(${r}, ${g}, ${b}, ${a2}), 0 0 36px rgba(${r}, ${g}, ${b}, ${a3})`;
  };

  const adjustRing = () => {
    if (!ring) return;
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => {
      if (!ring) return;
      ring.style.width = mq.matches ? '180px' : '260px';
      ring.style.height = mq.matches ? '180px' : '260px';
      ring.style.filter = mq.matches ? 'blur(10px)' : 'blur(14px)';
      ring.style.opacity = mq.matches ? '0.38' : '0.5';
    };
    apply();
    const listener = () => apply();
    if (mq.addEventListener) mq.addEventListener('change', listener);
    else mq.addListener(listener);
    cleanups.push(() => {
      if (mq.removeEventListener) mq.removeEventListener('change', listener);
      else mq.removeListener(listener);
    });
  };

  const createRing = () => {
    if (ring) return;
    ring = document.createElement('div');
    ring.className = 'omni-accent-ring';
    ring.style.left = `${currentX}px`;
    ring.style.top = `${currentY}px`;
    ring.setAttribute('aria-hidden', 'true');
    document.documentElement.appendChild(ring);
    adjustRing();
  };

  const animateRing = () => {
    currentX = lerp(currentX, targetX, 0.12);
    currentY = lerp(currentY, targetY, 0.12);
    if (ring) {
      ring.style.left = `${currentX}px`;
      ring.style.top = `${currentY}px`;
    }
    rafId = window.requestAnimationFrame(animateRing);
  };

  const onMove = (e: MouseEvent) => {
    targetX = e.clientX;
    targetY = e.clientY + window.scrollY;
  };

  const enhanceHeadings = () => {
    const headings = document.querySelectorAll<HTMLElement>('.site-body h1, .site-body h2, .site-body h3, .site-body h4, .site-body h5, .site-body h6');
    headings.forEach((h) => {
      h.style.willChange = 'transform, text-shadow, filter';
      const onHover = (e: MouseEvent) => {
        if (prefersReduced) return;
        const rect = h.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) / rect.width;
        const dy = (e.clientY - cy) / rect.height;
        const tx = clamp(dx * 4, -4, 4);
        const ty = clamp(dy * 4, -4, 4);
        h.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
        h.style.filter = 'brightness(1.06)';
        const rgb = getComputedColor(h);
        h.style.textShadow = makeGlowShadow(rgb, 1);
      };
      const onLeave = () => {
        h.style.transform = '';
        h.style.filter = '';
        h.style.textShadow = '';
      };
      h.addEventListener('mousemove', onHover);
      h.addEventListener('mouseleave', onLeave);
      cleanups.push(() => {
        h.removeEventListener('mousemove', onHover);
        h.removeEventListener('mouseleave', onLeave);
      });
    });
  };

  const enhanceLinks = () => {
    const onOver = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest('.site-body a') as HTMLElement | null;
      if (!target) return;
      if (prefersReduced) {
        target.style.filter = 'brightness(1.04)';
        return;
      }
      const rgb = getComputedColor(target);
      target.style.textShadow = makeGlowShadow(rgb, 1.1);
      target.style.filter = 'brightness(1.08)';
      target.style.setProperty('--underline-scale', '1');
      target.style.boxShadow = `inset 0 -2px 0 rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.55)`;
    };
    const onOut = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest('.site-body a') as HTMLElement | null;
      if (!target) return;
      target.style.textShadow = '';
      target.style.filter = '';
      target.style.removeProperty('--underline-scale');
      target.style.boxShadow = '';
    };
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    cleanups.push(() => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
    });
  };

  const revealSections = () => {
    const sections = document.querySelectorAll<HTMLElement>('.site-body section, .site-body article, .site-body .markdown-preview-section, .site-body .ofx-panel');
    if (!sections.length) return;

    sections.forEach((el) => {
      el.style.transform = 'translateY(6px)';
      el.style.opacity = '0';
      el.style.transition = 'transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 420ms ease, box-shadow 600ms ease';
    });

    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target as HTMLElement;
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
          if (!prefersReduced) {
            el.style.boxShadow = '0 12px 36px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 0 22px rgba(0, 210, 255, 0.18), 0 0 28px rgba(165, 100, 255, 0.14)';
          }
          observer?.unobserve(el);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });

    sections.forEach((el) => observer?.observe(el));
    cleanups.push(() => observer?.disconnect());
  };

  const SCANLINE_CSS = `
    .neon-scanlines .omni-neon-scanlines {
      position: fixed;
      pointer-events: none;
      left: 0; top: 0; right: 0; bottom: 0;
      z-index: 1;
      opacity: 0.22;
      mix-blend-mode: screen;
      background:
        repeating-linear-gradient(
          to bottom,
          rgba(0, 0, 0, 0) 0px,
          rgba(0, 0, 0, 0) 2px,
          rgba(0, 210, 255, 0.12) 3px,
          rgba(0, 0, 0, 0) 4px
        ),
        radial-gradient(1200px 700px at 15% 10%, rgba(165, 100, 255, 0.06), transparent 55%),
        radial-gradient(900px 600px at 85% 15%, rgba(0, 210, 255, 0.06), transparent 60%);
      transform: translateZ(0);
      will-change: background-position, opacity;
    }
    @keyframes omni-scan-fade {
      0% { opacity: 0.16; }
      50% { opacity: 0.26; }
      100% { opacity: 0.16; }
    }
    @keyframes omni-scan-shift {
      0% { background-position: 0 0, 0 0, 0 0; }
      100% { background-position: 0 2px, 0 0, 0 0; }
    }
    .neon-scanlines .omni-neon-scanlines.omni-animated {
      animation: omni-scan-fade 5s ease-in-out infinite,
                 omni-scan-shift 0.9s steps(2, end) infinite;
    }
  `;

  const ensureScanlineStyles = () => {
    if (scanCssEl) return;
    scanCssEl = document.createElement('style');
    scanCssEl.setAttribute('data-omni', 'scanlines');
    scanCssEl.textContent = SCANLINE_CSS;
    document.head.appendChild(scanCssEl);
  };

  const addScanlines = () => {
    if (scanlineEl) return;
    ensureScanlineStyles();
    scanlineEl = document.createElement('div');
    scanlineEl.className = `omni-neon-scanlines${prefersReduced ? '' : ' omni-animated'}`;
    document.body.appendChild(scanlineEl);
  };

  const removeScanlines = () => {
    if (scanlineEl?.parentNode) {
      scanlineEl.parentNode.removeChild(scanlineEl);
      scanlineEl = null;
    }
  };

  const handleScanlineToggle = () => {
    const enabled = document.documentElement.classList.contains('neon-scanlines') || document.body.classList.contains('neon-scanlines');
    if (enabled) addScanlines(); else removeScanlines();
  };

  const observeScanlineClass = () => {
    const target = document.documentElement;
    const body = document.body;
    const mo = new MutationObserver(() => handleScanlineToggle());
    mo.observe(target, { attributes: true, attributeFilter: ['class'] });
    mo.observe(body, { attributes: true, attributeFilter: ['class'] });
    handleScanlineToggle();
    cleanups.push(() => mo.disconnect());
  };

  const onVisibility = () => {
    if (document.hidden) {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = null;
      if (scanlineEl) scanlineEl.classList.remove('omni-animated');
    } else if (!prefersReduced) {
      if (!rafId) rafId = window.requestAnimationFrame(animateRing);
      if (scanlineEl) scanlineEl.classList.add('omni-animated');
    }
  };

  const mount = () => {
    createRing();
    if (!prefersReduced) {
      rafId = window.requestAnimationFrame(animateRing);
      window.addEventListener('mousemove', onMove, { passive: true });
      cleanups.push(() => window.removeEventListener('mousemove', onMove));
    }
    enhanceHeadings();
    enhanceLinks();
    revealSections();
    observeScanlineClass();
    document.addEventListener('visibilitychange', onVisibility);
    cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));
  };

  mount();

  return () => {
    if (rafId) window.cancelAnimationFrame(rafId);
    cleanups.forEach((fn) => fn());
    if (observer) observer.disconnect();
    removeScanlines();
    if (ring?.parentNode) ring.parentNode.removeChild(ring);
    if (scanCssEl?.parentNode) scanCssEl.parentNode.removeChild(scanCssEl);
  };
}
