import { useState, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import html2canvas from "html2canvas";

// ---------------------------------------------------------------------------
// Brand palette
// ---------------------------------------------------------------------------
const RED = "#EE3124";
const BLACK = "#0A0A0A";
const WHITE = "#FFFFFF";
const GRAY = "#F5F5F5";
const BORDER = "#E0E0E0";
const LABEL_GRAY = "rgba(10,10,10,0.55)";

const HEAD = "'Nunito', sans-serif"; // headlines — closest to BIXI's GT Maru
const BODY = "'Inter', sans-serif"; // body copy

// ---------------------------------------------------------------------------
// Hardcoded demo data — one rider's 2026 in BIXI
// ---------------------------------------------------------------------------
const RECAP = {
  rides: 187,
  km: 743,
  electricRides: 124,
  co2Saved: 89, // kg
  neighborhood: "Plateau-Mont-Royal",
  bestMonth: "Juillet",
  bestMonthRides: 47,
  style: "electric",
  minutesSaved: 2240,
  ridingMinutes: 3975,
  stationsUsed: 34,
  favoriteStation: "Station Parc Jeanne-Mance",
  stationRides: 47,
};

// Derived numbers
const electricPct = Math.round((RECAP.electricRides / RECAP.rides) * 100); // 66%
const ridesPerWeek = (RECAP.rides / 52).toFixed(1).replace(".", ","); // "3,6"
const treesEquiv = Math.max(1, Math.round(RECAP.co2Saved / 21)); // ~1 tree ≈ 21kg CO₂ / yr → 4

const SEASON_BARS = [
  { month: "Avr", value: 12 },
  { month: "Mai", value: 28 },
  { month: "Juin", value: 35 },
  { month: "Juil", value: 47, highlight: true },
  { month: "Août", value: 41 },
  { month: "Sep", value: 32 },
  { month: "Oct", value: 18 },
  { month: "Nov", value: 8 },
];
const SEASON_BAR_MAX = 47;

// ---------------------------------------------------------------------------
// Rider profiles — French titles + templated French descriptions
// ---------------------------------------------------------------------------
const PROFILES = {
  regular: {
    title: "L'ABONNÉ FIDÈLE",
    desc: (d) => `${d.rides} trajets cette année — l'abonnement, c'est votre deuxième maison. Le ${d.neighborhood}, votre point de départ habituel.`,
    shareDesc: "Toujours là, toujours prêt. Le BIXI fait partie de votre routine.",
  },
  electric: {
    title: "L'ÉLECTRO",
    desc: (d) => `${d.electricRides} trajets sur ${d.rides} à l'électrique. Vous avez choisi la puissance silencieuse, et le ${d.neighborhood} en a profité.`,
    shareDesc: "124 trajets électriques. La puissance silencieuse vous a conquis.",
  },
  explorer: {
    title: "L'EXPLORATEUR",
    desc: (d) => `${d.stationsUsed} stations découvertes, ${d.km} km au compteur. Montréal n'a plus de secrets pour vous.`,
    shareDesc: "Chaque trajet, un nouveau quartier. Montréal n'a plus de secrets pour vous.",
  },
  bixiste: {
    title: "LE BIXISTE",
    desc: (d) =>
      `Un vrai du ${d.neighborhood}. ${d.rides} trajets, dont ${d.electricRides} en électrique, et ${d.km} km au compteur. ${d.bestMonth} a été votre mois le plus actif.`,
    shareDesc: "187 trajets. Vous n'avez pas besoin d'explication.",
  },
  speedster: {
    title: "LE SPEEDSTER",
    desc: (d) => `${d.minutesSaved} minutes gagnées sur la route. Vous ne perdez pas de temps — ${d.rides} trajets, toujours l'œil sur l'horloge.`,
    shareDesc: "Vite, efficace, sans détour. Le chrono ne ment pas.",
  },
};

const PROFILE = PROFILES[RECAP.style];

const SHARE_URL = "https://bixi.com";
const SHARE_FILENAME = "votre-2026-en-bixi.png";

// ---------------------------------------------------------------------------
// Share / export helpers (unchanged plumbing from the original prototype)
// ---------------------------------------------------------------------------
const downloadPngBlob = (blob, filename = SHARE_FILENAME) => {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

function measureCaptureSubtreeSize(root) {
  const rootRect = root.getBoundingClientRect();
  let maxRight = rootRect.right;
  let maxBottom = rootRect.bottom;
  const nodes = root.querySelectorAll("*");
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const r = node.getBoundingClientRect();
    const st = getComputedStyle(node);
    const mr = parseFloat(st.marginRight) || 0;
    const mb = parseFloat(st.marginBottom) || 0;
    maxRight = Math.max(maxRight, r.right + mr);
    maxBottom = Math.max(maxBottom, r.bottom + mb);
  }
  const w = Math.max(Math.ceil(maxRight - rootRect.left), 1);
  const h = Math.max(Math.ceil(maxBottom - rootRect.top), 1);
  return { width: w, height: h };
}

async function whenImagesReady(container) {
  const imgs = [...container.querySelectorAll("img")];
  await Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    })
  );
}

// ---------------------------------------------------------------------------
// Animated count-up — reruns on mount (slides remount per navigation)
// ---------------------------------------------------------------------------
function CountUp({ end, duration = 1200, style }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(end * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [end, duration]);
  return <span style={style}>{val.toLocaleString("fr-CA")}</span>;
}

// ---------------------------------------------------------------------------
// Decorative pieces
// ---------------------------------------------------------------------------
const Grain = ({ opacity = 0.04 }) => (
  <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity, pointerEvents: "none", mixBlendMode: "overlay", zIndex: 10 }}>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
    <rect width="100%" height="100%" filter="url(#grain)" />
  </svg>
);

// Slowly drifting oversized ghost number in the background
const GhostNumber = ({ value, color, style }) => (
  <div
    aria-hidden
    style={{
      position: "absolute",
      zIndex: 1,
      pointerEvents: "none",
      fontFamily: HEAD,
      fontWeight: 700,
      lineHeight: 0.8,
      letterSpacing: -8,
      color,
      animation: "drift 16s ease-in-out infinite",
      ...style,
    }}
  >
    {value}
  </div>
);

// Breathing background blob (subtle scale pulse)
const BreathingBlob = ({ color, size = 320, style, duration = 9 }) => (
  <div
    aria-hidden
    style={{
      position: "absolute",
      zIndex: 1,
      pointerEvents: "none",
      width: size,
      height: size,
      borderRadius: "50%",
      background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
      animation: `breathe ${duration}s ease-in-out infinite`,
      ...style,
    }}
  />
);

// Simple rounded BIXI-style bike icon
const BikeIcon = ({ size = 44, color = RED }) => (
  <svg width={size} height={size * 0.72} viewBox="0 0 50 36" fill="none">
    <circle cx="11" cy="26" r="8" stroke={color} strokeWidth="3.4" />
    <circle cx="39" cy="26" r="8" stroke={color} strokeWidth="3.4" />
    <path d="M11 26 L21 26 L28 13 L19 13" stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 26 L28 13" stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M28 13 L39 26" stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 13 L17 9 L22 9" stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="21" cy="26" r="2.6" fill={color} />
  </svg>
);

const BoltIcon = ({ size = 40, color = RED }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M13 2 L4 14 h6 l-1 8 9 -12 h-6 z" strokeLinejoin="round" />
  </svg>
);

const STATION_PHOTO_URL = "/station-mont-royal.jpg";
const PERSONA_HERO_URL = "/persona-hero.png";

const favoriteStationShareLabel = (station) =>
  station.replace(/^Station\s+/, "").replace("Avenue", "Ave");

const favoriteStationDisplayLabel = (station) =>
  station.replace(/^Station\s+/, "");

const flyIn = (delay) => ({ animation: `flyInRight 0.6s ${delay}s cubic-bezier(.2,.8,.2,1) both` });
const riseIn = (delay) => ({ animation: `riseIn 0.6s ${delay}s cubic-bezier(.2,.8,.2,1) both` });

const StationPhotoCard = ({ height = 320, style }) => (
  <div style={{
    position: "relative",
    height,
    borderRadius: 20,
    overflow: "hidden",
    border: `1px solid ${BORDER}`,
    ...flyIn(0.35),
    ...style,
  }}>
    <img
      crossOrigin="anonymous"
      src={STATION_PHOTO_URL}
      alt=""
      decoding="async"
      style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center bottom", display: "block" }}
    />
  </div>
);

const SPONSOR = "SPONSOR";

const BixiLogo = ({ width = 120, bg = WHITE, style }) => (
  <img
    src={bg === RED ? "/bixi-logo-white.png" : "/bixi-logo.png"}
    alt="BIXI"
    width={width}
    style={{ display: "block", height: "auto", ...style }}
  />
);

// Persistent logo at top of interior slides — red on light backgrounds, white on red
const SlideTopLogo = ({ bg }) => <BixiLogo width={88} bg={bg} />;

const SponsorIntro = () => (
  <div style={{ alignSelf: "center", textAlign: "center", background: GRAY, borderRadius: 16, padding: "20px 40px", border: `1px solid ${BORDER}`, ...riseIn(0.28) }}>
    <div style={{ fontFamily: BODY, fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", color: "#888888", marginBottom: 8 }}>
      Présenté par
    </div>
    <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 24, color: "#333333", lineHeight: 1, letterSpacing: 1 }}>
      {SPONSOR}
    </div>
  </div>
);

const SponsorHeaderCorner = ({ bg }) => {
  const onLight = bg === WHITE;
  const labelColor = onLight ? "#888888" : "rgba(255,255,255,0.65)";
  const nameColor = onLight ? "#333333" : "rgba(255,255,255,0.9)";
  return (
    <span style={{ fontFamily: BODY, fontSize: 12, color: labelColor, letterSpacing: 0.4, whiteSpace: "nowrap" }}>
      Présenté par <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 12, color: nameColor }}>{SPONSOR}</span>
    </span>
  );
};

const PROMO_CODE = "HIVER2027";

const GiftRewardIcon = () => (
  <svg
    width="52"
    height="52"
    viewBox="0 0 52 52"
    fill="none"
    aria-hidden
    style={{ display: "block", animation: "giftBounce 0.6s ease both" }}
  >
    <path d="M26 3v10M26 39v10M3 26h10M39 26h10" stroke={RED} strokeWidth="2.5" strokeLinecap="round" />
    <path d="M9 9l7 7M36 36l7 7M9 43l7-7M36 16l7-7" stroke={RED} strokeWidth="2" strokeLinecap="round" opacity="0.85" />
    <circle cx="26" cy="26" r="7" fill={RED} />
    <path d="M26 21c-1.8-2.5-5.5-2.8-5.5 0.2 0 2.2 3.2 3.2 5.5 3.8 2.3-0.6 5.5-1.6 5.5-3.8 0-3-3.7-2.7-5.5-0.2z" fill={WHITE} opacity="0.35" />
    <path d="M22 24h8M26 24v6" stroke={WHITE} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
  </svg>
);

const CopyIcon = ({ size = 18, color = RED }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const GiftCardSnowflake = () => (
  <svg
    width="64"
    height="64"
    viewBox="0 0 96 96"
    fill="none"
    aria-hidden
    style={{
      position: "absolute",
      top: 2,
      right: 2,
      opacity: 0.1,
      pointerEvents: "none",
    }}
  >
    <g stroke={WHITE} strokeWidth="2.2" strokeLinecap="round">
      <line x1="48" y1="10" x2="48" y2="86" />
      <line x1="10" y1="48" x2="86" y2="48" />
      <line x1="21" y1="21" x2="75" y2="75" />
      <line x1="75" y1="21" x2="21" y2="75" />
      <line x1="48" y1="18" x2="40" y2="28" />
      <line x1="48" y1="18" x2="56" y2="28" />
      <line x1="48" y1="78" x2="40" y2="68" />
      <line x1="48" y1="78" x2="56" y2="68" />
      <line x1="18" y1="48" x2="28" y2="40" />
      <line x1="18" y1="48" x2="28" y2="56" />
      <line x1="78" y1="48" x2="68" y2="40" />
      <line x1="78" y1="48" x2="68" y2="56" />
    </g>
    <circle cx="48" cy="48" r="3.5" fill={WHITE} />
  </svg>
);

const MerciPromoCard = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(PROMO_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{
      position: "relative",
      width: "100%",
      borderRadius: 20,
      padding: "18px 20px",
      marginTop: 16,
      textAlign: "center",
      background: "linear-gradient(145deg, #EE3124 0%, #C0392B 100%)",
      overflow: "hidden",
      ...riseIn(0.2),
    }}>
      <GiftCardSnowflake />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{
          fontFamily: HEAD,
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: WHITE,
          opacity: 0.8,
          lineHeight: 1,
        }}>
          Un cadeau pour vous
        </div>
        <div style={{
          fontFamily: HEAD,
          fontWeight: 900,
          fontSize: 48,
          color: WHITE,
          lineHeight: 0.9,
          letterSpacing: -2,
          marginTop: 10,
        }}>
          10%
        </div>
        <div style={{
          fontFamily: HEAD,
          fontWeight: 400,
          fontSize: 16,
          color: WHITE,
          lineHeight: 1.35,
          marginTop: 8,
          maxWidth: 260,
          marginLeft: "auto",
          marginRight: "auto",
        }}>
          de rabais sur votre abonnement{" "}
          <span style={{ fontWeight: 700 }}>Hiver 2027</span>
        </div>
        <div style={{
          height: 1,
          background: WHITE,
          opacity: 0.3,
          margin: "12px 0 10px",
        }} />
        <div style={{
          fontFamily: HEAD,
          fontWeight: 700,
          fontSize: 9,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: WHITE,
          opacity: 0.6,
          lineHeight: 1,
        }}>
          Votre code
        </div>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          marginTop: 4,
        }}>
          <span style={{
            fontFamily: HEAD,
            fontWeight: 700,
            fontSize: 18,
            color: WHITE,
            letterSpacing: 1.5,
            lineHeight: 1,
          }}>
            {PROMO_CODE}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Code copié" : "Copier le code promo"}
            style={{
              position: "relative",
              zIndex: 30,
              background: "transparent",
              border: "none",
              padding: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 24,
            }}
          >
            {copied ? (
              <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 500, color: WHITE, whiteSpace: "nowrap", opacity: 0.9 }}>
                Copié!
              </span>
            ) : (
              <CopyIcon size={16} color={WHITE} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const PartagerButton = ({ onClick, loading, hidden }) => {
  if (hidden) return null;
  return (
    <button type="button" disabled={loading} onClick={onClick} style={{
      width: "100%", background: RED, color: WHITE,
      border: "none", borderRadius: 999, padding: "14px 16px",
      fontFamily: HEAD, fontWeight: 600, fontSize: 16, letterSpacing: 0.2,
      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      flexShrink: 0,
    }}>
      {loading ? (
        <svg width="20" height="20" viewBox="0 0 100 100" fill="none" style={{ animation: "spin 0.85s linear infinite" }}>
          <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="10" strokeDasharray="66 200" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      )}
      Partager
    </button>
  );
};

// Slide stat typography — label tightly coupled to hero number
const StatContextLabel = ({ children, dark, accent, style }) => (
  <div style={{
    fontFamily: HEAD,
    fontWeight: 700,
    fontSize: 17,
    letterSpacing: 0.1,
    lineHeight: 1.25,
    color: accent ? RED : (dark ? WHITE : BLACK),
    marginBottom: 6,
    ...style,
  }}>{children}</div>
);

const StatUnit = ({ children, dark, accent, size = 40, style }) => (
  <span style={{
    fontFamily: HEAD,
    fontWeight: 700,
    fontSize: size,
    color: accent ? RED : (dark ? "rgba(255,255,255,0.92)" : RED),
    lineHeight: 1,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    ...style,
  }}>{children}</span>
);

const StatCaption = ({ children, dark, style }) => (
  <div style={{
    fontFamily: HEAD,
    fontWeight: 700,
    fontSize: 17,
    color: dark ? "rgba(255,255,255,0.95)" : BLACK,
    lineHeight: 1.25,
    marginTop: 6,
    ...style,
  }}>{children}</div>
);

const StatInsightCard = ({ story, stat, dark = true, delay = 0.5, style, reverse = true, cardBg, lightText }) => {
  const topText = reverse ? stat : story;
  const bottomText = reverse ? story : stat;
  const textOnDark = lightText ?? dark;
  const lineStyle = {
    fontFamily: BODY,
    fontSize: 14,
    color: textOnDark ? WHITE : BLACK,
    lineHeight: 1.5,
  };
  return (
  <div style={{
    marginTop: 20,
    background: cardBg ?? (dark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.06)"),
    borderRadius: 12,
    padding: 16,
    ...flyIn(delay),
    ...style,
  }}>
    <div style={{ ...lineStyle, fontWeight: reverse ? 700 : 400 }}>
      {topText}
    </div>
    <div style={{
      height: 1,
      background: textOnDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.12)",
      margin: "12px 0",
    }} />
    <div style={{ ...lineStyle, fontWeight: reverse ? 400 : 700 }}>
      {bottomText}
    </div>
  </div>
  );
};

const SlideTopSpacer = () => <div style={{ height: 48, flexShrink: 0 }} />;

const SeasonBarChart = ({ style }) => {
  const barMaxHeight = 88;
  return (
    <div style={{ width: "100%", padding: "0 16px", marginTop: 20, height: 120, ...flyIn(0.45), ...style }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 3, height: "100%" }}>
        {SEASON_BARS.map(({ month, value, highlight }) => (
          <div
            key={month}
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              height: "100%",
            }}
          >
            <div style={{
              width: "100%",
              maxWidth: 28,
              height: Math.max(4, (value / SEASON_BAR_MAX) * barMaxHeight),
              background: highlight ? RED : "rgba(255,255,255,0.25)",
              borderRadius: "3px 3px 0 0",
              flexShrink: 0,
            }} />
            <span style={{
              fontFamily: BODY,
              fontSize: 9,
              color: WHITE,
              textTransform: "uppercase",
              marginTop: 6,
              letterSpacing: 0.2,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}>
              {month}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const SwipeHintChevron = ({ onColoredBg }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke={onColoredBg ? "rgba(255,255,255,0.85)" : "#333333"}
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    style={{
      flexShrink: 0,
      display: "block",
      animation: "edgeChevronNudge 1.2s ease-in-out infinite",
    }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const IntroSwipeRow = () => (
  <div style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 18,
    paddingRight: 2,
    ...riseIn(0.34),
  }}>
    <span style={{
      fontFamily: HEAD,
      fontWeight: 700,
      fontSize: 16,
      color: "#333333",
      letterSpacing: 0.2,
      lineHeight: 1,
      display: "flex",
      alignItems: "center",
      height: 22,
    }}>
      Tapez à droite pour commencer
    </span>
    <SwipeHintChevron onColoredBg={false} />
  </div>
);

const ShareForwardButton = ({ onClick, onColoredBg = false }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 8,
      background: "transparent",
      border: "none",
      padding: "8px 4px",
      cursor: "pointer",
    }}
  >
    <span style={{
      fontFamily: HEAD,
      fontWeight: 700,
      fontSize: 16,
      color: onColoredBg ? "rgba(255,255,255,0.95)" : "#333333",
      letterSpacing: 0.2,
      lineHeight: 1,
      textAlign: "right",
    }}>
      Partager mon récap BIXI
    </span>
    <SwipeHintChevron onColoredBg={onColoredBg} />
  </button>
);

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------
const slides = (d, shareCaptureActive, shareUi = {}) => [
  // 0 — INTRO
  {
    bg: WHITE,
    dark: false,
    render: () => (
      <>
        <BreathingBlob color="rgba(238,49,36,0.22)" size={400} style={{ top: -70, right: -90 }} />
        <div aria-hidden style={{
          position: "absolute", top: 0, right: 0, width: "75%", height: "60%", zIndex: 1, pointerEvents: "none",
          background: "radial-gradient(ellipse at 100% 0%, rgba(238,49,36,0.18) 0%, rgba(238,49,36,0.06) 42%, transparent 72%)",
        }} />
        <BreathingBlob color="rgba(238,49,36,0.10)" size={300} style={{ bottom: -100, left: -110 }} duration={11} />
        <Grain opacity={0.03} />
        <GhostNumber value="2026" color="rgba(238,49,36,0.06)" style={{ fontSize: 168, bottom: 36, left: 0, right: 0, width: "100%", textAlign: "center", letterSpacing: -4 }} />
        <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ marginTop: 8 }}>
            <BixiLogo width={120} bg={WHITE} />
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: 12, paddingBottom: 8 }}>
            <div style={{ ...riseIn(0.1) }}>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 64, color: BLACK, lineHeight: 0.95, letterSpacing: -1.5 }}>
                Votre été
              </div>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 64, color: RED, lineHeight: 0.95, letterSpacing: -1.5 }}>
                à vélo.
              </div>
              <div style={{
                fontFamily: BODY,
                fontWeight: 500,
                fontSize: 17,
                color: "#555555",
                marginTop: 20,
                lineHeight: 1.45,
                maxWidth: 280,
              }}>
                Découvrez le récap de votre saison BIXI 2026
              </div>
              <div style={{ marginTop: 28, display: "flex", justifyContent: "center" }}>
                <SponsorIntro />
              </div>
            </div>
          </div>
          <div style={{ flexShrink: 0, marginBottom: 4 }}>
            <IntroSwipeRow />
          </div>
        </div>
      </>
    ),
  },

  // 1 — RIDES
  {
    bg: RED,
    dark: true,
    render: () => (
      <>
        <GhostNumber value={d.rides} color="rgba(0,0,0,0.12)" style={{ fontSize: 300, top: "50%", right: -30, transform: "translateY(-50%)" }} />
        <BreathingBlob color="rgba(255,255,255,0.10)" size={320} style={{ bottom: -120, left: -100 }} />
        <Grain opacity={0.05} />
        <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
          <SlideTopSpacer />
          <div>
            <CountUp end={d.rides} style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 158, color: WHITE, lineHeight: 0.8, letterSpacing: -6, display: "block" }} />
            <StatCaption dark>trajets effectués cette saison</StatCaption>
            <StatInsightCard
              dark
              stat={`Soit ${ridesPerWeek} trajets par semaine en moyenne.`}
              story="Vous avez pédalé plus que 94% des Bixistes de Montréal!"
            />
          </div>
          <div style={{ height: 4 }} />
        </div>
      </>
    ),
  },

  // 2 — BEST MONTH
  {
    bg: BLACK,
    dark: true,
    render: () => (
      <>
        <GhostNumber value={d.bestMonth} color="rgba(238,49,36,0.10)" style={{ fontSize: 180, top: "44%", left: 0, right: 0, textAlign: "center", letterSpacing: 4, transform: "translateY(-50%)" }} />
        <BreathingBlob color="rgba(238,49,36,0.22)" size={340} style={{ top: -120, right: -120 }} />
        <Grain opacity={0.06} />
        <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
          <SlideTopSpacer />
          <SeasonBarChart style={{ marginTop: 8, marginBottom: 24 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", paddingBottom: 60 }}>
            <div style={{ ...riseIn(0.1) }}>
              <StatContextLabel dark style={{ marginBottom: 8, textAlign: "center" }}>
                Votre mois le plus actif
              </StatContextLabel>
              <div style={{
                fontFamily: HEAD,
                fontWeight: 800,
                fontSize: 64,
                color: RED,
                lineHeight: 0.9,
                letterSpacing: -2,
              }}>
                {d.bestMonth}
              </div>
              <div style={{
                fontFamily: HEAD,
                fontWeight: 700,
                fontSize: 18,
                color: WHITE,
                lineHeight: 1.25,
                marginTop: 12,
              }}>
                {d.bestMonthRides} trajets
              </div>
            </div>
          </div>
        </div>
      </>
    ),
  },

  // 3 — KM + NEIGHBOURHOOD + STATIONS
  {
    bg: WHITE,
    dark: false,
    render: () => (
      <>
        <GhostNumber value={d.km} color="rgba(238,49,36,0.06)" style={{ fontSize: 260, top: "34%", right: -40 }} />
        <BreathingBlob color="rgba(238,49,36,0.10)" size={300} style={{ bottom: -110, left: -110 }} duration={10} />
        <Grain opacity={0.03} />
        <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
          <SlideTopSpacer />
          <div>
            <StatContextLabel dark={false}>Distance parcourue</StatContextLabel>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
              <CountUp end={d.km} style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 128, color: BLACK, lineHeight: 0.8, letterSpacing: -5 }} />
              <StatUnit dark={false} size={40} style={{ marginTop: 18 }}>KM</StatUnit>
            </div>
            <StatInsightCard
              dark={false}
              stat="De quoi traverser l'île de Montréal 18 fois!"
              story="On vous voit. Vous êtes dans le Top 1 000."
            />
          </div>
          <div style={{ height: 4 }} />
        </div>
      </>
    ),
  },

  // 4 — FAVORITE STATION
  {
    bg: WHITE,
    dark: false,
    render: () => (
      <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", height: "100%" }}>
        <SlideTopSpacer />
        <StatContextLabel dark={false}>Votre station préférée</StatContextLabel>
        <div style={{
          fontFamily: HEAD,
          fontWeight: 700,
          fontSize: 28,
          color: BLACK,
          lineHeight: 1.15,
          letterSpacing: -0.3,
          marginTop: 6,
          ...riseIn(0.1),
        }}>
          {favoriteStationDisplayLabel(d.favoriteStation)}
        </div>
        <div style={{
          fontFamily: BODY,
          fontSize: 14,
          fontWeight: 400,
          color: LABEL_GRAY,
          lineHeight: 1.45,
          marginTop: 8,
          ...riseIn(0.18),
        }}>
          {d.stationRides} départs depuis cette station
        </div>
        <StationPhotoCard height={320} style={{ marginTop: 16, flexShrink: 0 }} />
      </div>
    ),
  },

  // 5 — ELECTRIC RIDES
  {
    bg: BLACK,
    dark: true,
    render: () => (
      <>
        <GhostNumber value={d.electricRides} color="rgba(238,49,36,0.10)" style={{ fontSize: 300, top: "50%", left: -20, transform: "translateY(-50%)" }} />
        <BreathingBlob color="rgba(238,49,36,0.22)" size={340} style={{ top: -120, right: -120 }} />
        <Grain opacity={0.06} />
        <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
          <SlideTopSpacer />
          <div>
            <StatContextLabel dark accent>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <BoltIcon size={22} color={RED} />
                Vous avez choisi l&apos;électrique
              </span>
            </StatContextLabel>
            <CountUp end={d.electricRides} style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 158, color: RED, lineHeight: 0.8, letterSpacing: -6, display: "block" }} />
            <StatCaption dark>trajets en vélo électrique</StatCaption>
            <StatInsightCard
              dark
              story="L'électrique, c'est votre nouvelle norme."
              stat={`C'est ${electricPct}% de vos ${d.rides} trajets!`}
            />
          </div>
          <div style={{ height: 4 }} />
        </div>
      </>
    ),
  },

  // 6 — CO2 SAVED
  {
    bg: RED,
    dark: true,
    render: () => (
      <>
        <GhostNumber value={d.co2Saved} color="rgba(0,0,0,0.12)" style={{ fontSize: 300, top: "50%", right: -10, transform: "translateY(-50%)" }} />
        <BreathingBlob color="rgba(255,255,255,0.10)" size={320} style={{ top: -120, left: -110 }} />
        <Grain opacity={0.05} />
        <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
          <SlideTopSpacer />
          <div>
            <StatContextLabel dark>CO₂ évité vs. la voiture</StatContextLabel>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
              <CountUp end={d.co2Saved} style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 148, color: WHITE, lineHeight: 0.8, letterSpacing: -5 }} />
              <StatUnit dark size={42} style={{ marginTop: 20, color: "rgba(255,255,255,0.92)" }}>KG</StatUnit>
            </div>
            <StatInsightCard
              dark
              story="Chaque trajet compte. Le vôtre aussi."
              stat={(
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    {Array.from({ length: treesEquiv }).map((_, i) => (
                      <span key={i} style={{ fontSize: 22 }}>🌳</span>
                    ))}
                  </div>
                  {`Équivalent à ${treesEquiv} arbres plantés`}
                </>
              )}
            />
          </div>
          <div style={{ height: 4 }} />
        </div>
      </>
    ),
  },

  // 7 — PROFILE IDENTITY
  {
    bg: BLACK,
    dark: true,
    render: () => (
      <div style={{
        position: "relative",
        margin: "-36px -30px -60px",
        width: "calc(100% + 60px)",
        height: "calc(100% + 96px)",
      }}>
        <img
          src={PERSONA_HERO_URL}
          alt=""
          decoding="async"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
        />
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.72) 100%)",
          pointerEvents: "none",
        }} />
        <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "36px 30px 60px" }}>
          <SlideTopSpacer />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <StatContextLabel dark style={{ marginBottom: 8 }}>Votre profil 2026</StatContextLabel>
            <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: PROFILE.title.length > 14 ? 40 : PROFILE.title.length > 12 ? 46 : 56, color: WHITE, lineHeight: 0.92, letterSpacing: -1, textTransform: "uppercase", ...riseIn(0.12) }}>
              {PROFILE.title}
            </div>
            <div style={{ background: "rgba(10,10,10,0.72)", borderRadius: 16, padding: "18px 20px", marginTop: 18, width: "100%", textAlign: "left", ...flyIn(0.3) }}>
              <p style={{ fontFamily: BODY, fontSize: 14, color: WHITE, lineHeight: 1.65, fontWeight: 400, margin: 0 }}>
                {PROFILE.desc(d)}
              </p>
            </div>
          </div>
          <div style={{ height: 4 }} />
        </div>
      </div>
    ),
  },

  // 8 — MERCI
  {
    bg: WHITE,
    dark: false,
    render: () => (
      <div style={{
        position: "relative",
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}>
        <SlideTopSpacer />
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          paddingBottom: 96,
          paddingTop: 4,
          minHeight: 0,
        }}>
          <GiftRewardIcon />
          <div style={{
            fontFamily: HEAD,
            fontWeight: 800,
            fontSize: 42,
            color: BLACK,
            lineHeight: 1,
            letterSpacing: -0.5,
            marginTop: 12,
            ...riseIn(0.08),
          }}>
            Merci,
          </div>
          <div style={{
            fontFamily: HEAD,
            fontWeight: 400,
            fontSize: 17,
            color: "#666666",
            lineHeight: 1.35,
            marginTop: 8,
            maxWidth: 280,
            ...riseIn(0.14),
          }}>
            Pour vous remercier de votre fidélité,
          </div>
          <MerciPromoCard />
        </div>
      </div>
    ),
  },

  // 9 — SHARE CARD (clean white BIXI communication style)
  {
    bg: WHITE,
    dark: false,
    render: () => (
      <div style={{ position: "relative", minHeight: "100%", width: "100%", background: WHITE }}>
        <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", minHeight: "100%", gap: 8, overflow: shareCaptureActive ? "visible" : "hidden" }}>
          {/* Header */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 10, marginBottom: 2, borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, minWidth: 0 }}>
                <BixiLogo width={78} bg={WHITE} style={{ flexShrink: 0 }} />
                <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 17, color: BLACK, lineHeight: 1.1, letterSpacing: -0.2 }}>
                  Votre saison 2026
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: BODY, fontSize: 10, color: LABEL_GRAY, letterSpacing: 1.2, textTransform: "uppercase", lineHeight: 1.2 }}>
                  Présenté par
                </div>
                <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 13, color: "#333333", letterSpacing: 0.3, marginTop: 4, lineHeight: 1 }}>
                  {SPONSOR}
                </div>
              </div>
            </div>
          </div>

          {/* Profile */}
          <div style={{ position: "relative", background: WHITE, borderRadius: 12, padding: "10px 14px", border: `1px solid ${BORDER}` }}>
            <div style={{
              position: "absolute", top: 8, right: 10,
              fontFamily: BODY, fontSize: 9, color: LABEL_GRAY, textTransform: "uppercase", letterSpacing: 1.2,
              background: GRAY, borderRadius: 20, padding: "4px 8px", lineHeight: 1,
            }}>
              Votre profil
            </div>
            <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 22, color: BLACK, lineHeight: 1.05, paddingRight: 72 }}>{PROFILE.title}</div>
            <p style={{ fontFamily: BODY, fontSize: 12, color: LABEL_GRAY, lineHeight: 1.45, margin: 0, marginTop: 6 }}>
              {PROFILE.shareDesc}
            </p>
          </div>

          {/* Stats grid — 2x2 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: GRAY, borderRadius: 12, padding: 8, border: `1px solid ${BORDER}` }}>
            {[
              { val: d.rides, lbl: "Trajets" },
              { val: `${d.km}`, lbl: "Kilomètres" },
              { val: `${Math.round(d.ridingMinutes / 60)}h`, lbl: "Heures à vélo" },
              { val: `${d.co2Saved}kg`, lbl: "CO₂ économisé" },
            ].map((s, i) => (
              <div key={i} style={{ background: WHITE, padding: "8px 8px", borderRadius: 10, border: `1px solid ${BORDER}` }}>
                <div style={{ fontFamily: HEAD, fontWeight: 600, fontSize: 32, color: RED, lineHeight: 1, letterSpacing: -0.5 }}>{typeof s.val === "number" ? s.val.toLocaleString("fr-CA") : s.val}</div>
                <div style={{ fontFamily: BODY, fontSize: 10, color: LABEL_GRAY, letterSpacing: 0.3, marginTop: 6 }}>{s.lbl}</div>
              </div>
            ))}
          </div>

          {/* Favorite station — street photo */}
          <div style={{ position: "relative", height: 120, borderRadius: 16, overflow: "hidden", border: `1px solid ${BORDER}` }}>
            <img
              crossOrigin="anonymous"
              src={STATION_PHOTO_URL}
              alt=""
              decoding="async"
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center bottom", display: "block" }}
            />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 15%, rgba(10,10,10,0.55) 55%, rgba(10,10,10,0.92) 100%)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: 12, left: 12, right: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%", background: RED, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              }}>
                <BikeIcon size={22} color={WHITE} />
              </div>
              <div>
                <div style={{ fontFamily: BODY, fontSize: 9, color: WHITE, opacity: 0.7, textTransform: "uppercase", letterSpacing: 1.5, lineHeight: 1, marginBottom: 3 }}>
                  Station préférée
                </div>
                <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: WHITE, lineHeight: 1.15 }}>
                  {favoriteStationShareLabel(d.favoriteStation)}
                </div>
              </div>
            </div>
          </div>

          {/* Closing message + share */}
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8, alignItems: "center", textAlign: "center" }}>
            <div style={{ fontFamily: HEAD, fontStyle: "italic", fontWeight: 600, fontSize: 17, color: "rgba(10,10,10,0.65)", lineHeight: 1.3 }}>
              À la prochaine saison, Bixiste!
            </div>
            <PartagerButton
              onClick={shareUi.onShare}
              loading={shareUi.shareLoading}
              hidden={shareCaptureActive}
            />
          </div>
        </div>
      </div>
    ),
  },
];

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const [dir, setDir] = useState(1);
  const touchStart = useRef(null);
  const shareCardRef = useRef(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [copyToast, setCopyToast] = useState("");
  const [shareCaptureActive, setShareCaptureActive] = useState(false);

  const handleShare = async () => {
    const el = shareCardRef.current;
    if (!el || shareLoading) return;

    const title = "Votre saison BIXI 2026";
    const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 2));

    setShareLoading(true);
    try {
      flushSync(() => setShareCaptureActive(true));
      await new Promise((r) => setTimeout(r, 220));
      if (document.fonts?.ready) {
        try { await document.fonts.ready; } catch (_) { /* ignore */ }
      }
      await whenImagesReady(el);

      const { width: capW, height: capH } = measureCaptureSubtreeSize(el);
      const canvas = await html2canvas(el, {
        useCORS: true,
        allowTaint: false,
        scale,
        width: capW,
        height: capH,
        backgroundColor: WHITE,
        logging: false,
      });
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png");
      });
      const file = new File([blob], SHARE_FILENAME, { type: "image/png" });

      const tryCopyLink = async (message = "Lien copié") => {
        try {
          await navigator.clipboard.writeText(SHARE_URL);
          setCopyToast(message);
          setTimeout(() => setCopyToast(""), 2200);
        } catch (e) { console.error(e); }
      };

      if (!navigator.share) {
        downloadPngBlob(blob);
        await tryCopyLink("Enregistré · lien copié");
        return;
      }

      const canShareFiles = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
      if (canShareFiles) {
        try {
          await navigator.share({ title, text: title, url: SHARE_URL, files: [file] });
        } catch (e) {
          if (e?.name === "AbortError") return;
          downloadPngBlob(blob);
          await tryCopyLink("Enregistré · lien copié");
        }
        return;
      }

      downloadPngBlob(blob);
      await tryCopyLink("Enregistré · lien copié");
    } catch (e) {
      console.error(e);
    } finally {
      flushSync(() => setShareCaptureActive(false));
      setShareLoading(false);
    }
  };

  const allSlides = slides(RECAP, shareCaptureActive, { onShare: handleShare, shareLoading });
  const current = allSlides[idx];
  const isLast = idx === allSlides.length - 1;
  const isMerciSlide = idx === allSlides.length - 2;

  const goTo = (nextIdx) => {
    if (nextIdx < 0 || nextIdx >= allSlides.length) return;
    setDir(nextIdx > idx ? 1 : -1);
    setVisible(false);
    setTimeout(() => {
      setIdx(nextIdx);
      setVisible(true);
    }, 160);
  };

  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = touchStart.current.x - t.clientX;
    const dy = touchStart.current.y - t.clientY;
    touchStart.current = null;
    if (Math.abs(dx) < 40) return;
    if (Math.abs(dx) <= Math.abs(dy)) return;
    goTo(dx > 0 ? idx + 1 : idx - 1);
  };

  const onColoredBg = current.bg === RED || current.bg === BLACK;

  return (
    <div style={{ minHeight: "100vh", background: "#060606", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=Inter:wght@400;500&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes drift {
          0%   { transform: translate(0,0) rotate(0deg); }
          50%  { transform: translate(-18px,-26px) rotate(-1deg); }
          100% { transform: translate(0,0) rotate(0deg); }
        }
        @keyframes breathe {
          0%,100% { transform: scale(1); }
          50%     { transform: scale(1.14); }
        }
        @keyframes flyInRight {
          from { opacity:0; transform: translateX(44px); }
          to   { opacity:1; transform: translateX(0); }
        }
        @keyframes riseIn {
          from { opacity:0; transform: translateY(22px); }
          to   { opacity:1; transform: translateY(0); }
        }
        @keyframes giftBounce {
          0%   { transform: scale(0); opacity: 0; }
          70%  { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes edgeChevronNudge {
          0%, 100% { transform: translateX(0); }
          50%      { transform: translateX(6px); }
        }
        button{cursor:pointer;border:none;transition:opacity .15s,transform .1s}
        button:hover:not(:disabled){opacity:.9} button:active:not(:disabled){transform:scale(.98)}
        button:disabled{opacity:.75;cursor:wait}
      `}</style>

      <div style={{ width: "100%", maxWidth: 390 }}>
        <div>
          <div
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            style={{
              borderRadius: 28,
              overflow: isLast && shareCaptureActive ? "visible" : "hidden",
              height: 620,
              position: "relative",
              touchAction: "pan-y",
              boxShadow: "0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
              background: current.bg,
            }}
          >
            <div
              key={idx}
              ref={isLast ? shareCardRef : undefined}
              style={{
                position: "absolute",
                ...(isLast && shareCaptureActive
                  ? { top: 0, left: 0, right: 0, bottom: "auto", minHeight: "100%", height: "auto" }
                  : { inset: 0 }),
                padding: isLast ? "32px 28px 52px" : "36px 30px 60px",
                background: current.bg,
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : `translateY(${dir * 14}px)`,
                transition: "opacity 0.16s ease, transform 0.16s ease",
                zIndex: 20,
                overflow: isLast && shareCaptureActive ? "visible" : "hidden",
              }}
            >
              {current.render()}
            </div>

            {shareLoading && (
              <div
                aria-live="polite"
                style={{
                  position: "absolute", inset: 0, zIndex: 80, borderRadius: 28,
                  background: "rgba(6,6,6,0.75)", display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 14, padding: 24,
                  textAlign: "center", pointerEvents: "all",
                }}
              >
                <svg width="36" height="36" viewBox="0 0 100 100" fill="none" style={{ animation: "spin 0.85s linear infinite", color: RED }}>
                  <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="10" strokeDasharray="66 200" strokeLinecap="round" />
                </svg>
                <span style={{ fontFamily: HEAD, fontWeight: 600, fontSize: 20, color: WHITE, letterSpacing: 0.5, textTransform: "uppercase" }}>
                  Préparation de votre image…
                </span>
                <span style={{ fontFamily: BODY, fontSize: 12, color: "rgba(255,255,255,0.55)", maxWidth: 260, lineHeight: 1.5 }}>
                  Un instant, on prépare tout pour le partage.
                </span>
              </div>
            )}

            {/* Persistent brand mark on interior slides */}
            {idx > 0 && !isLast && (
              <div style={{ position: "absolute", top: 22, left: 24, right: 24, zIndex: 35, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <SlideTopLogo bg={current.bg} />
                <SponsorHeaderCorner bg={current.bg} />
              </div>
            )}

            {idx > 0 && !isLast && !isMerciSlide && (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  bottom: 72,
                  right: 16,
                  zIndex: 28,
                  pointerEvents: "none",
                }}
              >
                <SwipeHintChevron onColoredBg={onColoredBg} />
              </div>
            )}

            {isMerciSlide && (
              <div style={{
                position: "absolute",
                bottom: 72,
                right: 16,
                zIndex: 32,
              }}>
                <ShareForwardButton
                  onColoredBg={onColoredBg}
                  onClick={() => goTo(allSlides.length - 1)}
                />
              </div>
            )}

            {/* Progress bar */}
            <div style={{ position: "absolute", bottom: 24, left: 30, right: 30, display: "flex", gap: 5, zIndex: 30 }}>
              {allSlides.map((_, i) => {
                const completed = i <= idx;
                const background = onColoredBg
                  ? (completed ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)")
                  : (completed ? RED : "rgba(10,10,10,0.15)");
                return (
                <div key={i} onClick={() => goTo(i)} style={{
                  flex: 1, height: 3, borderRadius: 2, cursor: "pointer",
                  background,
                  transition: "background 0.25s",
                }} />
                );
              })}
            </div>

            {/* Tap zones */}
            <div onClick={() => goTo(idx - 1)} style={{ position: "absolute", left: 0, top: 0, width: "35%", height: "100%", zIndex: 25, cursor: idx > 0 ? "pointer" : "default" }} />
            <div onClick={() => goTo(idx + 1)} style={{ position: "absolute", right: 0, top: 0, width: "35%", height: "100%", zIndex: 25, cursor: idx < allSlides.length - 1 ? "pointer" : "default" }} />
          </div>

          {!isLast && (
          <p style={{ fontFamily: BODY, fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", marginTop: 10 }}>
            Touchez les côtés ou glissez
          </p>
          )}
        </div>
      </div>

      {copyToast && (
        <div role="status" style={{
          position: "fixed", bottom: "max(24px, env(safe-area-inset-bottom))", left: "50%",
          transform: "translateX(-50%)", zIndex: 20000, background: "rgba(40,40,40,0.96)",
          color: WHITE, padding: "10px 22px", borderRadius: 20, fontFamily: BODY,
          fontSize: 14, fontWeight: 400, boxShadow: "0 4px 24px rgba(0,0,0,0.35)", pointerEvents: "none",
        }}>
          {copyToast}
        </div>
      )}
    </div>
  );
}
