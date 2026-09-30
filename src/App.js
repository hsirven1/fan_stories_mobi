import { useState, useRef, useEffect, useLayoutEffect, useMemo, createContext, useContext } from "react";
import { flushSync } from "react-dom";
import { motion, AnimatePresence, animate, useMotionValue, useReducedMotion } from "framer-motion";
import html2canvas from "html2canvas";

// ---------------------------------------------------------------------------
// Brand palette
// ---------------------------------------------------------------------------
const RED = "#EE3124";
const BLACK = "#0A0A0A";
// E-bike accent: used only on the electric slide.
const ELECTRIC_BLUE = "#1F5BD6";
const ELECTRIC_NAVY = "#0B1530";
const WHITE = "#FFFFFF";
const BORDER = "#E0E0E0";
const LABEL_GRAY = "rgba(10,10,10,0.55)";

const HEAD = "'Nunito', sans-serif"; // headlines — closest to BIXI's GT Maru
const BODY = "'Inter', sans-serif"; // body copy
const BRAND = "'Space Grotesk', sans-serif"; // sponsor wordmark only

// ---------------------------------------------------------------------------
// Hardcoded demo data — one rider's 2026 in BIXI
// ---------------------------------------------------------------------------
const RECAP = {
  rides: 187,
  km: 743,
  electricRides: 41,
  co2Saved: 89, // kg
  neighborhood: "Plateau-Mont-Royal",
  bestMonth: "Juillet",
  bestMonthRides: 47,
  style: "quotidien",
  minutesSaved: 2240,
  ridingMinutes: 3975,
  stationsUsed: 34,
  favoriteStation: "Station Parc Jeanne-Mance",
  stationRides: 47,
};

// Derived numbers
const electricPct = Math.round((RECAP.electricRides / RECAP.rides) * 100); // 22%
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
  quotidien: {
    title: "LE BIXISTE DU QUOTIDIEN",
    desc: (d) => `Beau temps, mauvais temps, le BIXI fait partie de votre routine. ${d.rides} trajets, ça ne ment pas.`,
    shareDesc: "Beau temps, mauvais temps, le BIXI fait partie de votre routine.",
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

const SHARE_FILENAME = "votre-2026-en-bixi.png";
const JOIN_CODE = "BIXISTE2026";

// Share images: 9:16, exported at 1080×1920.
const SHARE_IMG_W = 396;
const SHARE_IMG_H = 704;
const SHARE_IMG_PAD_X = 32;
const SHARE_IMG_PAD_TOP = 48;
const SHARE_IMG_PAD_BOTTOM = 32;
const SHARE_IMG_EXPORT_W = 1080;
const JOIN_STRIP_H = 48;
const JOIN_STRIP_GAP = 20;

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
// Story timing — JS-driven animations register their duration so the slide
// knows when its last animation ends (CSS animations are measured directly).
// ---------------------------------------------------------------------------
const SlideTimingContext = createContext(null);

// True inside the hidden copy used for share images: everything renders in its final state.
const StillContext = createContext(false);
function useStill() {
  const reduced = useReducedMotion();
  const still = useContext(StillContext);
  return reduced || still;
}

const STORY_HOLD_AFTER_MS = 2000;
const STORY_FALLBACK_MS = 5000;
const STORY_MANUAL_FILL_S = 0.3;
const HOLD_TO_PAUSE_MS = 200;
const SWIPE_MIN_PX = 40;
const TAP_MAX_MOVE_PX = 12;
const STORY_EASE = [0.2, 0.8, 0.2, 1];

// ---------------------------------------------------------------------------
// Shared count-up — every animated number and its linked visual use this one hook.
// Reruns on mount (slides remount per navigation).
// ---------------------------------------------------------------------------
// Slide entrance: the visual first, then header, number, then label + sentence.
const ENTRANCE_STEP = { visual: 0, header: 1, number: 2, text: 3 };
const ENTRANCE = { stagger: 0.06, duration: 0.32, y: 16, steps: 4 };
const ENTRANCE_END_S = ENTRANCE.stagger * (ENTRANCE.steps - 1) + ENTRANCE.duration;

const COUNT_UP_MS = 2200;
// Count-ups (and the visuals tied to them) start once the entrance has settled.
const COUNT_UP_DELAY_MS = Math.round(ENTRANCE_END_S * 1000);
const easeOutQuart = (p) => 1 - Math.pow(1 - p, 4);

// rAF-driven eased progress (0 → 1), registered with the slide for auto-advance.
function useTween(durationMs, delayMs, ease) {
  const timing = useContext(SlideTimingContext);
  const reduced = useStill();
  const [progress, setProgress] = useState(reduced ? 1 : 0);
  useLayoutEffect(() => {
    if (!reduced) timing?.register(delayMs + durationMs);
  }, [timing, reduced, delayMs, durationMs]);
  useEffect(() => {
    if (reduced) {
      setProgress(1);
      return undefined;
    }
    let raf;
    const start = performance.now() + delayMs;
    const tick = (now) => {
      const p = Math.min(1, Math.max(0, (now - start) / durationMs));
      setProgress(ease(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, delayMs, durationMs, ease]);
  return progress;
}

// Returns the rounded value and the eased progress (0 → 1) that linked visuals should follow.
function useCountUp(end) {
  const progress = useTween(COUNT_UP_MS, COUNT_UP_DELAY_MS, easeOutQuart);
  return { value: Math.round(end * progress), progress };
}

// Tabular digits + a min-width sized to the final value, so nothing shifts while counting.
// `tracking` must match the style's letter-spacing (em) for the width to be exact.
const AnimatedNumber = ({ value, end, style, tracking = -0.045 }) => {
  const chars = end.toLocaleString("fr-CA").length;
  return (
    <span style={{
      display: "inline-block",
      fontVariantNumeric: "tabular-nums",
      minWidth: `calc(${chars}ch + ${chars * tracking}em)`,
      ...style,
    }}>
      {value.toLocaleString("fr-CA")}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Data slide layout — number, visualization, label, sentence; one block, left-aligned.
// ---------------------------------------------------------------------------
const DATA_TONES = {
  white: { number: RED, label: BLACK, sentence: "#666666" },
  red: { number: WHITE, label: WHITE, sentence: "rgba(255,255,255,0.8)" },
  dark: { number: WHITE, label: WHITE, sentence: "rgba(255,255,255,0.7)" },
  electric: { number: ELECTRIC_BLUE, label: WHITE, sentence: "rgba(255,255,255,0.7)" },
};
const DATA_NUMBER_SIZE = 96;
const DATA_NUMBER_TRACKING_PX = -2;

// Entrance step: fade + 16px rise, 60ms apart (see ENTRANCE_STEP).
const EntranceStep = ({ step, style, children, ...rest }) => {
  const reduced = useStill();
  return (
    <motion.div
      {...rest}
      initial={reduced ? false : { opacity: 0, y: ENTRANCE.y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: step * ENTRANCE.stagger, duration: ENTRANCE.duration, ease: [0.22, 1, 0.36, 1] }}
      style={style}
    >
      {children}
    </motion.div>
  );
};

const dataNumberStyle = (color) => ({
  fontFamily: HEAD,
  fontWeight: 900,
  fontSize: DATA_NUMBER_SIZE,
  letterSpacing: DATA_NUMBER_TRACKING_PX,
  lineHeight: 1,
  color,
});

const DataNumber = ({ value, end, unit, color }) => (
  <EntranceStep step={ENTRANCE_STEP.number} style={{ ...dataNumberStyle(color), display: "flex", alignItems: "baseline", gap: 8 }}>
    <AnimatedNumber value={value} end={end} tracking={DATA_NUMBER_TRACKING_PX / DATA_NUMBER_SIZE} />
    {unit && <span style={{ fontSize: Math.round(DATA_NUMBER_SIZE * 0.4), letterSpacing: 0 }}>{unit}</span>}
  </EntranceStep>
);

const DataVisual = ({ children }) => (
  <EntranceStep step={ENTRANCE_STEP.visual} aria-hidden style={{ marginTop: 16, width: "100%" }}>{children}</EntranceStep>
);

// `hero` renders the number and its visualization (they share one count-up).
const DataSlide = ({ tone, hero, label, sentence }) => {
  const colors = DATA_TONES[tone];
  return (
    <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", height: "100%" }}>
      <SlideTopSpacer />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", paddingBottom: 48 }}>
        {hero}
        <EntranceStep step={ENTRANCE_STEP.text}>
          <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 24, lineHeight: 1.2, color: colors.label, marginTop: 24 }}>
            {label}
          </div>
          <div style={{ fontFamily: BODY, fontWeight: 400, fontSize: 17, lineHeight: 1.45, color: colors.sentence, marginTop: 8 }}>
            {sentence}
          </div>
        </EntranceStep>
      </div>
    </div>
  );
};

// Stylized island of Montréal: smooth closed outline, SW tip bottom-left → NE tip top-right.
// The loop starts and ends at the path's first point.
const ISLAND_PATH = "M20 78 C14 66 40 56 70 50 C100 44 120 34 150 22 C170 14 192 10 194 20 C196 30 176 40 150 52 C120 66 96 72 66 80 C42 86 24 88 20 78 Z";
const ISLAND_START = { x: 20, y: 78 };
const ISLAND_VIEWBOX = "4 0 200 98";
const ISLAND_FILL = "#EEEEEE";
const ISLAND_LOOPS = 15;
// One slow loop around the island. The loop, the rider and the ×N counter all follow
// the km count-up's progress, so they land together with 743.
const KmIslandHero = ({ km }) => {
  const { value, progress } = useCountUp(km);
  const outlineRef = useRef(null);
  const loops = 1 + Math.round((ISLAND_LOOPS - 1) * progress);

  const outline = outlineRef.current;
  const rider = progress >= 1 || !outline
    ? ISLAND_START
    : outline.getPointAtLength(progress * outline.getTotalLength());

  return (
    <>
      <DataNumber value={value} end={km} unit="KM" color={DATA_TONES.white.number} />
      <DataVisual>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg
            viewBox={ISLAND_VIEWBOX}
            style={{ flex: 1, minWidth: 0, height: "auto", display: "block", overflow: "visible" }}
          >
            <path
              ref={outlineRef}
              d={ISLAND_PATH}
              fill={ISLAND_FILL}
              stroke={ISLAND_FILL}
              strokeWidth="6"
              strokeLinejoin="round"
            />
            <path
              d={ISLAND_PATH}
              fill="none"
              stroke={RED}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength="1"
              strokeDasharray="1 1"
              strokeDashoffset={1 - progress}
            />
            <circle cx={rider.x} cy={rider.y} r="6" fill={RED} stroke={WHITE} strokeWidth="2" />
          </svg>
          <div style={{ ...heroNumber(44, RED), lineHeight: 1, flexShrink: 0, display: "flex", alignItems: "flex-start" }}>
            <span style={{ fontSize: 28, marginTop: 4, marginRight: 1 }}>×</span>
            <AnimatedNumber value={loops} end={ISLAND_LOOPS} />
          </div>
        </div>
      </DataVisual>
    </>
  );
};

// One dot per ride; dots light up as the count climbs, so both share a single count value.
// Columns spread so the grid spans the full text width.
const RIDE_DOTS_PER_ROW = 17;
const RIDE_DOT = 9;
const RIDE_DOT_ROW_GAP = 7;

const RidesCountHero = ({ rides }) => {
  const { progress } = useCountUp(rides);
  const lit = Math.round(rides * progress);
  return (
    <>
      <DataNumber value={lit} end={rides} color={DATA_TONES.red.number} />
      <DataVisual>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${RIDE_DOTS_PER_ROW}, ${RIDE_DOT}px)`,
            justifyContent: "space-between",
            rowGap: RIDE_DOT_ROW_GAP,
          }}
        >
          {Array.from({ length: rides }, (_, i) => (
            <span
              key={i}
              style={{
                width: RIDE_DOT,
                height: RIDE_DOT,
                borderRadius: "50%",
                background: WHITE,
                opacity: i < lit ? 1 : 0.2,
                transition: "opacity 0.2s ease-out",
              }}
            />
          ))}
        </div>
      </DataVisual>
    </>
  );
};

// ---------------------------------------------------------------------------
// Decorative pieces
// ---------------------------------------------------------------------------
// Skipped in share images: html2canvas can't render SVG filters or blend modes.
const Grain = ({ opacity = 0.04 }) => {
  const still = useContext(StillContext);
  if (still) return null;
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity, pointerEvents: "none", mixBlendMode: "overlay", zIndex: 10 }}>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  );
};

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

const BOLT_PATH = "M13 2 L4 14 h6 l-1 8 9 -12 h-6 z";

const STATION_PHOTO_URL = "/station-mont-royal.jpg";
const favoriteStationDisplayLabel = (station) =>
  station.replace(/^Station\s+/, "");

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

// ---------------------------------------------------------------------------
// Framer-driven entrance helpers — each registers its end time with the slide
// so auto-advance waits for it.
// ---------------------------------------------------------------------------
function useSlideAnimationMs(ms, enabled = true) {
  const timing = useContext(SlideTimingContext);
  useLayoutEffect(() => {
    if (enabled) timing?.register(ms);
  }, [timing, ms, enabled]);
}

// Word- or letter-staggered text. Words are always nowrap spans so they never split.
function StaggerText({ text, by = "word", delay = 0, stagger = 0.08, duration = 0.5, style }) {
  const reduced = useStill();
  const words = text.split(" ");
  const unitCount = by === "letter" ? words.join("").length : words.length;
  useSlideAnimationMs((delay + stagger * Math.max(0, unitCount - 1) + duration) * 1000, !reduced);

  let unit = 0;
  const animated = (children, key) => {
    const d = delay + stagger * unit++;
    return (
      <motion.span
        key={key}
        initial={reduced ? false : { opacity: 0, y: "0.35em" }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration, delay: d, ease: STORY_EASE }}
        style={{ display: "inline-block" }}
      >
        {children}
      </motion.span>
    );
  };

  return (
    <div style={style} aria-label={text}>
      {words.map((word, wi) => (
        <span key={wi} aria-hidden>
          {by === "letter" ? (
            <span style={{ display: "inline-block", whiteSpace: "nowrap" }}>
              {[...word].map((ch, ci) => animated(ch, ci))}
            </span>
          ) : (
            <span style={{ display: "inline-block", whiteSpace: "nowrap" }}>{animated(word, 0)}</span>
          )}
          {wi < words.length - 1 ? " " : null}
        </span>
      ))}
    </div>
  );
}

function FadeUp({ children, delay = 0, duration = 0.5, y = 14, style }) {
  const reduced = useStill();
  useSlideAnimationMs((delay + duration) * 1000, !reduced);
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: STORY_EASE }}
      style={style}
    >
      {children}
    </motion.div>
  );
}

// Intro choreography (seconds). The gift auto-opens, then the reveal timeline starts
// from the moment the text mounts.
const INTRO_GIFT = { autoOpen: 1.5, bow: 0, lid: 0.12, confetti: 0.22, reveal: 0.85 };
const INTRO_TIMELINE = {
  headline: 0.1,
  wordStagger: 0.09,
  subtitle: 0.6,
  sponsor: 0.95,
  sponsorDuration: 0.6,
  hint: 1.6,
};
const INTRO_END_S = INTRO_GIFT.autoOpen + INTRO_GIFT.reveal + INTRO_TIMELINE.hint + 0.5;

const SponsorIntro = () => {
  const reduced = useStill();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, scale: 0.6 }}
      animate={{ opacity: [0, 1, 1], scale: [0.6, 1.08, 1] }}
      transition={{
        delay: INTRO_TIMELINE.sponsor,
        duration: INTRO_TIMELINE.sponsorDuration,
        times: [0, 0.6, 1],
        ease: "easeOut",
      }}
      style={{ alignSelf: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}
    >
      <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 500, letterSpacing: 2, textTransform: "uppercase", color: "#888888", lineHeight: 1 }}>
        Présenté par
      </span>
      <SponsorLogo size={30} color={BLACK} />
    </motion.div>
  );
};

const sponsorInk = (bg) => (bg === WHITE ? BLACK : WHITE);

// Fictional sponsor lockup: split-circle mark + geometric wordmark, monochrome.
const SponsorLogo = ({ size = 12, color = BLACK }) => (
  <span aria-label={SPONSOR} style={{ display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.35), color, lineHeight: 1, whiteSpace: "nowrap" }}>
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden style={{ display: "block", flexShrink: 0 }}>
      <path d="M18.57 3.17 A11 11 0 1 0 3.17 18.57 Z" />
      <path d="M20.83 5.43 A11 11 0 0 1 5.43 20.83 Z" />
    </svg>
    <span aria-hidden style={{ fontFamily: BRAND, fontWeight: 700, fontSize: size, letterSpacing: "-0.02em", lineHeight: 1 }}>
      {SPONSOR}
    </span>
  </span>
);

const SponsorHeaderCorner = ({ bg }) => {
  const onLight = bg === WHITE;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", lineHeight: 1 }}>
      <span style={{ fontFamily: BODY, fontSize: 10, color: onLight ? "#888888" : "rgba(255,255,255,0.7)", letterSpacing: 0.3 }}>
        Présenté par
      </span>
      <SponsorLogo size={12} color={sponsorInk(bg)} />
    </span>
  );
};

const PROMO_CODE = "HIVER2027";

const GIFT_RED_GRADIENT = "linear-gradient(145deg, #EE3124 0%, #C0392B 100%)";
const GiftBow = ({ width = 96 }) => (
  <svg width={width} height={Math.round((width * 68) / 96)} viewBox="0 0 96 68" fill="none" aria-hidden style={{ display: "block", overflow: "visible", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.22))" }}>
    <path d="M44 38 L30 64 L37 61 L41 67 L48 42 Z" fill="#F3F3F3" />
    <path d="M52 38 L66 64 L59 61 L55 67 L48 42 Z" fill="#F3F3F3" />
    <path d="M47 34 C36 12 10 6 8 22 C6 38 32 42 47 36 Z" fill={WHITE} />
    <path d="M49 34 C60 12 86 6 88 22 C90 38 64 42 49 36 Z" fill={WHITE} />
    <path d="M44 33 C34 22 20 18 17 24" stroke="rgba(192,57,43,0.18)" strokeWidth="2" strokeLinecap="round" />
    <path d="M52 33 C62 22 76 18 79 24" stroke="rgba(192,57,43,0.18)" strokeWidth="2" strokeLinecap="round" />
    <rect x="40" y="27" width="16" height="15" rx="6" fill={WHITE} stroke="rgba(192,57,43,0.16)" strokeWidth="1.5" />
  </svg>
);

const TapIcon = ({ color = "#666666" }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: "block", flexShrink: 0 }}>
    <path d="M9 12V5.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M12 10.5V9.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M15 11a1.5 1.5 0 0 1 3 0v3.5a6.5 6.5 0 0 1-6.5 6.5h-.6a6 6 0 0 1-4.8-2.4L3.8 15.4a1.5 1.5 0 0 1 2.3-1.9L9 16" />
    <path d="M5.5 5.5a5 5 0 0 1 9.2-1.8" opacity="0.55" />
  </svg>
);

const CONFETTI_COUNT = 42;

const ConfettiBurst = ({ delay = 0 }) => {
  const pieces = useMemo(() => Array.from({ length: CONFETTI_COUNT }, (_, i) => {
    const angle = (i / CONFETTI_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const dist = 110 + Math.random() * 120;
    return {
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist * 0.85 - 40,
      w: 5 + Math.random() * 5,
      h: 8 + Math.random() * 6,
      round: Math.random() < 0.3,
      spin: (Math.random() - 0.5) * 720,
      red: i % 3 !== 0,
      lag: Math.random() * 0.12,
    };
  }), []);

  return (
    <div aria-hidden style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, zIndex: 6, pointerEvents: "none" }}>
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          initial={{ x: 0, y: 0, opacity: 0, rotate: 0, scale: 0.4 }}
          animate={{
            x: [0, p.dx, p.dx * 1.08],
            y: [0, p.dy, p.dy + 110],
            opacity: [1, 1, 0],
            rotate: [0, p.spin * 0.6, p.spin],
            scale: [0.4, 1, 0.9],
          }}
          transition={{ delay: delay + p.lag, duration: 1.5, times: [0, 0.4, 1], ease: "easeOut" }}
          style={{
            position: "absolute",
            left: -p.w / 2,
            top: -p.h / 2,
            width: p.w,
            height: p.round ? p.w : p.h,
            borderRadius: p.round ? "50%" : 2,
            background: p.red ? RED : WHITE,
            boxShadow: p.red ? "none" : "0 0 0 1px rgba(238,49,36,0.35), 0 1px 3px rgba(0,0,0,0.12)",
          }}
        />
      ))}
    </div>
  );
};

// Unwrap timeline (seconds): bow flies, ribbons slide off, card straightens and grows.
const UNWRAP = { bow: 0, ribbons: 0.2, expand: 0.6, expandDuration: 0.65, confetti: 0.62, content: 0.85, headline: 0.7, cta: 1.25 };
const MERCI_CARD_W = Math.round(390 * 0.78); // 78% of the 390px story card
const MERCI_GIFT_H = Math.round((MERCI_CARD_W * 2) / 3); // 3:2 wrapped gift
const MERCI_GIFT_TILT = -2;
const MERCI_RIBBON_W = 56;
const MERCI_RIBBON = "rgba(255,255,255,0.9)";
const MERCI_BOW_W = 100;
const MERCI_BOW_H = Math.round((MERCI_BOW_W * 68) / 96);
const MERCI_GRAY = "#666666";
// Slide content starts 36px from the top and the header ends ~52px down: the headline sits
// 40px under the header while wrapped, 20px once opened.
const MERCI_HEADER_BOTTOM = 52 - 36;
const MERCI_HEADLINE_GAP = { closed: 40, open: 20 };

const MerciGift = ({ opened, onOpen, onShare }) => {
  const reduced = useStill();
  const [openedHere, setOpenedHere] = useState(false);
  const animateOpen = openedHere && !reduced;
  const showWrapping = !opened || animateOpen;
  const at = (s) => (animateOpen ? s : 0);

  const open = () => {
    if (opened) return;
    setOpenedHere(true);
    onOpen();
  };

  const wiggle = !opened && !reduced;
  const tilt = MERCI_GIFT_TILT;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", textAlign: "center" }}>
      <motion.div
        aria-hidden
        initial={false}
        animate={{ height: MERCI_HEADER_BOTTOM + (opened ? MERCI_HEADLINE_GAP.open : MERCI_HEADLINE_GAP.closed) }}
        transition={{ delay: at(UNWRAP.expand), duration: at(0.5), ease: STORY_EASE }}
        style={{ flexShrink: 0 }}
      />
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={opened ? "open" : "closed"}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.4, delay: opened ? at(UNWRAP.headline) : 0, ease: STORY_EASE } }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
          style={{
            ...headline(30, BLACK),
            lineHeight: 1.05,
            maxWidth: opened ? "100%" : MERCI_CARD_W,
            whiteSpace: opened ? "nowrap" : "normal",
          }}
        >
          {opened ? "Profitez-en, Bixiste!" : "Un petit merci, Bixiste"}
        </motion.div>
      </AnimatePresence>

      <motion.div layout="position" style={{ width: MERCI_CARD_W, maxWidth: "100%", marginTop: 20 }}>
        <FadeUp delay={0.2} y={24}>
          <motion.div
            role={opened ? undefined : "button"}
            tabIndex={opened ? undefined : 0}
            aria-label={opened ? undefined : "Ouvrir le cadeau"}
            data-no-nav
            onClick={open}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open();
              }
            }}
            initial={false}
            animate={opened
              ? { rotate: 0 }
              : wiggle ? { rotate: [tilt, tilt - 3, tilt + 3, tilt - 2, tilt + 1.5, tilt] } : { rotate: tilt }}
            transition={opened
              ? { delay: at(UNWRAP.expand), duration: at(0.5), ease: STORY_EASE }
              : wiggle ? { duration: 0.7, ease: "easeInOut", repeat: Infinity, repeatDelay: 1.8, delay: 1 } : { duration: 0 }}
            style={{
              position: "relative",
              cursor: opened ? "default" : "pointer",
              outline: "none",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {/* One card: red while wrapped, grows in height to reveal the offer */}
            <motion.div
              initial={false}
              animate={{ height: opened ? "auto" : MERCI_GIFT_H }}
              transition={{ delay: at(UNWRAP.expand), duration: at(UNWRAP.expandDuration), ease: [0.4, 0, 0.2, 1] }}
              style={{
                position: "relative",
                borderRadius: MERCI_CARD_RADIUS,
                overflow: "hidden",
                background: RED,
                boxShadow: "0 16px 32px rgba(238,49,36,0.25)",
                textAlign: "left",
              }}
            >
              <motion.div
                initial={false}
                animate={{ opacity: opened ? 1 : 0 }}
                transition={{ delay: at(UNWRAP.content), duration: at(0.45) }}
                style={{ pointerEvents: opened ? "auto" : "none" }}
              >
                <MerciOffer />
              </motion.div>

              {showWrapping && (
                <>
                  <motion.div
                    initial={false}
                    animate={opened ? { x: "115%" } : { x: 0 }}
                    transition={{ delay: UNWRAP.ribbons, duration: 0.45, ease: [0.5, 0, 0.75, 0] }}
                    style={{ position: "absolute", left: 0, right: 0, top: (MERCI_GIFT_H - MERCI_RIBBON_W) / 2, height: MERCI_RIBBON_W, background: MERCI_RIBBON }}
                  />
                  <motion.div
                    initial={false}
                    animate={opened ? { y: "-115%" } : { y: 0 }}
                    transition={{ delay: UNWRAP.ribbons + 0.08, duration: 0.45, ease: [0.5, 0, 0.75, 0] }}
                    style={{ position: "absolute", top: 0, height: MERCI_GIFT_H, left: "50%", width: MERCI_RIBBON_W, marginLeft: -MERCI_RIBBON_W / 2, background: MERCI_RIBBON }}
                  />
                </>
              )}
            </motion.div>

            {/* Bow sits outside the clipped card, centered on the ribbon crossing */}
            {showWrapping && (
              <div aria-hidden style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: (MERCI_GIFT_H - MERCI_BOW_H) / 2,
                display: "flex",
                justifyContent: "center",
                pointerEvents: "none",
                zIndex: 5,
              }}>
                <motion.div
                  initial={false}
                  animate={opened
                    ? { scale: [1, 1.35, 0.8], y: [0, -14, -300], x: [0, -4, 90], rotate: [0, -12, 40], opacity: [1, 1, 0] }
                    : { scale: 1, y: 0, x: 0, rotate: 0, opacity: 1 }}
                  transition={opened
                    ? { delay: UNWRAP.bow, duration: 0.8, times: [0, 0.3, 1], ease: "easeOut" }
                    : { duration: 0 }}
                >
                  <GiftBow width={MERCI_BOW_W} />
                </motion.div>
              </div>
            )}

            {animateOpen && (
              <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: MERCI_GIFT_H, pointerEvents: "none" }}>
                <ConfettiBurst delay={UNWRAP.confetti} />
              </div>
            )}
          </motion.div>
        </FadeUp>
      </motion.div>

      <motion.div
        layout="position"
        initial={false}
        animate={{ marginTop: opened ? 16 : 24 }}
        transition={{ delay: at(UNWRAP.expand), duration: at(0.5), ease: STORY_EASE }}
        style={{ width: MERCI_CARD_W, maxWidth: "100%" }}
      >
        <AnimatePresence initial={false} mode="wait">
          {!opened ? (
            <motion.div
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.5, duration: 0.4 } }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 22 }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, animation: "hintPulse 1.8s ease-in-out 1s infinite" }}>
                <TapIcon />
                <span style={{ fontFamily: BODY, fontSize: 16, color: MERCI_GRAY, lineHeight: 1 }}>Appuyez pour ouvrir</span>
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="cta"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, transition: { delay: at(UNWRAP.cta), duration: 0.45, ease: STORY_EASE } }}
            >
              <button
                type="button"
                onClick={onShare}
                style={{
                  width: "100%",
                  height: 48,
                  background: RED,
                  color: WHITE,
                  border: "none",
                  borderRadius: 14,
                  fontFamily: HEAD,
                  fontWeight: 700,
                  fontSize: 16,
                  letterSpacing: 0.2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                Partager mon récap
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div
          initial={false}
          animate={{ marginTop: opened ? 16 : 40 }}
          transition={{ delay: at(UNWRAP.cta), duration: at(0.4), ease: STORY_EASE }}
        >
          <FadeUp delay={0.6} y={8} style={{ fontFamily: BODY, fontSize: 15, lineHeight: 1.4, color: MERCI_GRAY }}>
            Merci de faire partie de la communauté BIXI.
          </FadeUp>
        </motion.div>
      </motion.div>
    </div>
  );
};

const MERCI_CARD_RADIUS = 24;
const MERCI_BANNER_H = 56;
const MERCI_OFFER_PAD = 20;

const SnowflakeIcon = ({ size = 28 }) => (
  <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth="2" strokeLinecap="round" style={{ display: "block", flexShrink: 0 }}>
    <path d="M12 2v20M3.34 7l17.32 10M3.34 17 20.66 7" />
    <path d="M9.53 4.03 12 6.5l2.47-2.47M17.67 5.87l-.91 3.38 3.38.91M20.14 13.84l-3.38.91.91 3.38M14.47 19.97 12 17.5l-2.47 2.47M6.33 18.13l.91-3.38-3.38-.91M3.86 10.16l3.38-.91-.91-3.38" strokeLinejoin="round" />
  </svg>
);

// Revealed offer; the gift card around it provides the rounded corners and shadow.
const MerciOffer = () => {
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
    <div style={{ width: "100%", textAlign: "left", color: WHITE, background: GIFT_RED_GRADIENT }}>
      <div style={{
        height: MERCI_BANNER_H,
        background: "rgba(0,0,0,0.12)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: `0 ${MERCI_OFFER_PAD}px`,
      }}>
        <SnowflakeIcon size={28} />
        <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14, letterSpacing: 1, textTransform: "uppercase", lineHeight: 1 }}>
          BIXI d'hiver
        </span>
      </div>
      <div style={{ padding: MERCI_OFFER_PAD, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, lineHeight: 1.1, letterSpacing: "-0.01em" }}>
          10% sur votre abonnement hivernal
        </div>
        <div style={{ fontFamily: BODY, fontSize: 15, lineHeight: 1.35 }}>
          On se retrouve sous la neige?
        </div>
        <div style={{ fontFamily: BODY, fontSize: 13, lineHeight: 1.35, color: "rgba(255,255,255,0.75)" }}>
          Offre valable jusqu'au 28 février 2027.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            background: "rgba(0,0,0,0.2)",
            borderRadius: 12,
            padding: "10px 16px",
            fontFamily: HEAD,
            fontWeight: 800,
            fontSize: 16,
            letterSpacing: 2,
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
              background: WHITE,
              color: RED,
              border: "none",
              borderRadius: 12,
              padding: "10px 16px",
              fontFamily: HEAD,
              fontWeight: 800,
              fontSize: 15,
              lineHeight: 1,
              minWidth: 84,
              cursor: "pointer",
            }}
          >
            {copied ? "Copié!" : "Copier"}
          </button>
        </div>
      </div>
    </div>
  );
};

const ShareIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const Spinner = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ animation: "spin 0.85s linear infinite" }} aria-hidden>
    <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="10" strokeDasharray="66 200" strokeLinecap="round" />
  </svg>
);

const PartagerButton = ({ onClick, loading }) => (
  <button type="button" disabled={loading} onClick={onClick} style={{
    width: "100%", height: JOIN_STRIP_H, background: WHITE, color: RED,
    border: "none", borderRadius: 14, padding: "0 16px",
    fontFamily: HEAD, fontWeight: 700, fontSize: 16, letterSpacing: 0.2,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
    flexShrink: 0,
  }}>
    {loading ? <Spinner /> : <ShareIcon />}
    Partager mon récap
  </button>
);

// Small per-slide share button, tinted for the slide background.
const SlideShareButton = ({ bg, onClick, loading }) => {
  const onLight = bg === WHITE;
  return (
    <button type="button" disabled={loading} onClick={onClick} style={{
      pointerEvents: "auto",
      height: 32,
      padding: "0 14px",
      borderRadius: 999,
      border: "none",
      background: onLight ? "rgba(10,10,10,0.06)" : bg === RED ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.14)",
      color: onLight ? BLACK : WHITE,
      fontFamily: HEAD,
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: 0.2,
      display: "flex",
      alignItems: "center",
      gap: 7,
    }}>
      {loading ? <Spinner size={14} /> : <ShareIcon size={14} />}
      Partager
    </button>
  );
};

// Replaces the share button in exported images.
const JoinStrip = ({ bg = WHITE }) => {
  const onRed = bg === RED;
  return (
    <div style={{
      width: "100%",
      height: JOIN_STRIP_H,
      borderRadius: 14,
      background: onRed ? WHITE : RED,
      color: onRed ? BLACK : WHITE,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      fontFamily: HEAD,
      fontWeight: 600,
      fontSize: 14,
      whiteSpace: "nowrap",
      flexShrink: 0,
    }}>
      Rejoignez BIXI avec le code
      <span style={{ fontWeight: 900, letterSpacing: 0.6, color: onRed ? RED : WHITE }}>{JOIN_CODE}</span>
    </div>
  );
};

// Replaces the share button on the exported recap card.
const ShareClosingStrip = () => (
  <div style={{
    width: "100%",
    height: JOIN_STRIP_H,
    borderRadius: 14,
    background: WHITE,
    color: RED,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    fontFamily: HEAD,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    flexShrink: 0,
  }}>
    <span style={{ fontWeight: 800, fontSize: 14 }}>À la prochaine saison, Bixiste!</span>
    <span style={{ fontWeight: 600, fontSize: 12 }}>
      Code <span style={{ fontWeight: 900, letterSpacing: 0.6 }}>{JOIN_CODE}</span>
    </span>
  </div>
);

// Recap card pieces — white on the red card.
const RecapTile = ({ value, unit, label }) => (
  <div style={{
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: 14,
    padding: 14,
    minWidth: 0,
  }}>
    <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 28, lineHeight: 1, color: WHITE, whiteSpace: "nowrap" }}>
      {value}
      {unit && <span style={{ fontSize: 18, marginLeft: 3 }}>{unit}</span>}
    </div>
    <div style={{ fontFamily: BODY, fontSize: 11, lineHeight: 1.2, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.75)", marginTop: 6 }}>
      {label}
    </div>
  </div>
);

const RecapStationRow = ({ station }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(0,0,0,0.12)", borderRadius: 14, padding: 12 }}>
    <div style={{
      width: 64,
      height: 64,
      borderRadius: 10,
      flexShrink: 0,
      backgroundImage: `url(${STATION_PHOTO_URL})`,
      backgroundSize: "cover",
      backgroundPosition: "center bottom",
    }} />
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: BODY, fontSize: 11, lineHeight: 1.2, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.7)" }}>
        Station préférée
      </div>
      <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 17, lineHeight: 1.2, color: WHITE, marginTop: 4 }}>
        {station}
      </div>
    </div>
  </div>
);

// Slide stat typography — label tightly coupled to hero number
const StatContextLabel = ({ children, dark, accent, style }) => (
  <div style={{
    fontFamily: HEAD,
    fontWeight: 800,
    fontSize: 13,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    lineHeight: 1.2,
    color: accent ? RED : (dark ? "rgba(255,255,255,0.72)" : "rgba(10,10,10,0.55)"),
    marginBottom: 12,
    ...style,
  }}>{children}</div>
);

// Big-number type: tight, heavy, slightly negative tracking.
const heroNumber = (size, color) => ({
  fontFamily: HEAD,
  fontWeight: 800,
  fontSize: size,
  color,
  lineHeight: 0.8,
  letterSpacing: "-0.045em",
});

const headline = (size, color) => ({
  fontFamily: HEAD,
  fontWeight: 800,
  fontSize: size,
  color,
  lineHeight: 0.95,
  letterSpacing: "-0.025em",
});

const SlideTopSpacer = () => <div style={{ height: 48, flexShrink: 0 }} />;

// Quick top-to-bottom stagger for the share card sections.
const shareStep = (i) => ({ delay: 0.08 + i * 0.07, duration: 0.4, y: 12 });

// Bars grow left to right; the highlighted month grows last.
const BAR_START_S = ENTRANCE_END_S;
const BAR_STAGGER_S = 0.08;
const BAR_GROW_S = 0.4;
const BAR_HIGHLIGHT_GROW_S = 0.55;
const barOrder = (() => {
  const others = SEASON_BARS.filter((b) => !b.highlight).map((b) => b.month);
  const highlighted = SEASON_BARS.filter((b) => b.highlight).map((b) => b.month);
  return [...others, ...highlighted];
})();
const barDelay = (month) => {
  const i = barOrder.indexOf(month);
  const isHighlight = i === barOrder.length - 1;
  return BAR_START_S + i * BAR_STAGGER_S + (isHighlight ? 0.1 : 0);
};
const SEASON_CHART_END_S = barDelay(barOrder[barOrder.length - 1]) + BAR_HIGHLIGHT_GROW_S;

const SeasonBarChart = ({ style }) => {
  const reduced = useStill();
  useSlideAnimationMs(SEASON_CHART_END_S * 1000, !reduced);
  const barMaxHeight = 88;
  return (
    <div style={{ width: "100%", height: 120, ...style }}>
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
            <motion.div
              initial={reduced ? false : { scaleY: 0 }}
              animate={{ scaleY: highlight ? [0, 1.08, 1] : 1 }}
              transition={{
                delay: barDelay(month),
                duration: highlight ? BAR_HIGHLIGHT_GROW_S : BAR_GROW_S,
                ease: highlight ? "easeOut" : STORY_EASE,
                ...(highlight ? { times: [0, 0.7, 1] } : {}),
              }}
              style={{
                width: "100%",
                maxWidth: 28,
                height: Math.max(4, (value / SEASON_BAR_MAX) * barMaxHeight),
                background: highlight ? RED : "rgba(255,255,255,0.25)",
                borderRadius: "3px 3px 0 0",
                flexShrink: 0,
                transformOrigin: "bottom center",
              }}
            />
            <motion.span
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: barDelay(month), duration: BAR_GROW_S }}
              style={{
                fontFamily: BODY,
                fontSize: 9,
                color: WHITE,
                textTransform: "uppercase",
                marginTop: 6,
                letterSpacing: 0.2,
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              {month}
            </motion.span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Donut: electric share draws in blue, the rest stays a faint white track. Ride count,
// arc and center percentage all follow one count-up progress.
const DONUT_SIZE = 156;
const DONUT_STROKE = 18;
const DONUT_TRACK = "rgba(255,255,255,0.12)";

const DonutLegendRow = ({ swatch, label, value }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <span style={{ width: 10, height: 10, borderRadius: 3, background: swatch, flexShrink: 0 }} />
    <span style={{ fontFamily: BODY, fontSize: 13, color: "rgba(255,255,255,0.7)", flex: 1 }}>{label}</span>
    <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 20, color: WHITE, fontVariantNumeric: "tabular-nums" }}>{value}</span>
  </div>
);

const ElectricDonutHero = ({ electric, total, pct }) => {
  const { value, progress } = useCountUp(electric);
  const r = (DONUT_SIZE - DONUT_STROKE) / 2;
  const c = DONUT_SIZE / 2;
  const arc = pct * progress;
  return (
    <>
      <DataNumber value={value} end={electric} color={DATA_TONES.electric.number} />
      <DataVisual>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ position: "relative", width: DONUT_SIZE, height: DONUT_SIZE, flexShrink: 0 }}>
            <div style={{
              position: "absolute",
              inset: -50,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(31,91,214,0.38) 0%, rgba(31,91,214,0.12) 45%, transparent 70%)",
              pointerEvents: "none",
            }} />
            <svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} style={{ display: "block", position: "relative" }}>
              <circle cx={c} cy={c} r={r} fill="none" stroke={DONUT_TRACK} strokeWidth={DONUT_STROKE} />
              <circle
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={ELECTRIC_BLUE}
                strokeWidth={DONUT_STROKE}
                pathLength="100"
                strokeDasharray={`${arc} 100`}
                transform={`rotate(-90 ${c} ${c})`}
              />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" style={{ display: "block", marginBottom: 4 }}>
                <path d={BOLT_PATH} fill={ELECTRIC_BLUE} strokeLinejoin="round" />
              </svg>
              <div style={{ ...heroNumber(40, ELECTRIC_BLUE), lineHeight: 1, display: "flex", alignItems: "flex-start" }}>
                <AnimatedNumber value={Math.round(pct * progress)} end={pct} style={{ textAlign: "right" }} />
                <span style={{ fontSize: 22, marginTop: 3, marginLeft: 1 }}>%</span>
              </div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            <DonutLegendRow swatch={ELECTRIC_BLUE} label="Électrique" value={electric} />
            <DonutLegendRow swatch="rgba(255,255,255,0.25)" label="Classique" value={total - electric} />
          </div>
        </div>
      </DataVisual>
    </>
  );
};

// Flat white trees, one per tree-equivalent; each pops in as the kg count passes its share.
const TREE_W = 48;
const TREE_H = 60;

const Co2TreesHero = ({ kg, trees }) => {
  const reduced = useStill();
  const { value, progress } = useCountUp(kg);
  return (
    <>
      <DataNumber value={value} end={kg} unit="KG" color={DATA_TONES.red.number} />
      <DataVisual>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
          {Array.from({ length: trees }, (_, i) => {
            const shown = progress >= (i + 0.5) / trees;
            return (
              <motion.svg
                key={i}
                width={TREE_W}
                height={TREE_H}
                viewBox="0 0 48 60"
                initial={reduced ? false : { scale: 0, opacity: 0 }}
                animate={shown ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 18 }}
                style={{ display: "block", transformOrigin: "50% 100%" }}
              >
                <rect x="21" y="36" width="6" height="24" rx="2" fill={WHITE} />
                <circle cx="24" cy="22" r="20" fill={WHITE} />
              </motion.svg>
            );
          })}
        </div>
      </DataVisual>
    </>
  );
};

const STATION_PHOTO_IN_S = 0.55;
const PIN_DROP_S = 1.2;
const PIN_DROP_DURATION_S = 0.75;

const StationPhotoCard = ({ height = 320, style }) => {
  const reduced = useStill();
  useSlideAnimationMs((PIN_DROP_S + PIN_DROP_DURATION_S) * 1000, !reduced);
  const pinDrop = { delay: PIN_DROP_S, duration: PIN_DROP_DURATION_S, times: [0, 0.55, 0.78, 1], ease: "easeOut" };
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, scale: 1.02 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: STATION_PHOTO_IN_S, duration: 0.6, ease: STORY_EASE }}
      style={{
        position: "relative",
        height,
        borderRadius: 20,
        overflow: "hidden",
        border: `1px solid ${BORDER}`,
        ...style,
      }}
    >
      <img
        crossOrigin="anonymous"
        src={STATION_PHOTO_URL}
        alt=""
        decoding="async"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center bottom", display: "block" }}
      />
      <div aria-hidden style={{ position: "absolute", left: "50%", top: "52%", transform: "translate(-50%, -50%)" }}>
        <motion.div
          initial={reduced ? false : { scale: 0.3, opacity: 0 }}
          animate={{ scale: [0.3, 1, 0.8, 1], opacity: [0, 0.9, 0.9, 1] }}
          transition={pinDrop}
          style={{ width: 28, height: 8, borderRadius: "50%", background: "rgba(0,0,0,0.35)", filter: "blur(1px)" }}
        />
      </div>
      <div aria-hidden style={{ position: "absolute", left: "50%", top: "52%", transform: "translate(-50%, -100%)" }}>
        <motion.div
          initial={reduced ? false : { y: -170, opacity: 0 }}
          animate={{ y: [-170, 0, -16, 0], opacity: [0, 1, 1, 1] }}
          transition={pinDrop}
          style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
        >
          <div style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: RED,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 6px 18px rgba(0,0,0,0.3), 0 0 0 3px rgba(255,255,255,0.95)",
          }}>
            <BikeIcon size={24} color={WHITE} />
          </div>
          <div style={{ width: 0, height: 0, borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderTop: `10px solid ${RED}`, marginTop: 1 }} />
        </motion.div>
      </div>
    </motion.div>
  );
};

// Persona hero card choreography (seconds): card, icon, name, description, trait pills.
const PERSONA_TITLE = { delay: 0.65, stagger: 0.035, duration: 0.4 };
const PERSONA_TITLE_END_S = PERSONA_TITLE.delay
  + PERSONA_TITLE.stagger * (PROFILE.title.replace(/\s/g, "").length - 1)
  + PERSONA_TITLE.duration;
const PERSONA_CARD = {
  card: 0.05,
  icon: 0.3,
  desc: PERSONA_TITLE_END_S - 0.1,
  pills: PERSONA_TITLE_END_S + 0.25,
  pillStagger: 0.12,
};

// "Daily routine" mark: a bold BIXI bike inside a ~300° repeat arrow (viewBox 110, center 55).
// The arc's gap sits at the top; the arrowhead at its end points clockwise into the gap.
const ROUTINE_ARC = "M77 16.9 A44 44 0 1 1 33 16.9";
const ROUTINE_ARROWHEAD = "M41.5 12 L29 10.3 L36.8 23.8 Z";
const ROUTINE_ICON = {
  circle: PERSONA_CARD.icon - 0.1,
  arc: PERSONA_CARD.icon,
  arcDuration: 0.8,
  bike: PERSONA_CARD.icon + 0.1,
  bikeDuration: 0.7,
  spinDuration: 2.2,
};
ROUTINE_ICON.spin = ROUTINE_ICON.arc + ROUTINE_ICON.arcDuration + 0.2;

const PersonaIcon = () => {
  const reduced = useStill();
  useSlideAnimationMs((ROUTINE_ICON.spin + ROUTINE_ICON.spinDuration) * 1000, !reduced);
  return (
    <svg aria-hidden width="110" height="110" viewBox="0 0 110 110" fill="none" style={{ display: "block", overflow: "visible" }}>
      <motion.circle
        cx="55"
        cy="55"
        r="55"
        fill={WHITE}
        fillOpacity="0.15"
        initial={reduced ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: ROUTINE_ICON.circle, duration: 0.45, ease: STORY_EASE }}
      />

      <motion.g
        initial={reduced ? false : { rotate: 0 }}
        animate={{ rotate: 360 }}
        transition={{ delay: ROUTINE_ICON.spin, duration: ROUTINE_ICON.spinDuration, ease: "easeInOut" }}
      >
        {/* Invisible full circle keeps the group's box centered on 55,55 for the spin */}
        <circle cx="55" cy="55" r="48" />
        <motion.path
          d={ROUTINE_ARC}
          stroke={WHITE}
          strokeWidth="7"
          strokeLinecap="round"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: ROUTINE_ICON.arc, duration: ROUTINE_ICON.arcDuration, ease: "easeInOut" }}
        />
        <motion.path
          d={ROUTINE_ARROWHEAD}
          fill={WHITE}
          stroke={WHITE}
          strokeWidth="2"
          strokeLinejoin="round"
          initial={reduced ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: ROUTINE_ICON.arc + ROUTINE_ICON.arcDuration - 0.1, duration: 0.25, ease: "easeOut" }}
        />
      </motion.g>

      <motion.g
        initial={reduced ? false : { x: -48, opacity: 0 }}
        animate={{ x: [-48, 5, -2, 0], opacity: [0, 1, 1, 1] }}
        transition={{ delay: ROUTINE_ICON.bike, duration: ROUTINE_ICON.bikeDuration, times: [0, 0.6, 0.82, 1], ease: "easeOut" }}
      >
        <g transform="translate(0 -3)" stroke={WHITE} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="36" cy="68" r="10" strokeWidth="6" />
          <circle cx="74" cy="68" r="10" strokeWidth="6" />
          <circle cx="36" cy="68" r="2.5" fill={WHITE} strokeWidth="0" />
          <circle cx="74" cy="68" r="2.5" fill={WHITE} strokeWidth="0" />
          <path d="M36 68 L52 66 M36 68 Q47 69 52 66 L67 44 M47 49 L52 66 M67 44 L74 68" strokeWidth="6" />
          <path d="M67 44 L65 37 L58 36" strokeWidth="5" />
          <rect x="40" y="44" width="13" height="6" rx="3" fill={WHITE} strokeWidth="0" />
          <rect x="69" y="37" width="17" height="12" rx="2.5" fill={WHITE} strokeWidth="0" />
          <path d="M74.5 40 V46 M80.5 40 V46" stroke={RED} strokeWidth="1.6" />
        </g>
      </motion.g>
    </svg>
  );
};

const PersonaTraitPill = ({ children, delay }) => {
  const reduced = useStill();
  useSlideAnimationMs((delay + 0.4) * 1000, !reduced);
  return (
    <motion.span
      initial={reduced ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: [0.6, 1.08, 1], opacity: [0, 1, 1] }}
      transition={{ delay, duration: 0.4, times: [0, 0.6, 1], ease: "easeOut" }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 32,
        padding: "0 14px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.18)",
        border: "1px solid rgba(255,255,255,0.35)",
        color: WHITE,
        fontFamily: HEAD,
        fontWeight: 700,
        fontSize: 13,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </motion.span>
  );
};

const PersonaHeroCard = ({ d }) => {
  const reduced = useStill();
  const traits = [`${d.rides} trajets`, `${ridesPerWeek} par semaine`, d.neighborhood];
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: PERSONA_CARD.card, duration: 0.5, ease: STORY_EASE }}
      style={{
        flex: 1,
        minHeight: 0,
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        overflow: "hidden",
        background: RED,
        borderRadius: 24,
        padding: "32px 24px 28px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "stretch",
        color: WHITE,
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
        <PersonaIcon />
      </div>
      <StaggerText
        text={PROFILE.title}
        by="letter"
        delay={PERSONA_TITLE.delay}
        stagger={PERSONA_TITLE.stagger}
        duration={PERSONA_TITLE.duration}
        style={{ ...headline(30, WHITE), lineHeight: 1, textAlign: "left", width: "100%", maxWidth: "100%", minWidth: 0 }}
      />
      <FadeUp
        delay={PERSONA_CARD.desc}
        style={{ fontFamily: BODY, fontSize: 16, lineHeight: 1.5, color: "rgba(255,255,255,0.9)", marginTop: 16, textAlign: "left" }}
      >
        {PROFILE.desc(d)}
      </FadeUp>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 22 }}>
        {traits.map((t, i) => (
          <PersonaTraitPill key={t} delay={PERSONA_CARD.pills + i * PERSONA_CARD.pillStagger}>{t}</PersonaTraitPill>
        ))}
      </div>
    </motion.div>
  );
};

const IntroGiftBox = ({ opening }) => {
  const reduced = useStill();
  const wiggle = !opening && !reduced;
  const fly = { duration: 0.75, times: [0, 0.25, 1], ease: "easeOut" };
  return (
    <motion.div
      animate={wiggle ? { rotate: [0, -3.5, 3.5, -2.5, 2.5, -1, 0] } : { rotate: 0 }}
      transition={wiggle
        ? { duration: 0.7, ease: "easeInOut", repeat: Infinity, repeatDelay: 1.3, delay: 0.3 }
        : { duration: 0.15 }}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", transformOrigin: "50% 100%" }}
    >
      {/* Bow: knot sits on the lid's top edge */}
      <motion.div
        initial={false}
        animate={opening
          ? { scale: [1, 1.35, 0.8], y: [0, -18, -280], x: [0, -4, 70], rotate: [0, -12, 40], opacity: [1, 1, 0] }
          : { scale: 1, y: 0, x: 0, rotate: 0, opacity: 1 }}
        transition={opening ? { ...fly, delay: INTRO_GIFT.bow } : { duration: 0 }}
        style={{ position: "relative", zIndex: 3, marginBottom: -34 }}
      >
        <GiftBow />
      </motion.div>

      {/* Lid */}
      <motion.div
        initial={false}
        animate={opening
          ? { y: [0, -16, -260], x: [0, 0, -40], rotate: [0, -5, -22], opacity: [1, 1, 0] }
          : { y: 0, x: 0, rotate: 0, opacity: 1 }}
        transition={opening ? { ...fly, delay: INTRO_GIFT.lid } : { duration: 0 }}
        style={{ position: "relative", zIndex: 2, marginBottom: -2 }}
      >
        <svg width="172" height="36" viewBox="0 0 172 36" aria-hidden style={{ display: "block" }}>
          <rect x="0" y="0" width="172" height="36" rx="8" fill={RED} />
          <rect x="72" y="0" width="28" height="36" fill={WHITE} />
          <rect x="0" y="30" width="172" height="6" fill="rgba(0,0,0,0.12)" />
        </svg>
      </motion.div>

      {/* Body */}
      <svg width="150" height="116" viewBox="0 0 150 116" aria-hidden style={{ display: "block", position: "relative", zIndex: 1 }}>
        <defs>
          <linearGradient id="introGiftBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#EE3124" />
            <stop offset="100%" stopColor="#C0392B" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="150" height="116" rx="10" fill="url(#introGiftBody)" />
        <rect x="0" y="46" width="150" height="28" fill={WHITE} />
        <rect x="61" y="0" width="28" height="116" fill={WHITE} />
        <rect x="0" y="0" width="150" height="8" fill="rgba(0,0,0,0.14)" />
      </svg>
      <div aria-hidden style={{ width: 130, height: 12, marginTop: 10, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,0,0,0.16) 0%, transparent 70%)" }} />
    </motion.div>
  );
};

// Gift → headline reveal. "closed" → "opening" (bow + lid fly, confetti) → "revealed".
const IntroStage = () => {
  const reduced = useStill();
  const [phase, setPhase] = useState(reduced ? "revealed" : "closed");
  useSlideAnimationMs(INTRO_END_S * 1000, !reduced);

  useEffect(() => {
    if (phase !== "closed") return undefined;
    const t = setTimeout(() => setPhase("opening"), INTRO_GIFT.autoOpen * 1000);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "opening") return undefined;
    const t = setTimeout(() => setPhase("revealed"), INTRO_GIFT.reveal * 1000);
    return () => clearTimeout(t);
  }, [phase]);

  const open = () => {
    if (phase === "closed") setPhase("opening");
  };

  return (
    <div
      data-no-nav={phase === "revealed" ? undefined : ""}
      onClick={open}
      style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", minHeight: 0 }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {phase !== "revealed" ? (
          <motion.div
            key="gift"
            role="button"
            tabIndex={0}
            aria-label="Ouvrir le cadeau"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open();
              }
            }}
            exit={{ opacity: 0, scale: 0.85, y: 20, transition: { duration: 0.25, ease: [0.4, 0, 1, 1] } }}
            style={{ cursor: "pointer", outline: "none", WebkitTapHighlightColor: "transparent", padding: "0 12px" }}
          >
            <IntroGiftBox opening={phase === "opening"} />
          </motion.div>
        ) : (
          <motion.div key="reveal" style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <StaggerText
              text="Votre été"
              delay={INTRO_TIMELINE.headline}
              stagger={INTRO_TIMELINE.wordStagger}
              style={headline(70, BLACK)}
            />
            <StaggerText
              text="à vélo."
              delay={INTRO_TIMELINE.headline + INTRO_TIMELINE.wordStagger * 2}
              stagger={INTRO_TIMELINE.wordStagger}
              style={headline(70, RED)}
            />
            <FadeUp
              delay={INTRO_TIMELINE.subtitle}
              style={{ fontFamily: BODY, fontWeight: 500, fontSize: 17, color: "#666666", marginTop: 22, lineHeight: 1.45, maxWidth: 280 }}
            >
              Le récap de votre saison BIXI 2026
            </FadeUp>
            <div style={{ marginTop: 44 }}>
              <SponsorIntro />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {phase !== "closed" && !reduced && (
        <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 0, marginTop: -40, pointerEvents: "none" }}>
          <ConfettiBurst delay={INTRO_GIFT.confetti} />
        </div>
      )}

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
        {phase === "revealed" && <IntroTapHint />}
      </div>
    </div>
  );
};

const IntroTapHint = () => (
  <FadeUp delay={INTRO_TIMELINE.hint} y={8} style={{ display: "flex", justifyContent: "center" }}>
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      fontFamily: BODY,
      fontSize: 13,
      fontWeight: 500,
      color: "#666666",
      letterSpacing: 0.2,
      lineHeight: 1,
      animation: "hintPulse 1.8s ease-in-out 1s infinite",
    }}>
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: RED }} />
      Appuyez pour commencer
    </span>
  </FadeUp>
);

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------
const slides = (d, shareUi = {}) => [
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
        <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ marginTop: 8 }}>
            <BixiLogo width={120} bg={WHITE} />
          </div>
          <IntroStage />
        </div>
      </>
    ),
  },

  // 1 — RIDES
  {
    shareFile: "bixi-2026-trajets.png",
    bg: RED,
    dark: true,
    render: () => (
      <>
        <BreathingBlob color="rgba(255,255,255,0.10)" size={320} style={{ bottom: -120, left: -100 }} />
        <Grain opacity={0.05} />
        <DataSlide
          tone="red"
          hero={<RidesCountHero rides={d.rides} />}
          label="trajets cette saison"
          sentence={`${ridesPerWeek} trajets par semaine, plus que 94% des Bixistes.`}
        />
      </>
    ),
  },

  // 2 — BEST MONTH
  {
    shareFile: "bixi-2026-meilleur-mois.png",
    bg: BLACK,
    dark: true,
    render: () => (
      <>
        <BreathingBlob color="rgba(238,49,36,0.22)" size={340} style={{ top: -120, right: -120 }} />
        <Grain opacity={0.06} />
        <DataSlide
          tone="dark"
          hero={(
            <>
              <EntranceStep step={ENTRANCE_STEP.number} style={dataNumberStyle(DATA_TONES.dark.number)}>
                {d.bestMonth}
              </EntranceStep>
              <DataVisual>
                <SeasonBarChart />
              </DataVisual>
            </>
          )}
          label="votre mois le plus actif"
          sentence={`${d.bestMonthRides} trajets en ${d.bestMonth.toLowerCase()}, votre record de la saison.`}
        />
      </>
    ),
  },

  // 3 — KM + NEIGHBOURHOOD + STATIONS
  {
    shareFile: "bixi-2026-distance.png",
    bg: WHITE,
    dark: false,
    render: () => (
      <>
        <BreathingBlob color="rgba(238,49,36,0.10)" size={300} style={{ bottom: -110, left: -110 }} duration={10} />
        <Grain opacity={0.03} />
        <DataSlide
          tone="white"
          hero={<KmIslandHero km={d.km} />}
          label="kilomètres parcourus"
          sentence={`${ISLAND_LOOPS} Tours de l'île de Montréal. Vous êtes dans le Top 1 000.`}
        />
      </>
    ),
  },

  // 4 — FAVORITE STATION
  {
    shareFile: "bixi-2026-station.png",
    bg: WHITE,
    dark: false,
    render: () => (
      <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", height: "100%" }}>
        <SlideTopSpacer />
        <FadeUp delay={0.1}>
          <StatContextLabel dark={false}>Votre station préférée</StatContextLabel>
          <div style={headline(42, BLACK)}>
            {favoriteStationDisplayLabel(d.favoriteStation)}
          </div>
        </FadeUp>
        <FadeUp
          delay={0.3}
          style={{
            fontFamily: BODY,
            fontSize: 15,
            fontWeight: 500,
            color: LABEL_GRAY,
            lineHeight: 1.45,
            marginTop: 12,
          }}
        >
          {d.stationRides} départs depuis cette station
        </FadeUp>
        <StationPhotoCard style={{ marginTop: 28, flex: 1, minHeight: 0, height: "auto", border: "none" }} />
      </div>
    ),
  },

  // 5 — ELECTRIC RIDES
  {
    shareFile: "bixi-2026-electrique.png",
    bg: ELECTRIC_NAVY,
    dark: true,
    render: () => (
      <>
        <BreathingBlob color="rgba(31,91,214,0.18)" size={340} style={{ top: -120, right: -120 }} />
        <Grain opacity={0.06} />
        <DataSlide
          tone="electric"
          hero={<ElectricDonutHero electric={d.electricRides} total={d.rides} pct={electricPct} />}
          label="trajets en vélo électrique"
          sentence="Quand ça monte, vous passez à l'électrique."
        />
      </>
    ),
  },

  // 6 — CO2 SAVED
  {
    shareFile: "bixi-2026-co2.png",
    bg: RED,
    dark: true,
    render: () => (
      <>
        <BreathingBlob color="rgba(255,255,255,0.10)" size={320} style={{ top: -120, left: -110 }} />
        <Grain opacity={0.05} />
        <DataSlide
          tone="red"
          hero={<Co2TreesHero kg={d.co2Saved} trees={treesEquiv} />}
          label="de CO₂ économisé"
          sentence={`L'équivalent de ${treesEquiv} arbres plantés. Chaque trajet compte.`}
        />
      </>
    ),
  },

  // 7 — PROFILE IDENTITY
  {
    shareFile: "bixi-2026-profil.png",
    bg: WHITE,
    dark: false,
    render: () => (
      <>
        <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", height: "100%" }}>
          <SlideTopSpacer />
          <PersonaHeroCard d={d} />
        </div>
      </>
    ),
  },

  // 8 — MERCI
  {
    kind: "merci",
    bg: WHITE,
    dark: false,
    autoAdvance: false,
    render: () => (
      <div style={{
        position: "relative",
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}>
        <MerciGift
          opened={shareUi.giftOpened}
          onOpen={shareUi.onOpenGift}
          onShare={shareUi.onShareFromMerci}
        />
      </div>
    ),
  },

  // 9 — SHARE CARD (one red recap card on white)
  {
    kind: "share",
    bg: WHITE,
    dark: false,
    autoAdvance: false,
    render: ({ still = false } = {}) => (
      <div style={{
        position: "relative",
        zIndex: 5,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        background: RED,
        borderRadius: 24,
        padding: 24,
        color: WHITE,
        boxSizing: "border-box",
      }}>
        <FadeUp {...shareStep(0)}>
          <BixiLogo width={110} bg={RED} />
        </FadeUp>

        <FadeUp {...shareStep(1)} style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 32, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
          Votre saison 2026
        </FadeUp>

        <FadeUp {...shareStep(2)} style={{ display: "flex", alignItems: "center", gap: 8, lineHeight: 1 }}>
          <span style={{ fontFamily: BODY, fontSize: 12, color: "rgba(255,255,255,0.7)", letterSpacing: 0.3 }}>Présenté par</span>
          <SponsorLogo size={16} color={WHITE} />
        </FadeUp>

        <FadeUp {...shareStep(3)} style={{ display: "flex" }}>
          <span style={{
            fontFamily: HEAD,
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: 1,
            textTransform: "uppercase",
            lineHeight: 1,
            padding: "9px 14px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.18)",
            border: "1px solid rgba(255,255,255,0.35)",
          }}>
            {PROFILE.title}
          </span>
        </FadeUp>

        <FadeUp {...shareStep(4)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <RecapTile value={d.rides} label="Trajets" />
          <RecapTile value={d.km} unit="KM" label="Parcourus" />
          <RecapTile value={Math.round(d.ridingMinutes / 60)} unit="H" label="À vélo" />
          <RecapTile value={d.co2Saved} unit="KG" label="CO₂ économisé" />
        </FadeUp>

        <FadeUp {...shareStep(5)}>
          <RecapStationRow station={favoriteStationDisplayLabel(d.favoriteStation)} />
        </FadeUp>

        {/* The exported image swaps the button for a closing strip */}
        <FadeUp {...shareStep(6)} style={{ marginTop: "auto" }}>
          {still ? <ShareClosingStrip /> : (
            <motion.div
              animate={shareUi.pulseShare
                ? {
                    scale: [1, 1.04, 1, 1.04, 1],
                    boxShadow: [
                      "0 0 0 0 rgba(255,255,255,0.6)",
                      "0 0 0 10px rgba(255,255,255,0)",
                      "0 0 0 0 rgba(255,255,255,0.6)",
                      "0 0 0 10px rgba(255,255,255,0)",
                      "0 0 0 0 rgba(255,255,255,0)",
                    ],
                  }
                : undefined}
              transition={{ delay: 0.6, duration: 1.3, ease: "easeInOut" }}
              style={{ width: "100%", borderRadius: 14 }}
            >
              <PartagerButton onClick={shareUi.onShare} loading={shareUi.shareLoading} />
            </motion.div>
          )}
        </FadeUp>
      </div>
    ),
  },
];

// ---------------------------------------------------------------------------
// Loading screen — wheel draws itself, spins once, messages rotate
// ---------------------------------------------------------------------------
const LOADING_MS = 3000;
const LOADING_MESSAGES = ["On compte vos trajets...", "On retrace votre été...", "On prépare votre surprise..."];
const WHEEL_SPOKES = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);

function LoadingScreen() {
  const reduced = useStill();
  const [msg, setMsg] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setMsg((m) => Math.min(m + 1, LOADING_MESSAGES.length - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const draw = (delay, duration) => (reduced
    ? { initial: false }
    : {
      initial: { pathLength: 0, opacity: 0 },
      animate: { pathLength: 1, opacity: 1 },
      transition: { pathLength: { delay, duration, ease: "easeInOut" }, opacity: { delay, duration: 0.01 } },
    });

  return (
    <motion.div
      role="status"
      aria-live="polite"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 90,
        background: WHITE,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <motion.div
        initial={{ rotate: 0 }}
        animate={reduced ? undefined : { rotate: 360 }}
        transition={{ delay: 1.5, duration: 1, ease: [0.65, 0, 0.35, 1] }}
        style={{ width: 96, height: 96 }}
      >
        <svg width="96" height="96" viewBox="0 0 100 100" fill="none" stroke={RED} strokeLinecap="round" aria-hidden>
          <motion.circle cx="50" cy="50" r="42" strokeWidth="6" {...draw(0, 0.9)} />
          {WHEEL_SPOKES.map((a, i) => (
            <motion.line
              key={i}
              x1={50 + Math.cos(a) * 8}
              y1={50 + Math.sin(a) * 8}
              x2={50 + Math.cos(a) * 39}
              y2={50 + Math.sin(a) * 39}
              strokeWidth="2.5"
              {...draw(0.55 + i * 0.05, 0.4)}
            />
          ))}
          <motion.circle cx="50" cy="50" r="6" strokeWidth="4" {...draw(0.45, 0.4)} />
        </svg>
      </motion.div>
      <div style={{ height: 24, marginTop: 28, display: "flex", alignItems: "center" }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={msg}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            style={{ fontFamily: BODY, fontSize: 15, fontWeight: 500, color: "#666666", letterSpacing: 0.2 }}
          >
            {LOADING_MESSAGES[msg]}
          </motion.p>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Story engine
// ---------------------------------------------------------------------------
// Transition: plain crossfade, one slide at a time (AnimatePresence mode="wait").
const slideVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.2, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: 0.15, ease: "easeIn" } },
};

// Remaining ms until the slide's last finite animation ends, or null if it has none.
function measureAnimationEnd(el, registeredMs) {
  let end = registeredMs.length ? Math.max(...registeredMs) : -1;
  if (el && typeof el.getAnimations === "function") {
    for (const anim of el.getAnimations({ subtree: true })) {
      const t = anim.effect?.getComputedTiming?.();
      if (!t || !Number.isFinite(t.endTime)) continue;
      const current = typeof anim.currentTime === "number" ? anim.currentTime : 0;
      end = Math.max(end, t.endTime - current);
    }
  }
  return end >= 0 ? end : null;
}

function StorySlide({ reduced, onTiming, style, children }) {
  const elRef = useRef(null);
  const registered = useRef([]);
  const timing = useMemo(() => ({ register: (ms) => registered.current.push(ms) }), []);

  useEffect(() => {
    // Under reduced motion, animations are effectively absent — use the fallback duration.
    onTiming(reduced ? null : measureAnimationEnd(elRef.current, registered.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SlideTimingContext.Provider value={timing}>
      <motion.div
        ref={elRef}
        variants={slideVariants}
        initial="enter"
        animate="center"
        exit="exit"
        style={style}
      >
        {children}
      </motion.div>
    </SlideTimingContext.Provider>
  );
}

function StoryProgress({ count, idx, progress, onColoredBg }) {
  const track = onColoredBg ? "rgba(255,255,255,0.35)" : "rgba(10,10,10,0.14)";
  const fill = onColoredBg ? WHITE : RED;
  const fillStyle = { height: "100%", background: fill, transformOrigin: "left center", transition: "background-color 0.35s" };
  return (
    <div aria-hidden style={{ position: "absolute", top: 12, left: 24, right: 24, display: "flex", gap: 4, zIndex: 40, pointerEvents: "none" }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, overflow: "hidden", background: track, transition: "background-color 0.35s" }}>
          {i === idx ? (
            <motion.div style={{ ...fillStyle, scaleX: progress }} />
          ) : (
            <div style={{ ...fillStyle, transform: `scaleX(${i < idx ? 1 : 0})` }} />
          )}
        </div>
      ))}
    </div>
  );
}

// Logo + discreet sponsor, sitting below the progress bars.
// Part of each slide's entrance; rendered inside the slide so it leaves with it.
const StoryHeader = ({ bg, showLogo }) => {
  const reduced = useStill();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: ENTRANCE.y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: ENTRANCE_STEP.header * ENTRANCE.stagger, duration: ENTRANCE.duration, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: "absolute",
        top: 26,
        left: 24,
        right: 24,
        zIndex: 35,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: showLogo ? "space-between" : "flex-end",
      }}
    >
      {showLogo && <SlideTopLogo bg={bg} />}
      <SponsorHeaderCorner bg={bg} />
    </motion.div>
  );
};

// Off-screen, fully settled copy of a slide that html2canvas turns into the share image.
function ShareImageFrame({ slide, frameRef }) {
  const innerH = SHARE_IMG_H - SHARE_IMG_PAD_TOP - SHARE_IMG_PAD_BOTTOM;
  const isShareCard = slide.kind === "share";
  return (
    <StillContext.Provider value={true}>
      <div
        ref={frameRef}
        aria-hidden
        className="bixi-still"
        style={{
          position: "fixed",
          left: -10000,
          top: 0,
          width: SHARE_IMG_W,
          height: SHARE_IMG_H,
          padding: `${SHARE_IMG_PAD_TOP}px ${SHARE_IMG_PAD_X}px ${SHARE_IMG_PAD_BOTTOM}px`,
          background: slide.bg,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        {isShareCard ? (
          <div style={{ height: innerH }}>{slide.render({ still: true })}</div>
        ) : (
          <>
            <div style={{ position: "absolute", top: SHARE_IMG_PAD_TOP, left: SHARE_IMG_PAD_X, right: SHARE_IMG_PAD_X, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <SlideTopLogo bg={slide.bg} />
              <SponsorHeaderCorner bg={slide.bg} />
            </div>
            <div style={{ height: innerH - JOIN_STRIP_H - JOIN_STRIP_GAP }}>{slide.render({ still: true })}</div>
            <div style={{ position: "relative", zIndex: 30, marginTop: JOIN_STRIP_GAP }}>
              <JoinStrip bg={slide.bg} />
            </div>
          </>
        )}
      </div>
    </StillContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [timing, setTiming] = useState({ idx: -1, ms: null });
  const reduced = useStill();
  const progress = useMotionValue(0);
  const controlsRef = useRef(null);
  const pausedRef = useRef(false);
  const gesture = useRef(null);
  const goToRef = useRef(() => {});
  const stillRef = useRef(null);
  const [captureIdx, setCaptureIdx] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [copyToast, setCopyToast] = useState("");
  const [giftOpened, setGiftOpened] = useState(false);
  const [pulseShare, setPulseShare] = useState(false);

  // Renders the slide's settled copy off-screen, captures it, and shares only the image file.
  const shareSlideImage = async (slideIdx) => {
    if (shareLoading) return;
    const slide = allSlides[slideIdx];
    const filename = slide.shareFile ?? SHARE_FILENAME;
    const showToast = (message) => {
      setCopyToast(message);
      setTimeout(() => setCopyToast(""), 2200);
    };

    setShareLoading(true);
    setPaused(true);
    try {
      flushSync(() => setCaptureIdx(slideIdx));
      const el = stillRef.current;
      if (document.fonts?.ready) {
        try { await document.fonts.ready; } catch (_) { /* ignore */ }
      }
      await whenImagesReady(el);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const canvas = await html2canvas(el, {
        useCORS: true,
        allowTaint: false,
        scale: SHARE_IMG_EXPORT_W / SHARE_IMG_W,
        width: SHARE_IMG_W,
        height: SHARE_IMG_H,
        backgroundColor: slide.bg,
        logging: false,
      });
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png");
      });
      const file = new File([blob], filename, { type: "image/png" });

      const canShareFiles = typeof navigator.share === "function"
        && typeof navigator.canShare === "function"
        && navigator.canShare({ files: [file] });
      if (canShareFiles) {
        try {
          await navigator.share({ files: [file] });
        } catch (e) {
          if (e?.name === "AbortError") return;
          downloadPngBlob(blob, filename);
          showToast("Image enregistrée");
        }
        return;
      }

      downloadPngBlob(blob, filename);
      showToast("Image enregistrée");
    } catch (e) {
      console.error(e);
    } finally {
      setCaptureIdx(null);
      setShareLoading(false);
      setPaused(false);
    }
  };

  const allSlides = slides(RECAP, {
    onShare: () => shareSlideImage(allSlides.length - 1),
    shareLoading,
    giftOpened,
    onOpenGift: () => setGiftOpened(true),
    onShareFromMerci: () => {
      setPulseShare(true);
      goToRef.current(allSlides.length - 1);
    },
    pulseShare,
  });
  const current = allSlides[idx];
  const isFirst = idx === 0;
  const isLast = idx === allSlides.length - 1;
  const autoAdvance = current.autoAdvance !== false;

  useEffect(() => {
    if (!isLast) setPulseShare(false);
  }, [isLast]);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), LOADING_MS);
    return () => clearTimeout(t);
  }, []);

  const goTo = (nextIdx) => {
    if (loading || nextIdx < 0 || nextIdx >= allSlides.length || nextIdx === idx) return;
    setIdx(nextIdx);
  };
  goToRef.current = goTo;

  // Progress driver: fills the active segment, then advances. Manual slides fill at once.
  const driverKey = !autoAdvance ? "manual" : timing.idx === idx ? `auto:${timing.ms}` : "waiting";
  useLayoutEffect(() => {
    progress.set(0);
    controlsRef.current = null;
    if (driverKey === "waiting") return undefined;

    const manual = driverKey === "manual";
    const totalMs = manual
      ? STORY_MANUAL_FILL_S * 1000
      : timing.ms == null ? STORY_FALLBACK_MS : timing.ms + STORY_HOLD_AFTER_MS;

    const controls = animate(progress, 1, {
      duration: reduced && manual ? 0 : totalMs / 1000,
      ease: manual ? "easeOut" : "linear",
      onComplete: () => {
        controlsRef.current = null;
        if (!manual) goToRef.current(idx + 1);
      },
    });
    controlsRef.current = controls;
    if (pausedRef.current && !manual) controls.pause();
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, driverKey]);

  useEffect(() => {
    pausedRef.current = paused;
    const controls = controlsRef.current;
    if (!controls) return;
    if (paused) controls.pause();
    else controls.play();
  }, [paused]);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    const onKey = (e) => {
      if (e.key === "ArrowRight") goToRef.current(idx + 1);
      if (e.key === "ArrowLeft") goToRef.current(idx - 1);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("keydown", onKey);
    };
  }, [idx]);

  // Tap right 60% → next, left 40% → back, hold → pause, horizontal swipe → navigate.
  const onPointerDown = (e) => {
    if (e.button !== 0 || shareLoading || loading) return;
    if (e.target.closest("button, a, input, [data-no-nav]")) return;
    const g = { x: e.clientX, y: e.clientY, held: false, timer: null };
    g.timer = setTimeout(() => {
      g.held = true;
      setPaused(true);
    }, HOLD_TO_PAUSE_MS);
    gesture.current = g;
  };

  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g || g.held) return;
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > TAP_MAX_MOVE_PX) clearTimeout(g.timer);
  };

  const endGesture = (e, cancelled) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    clearTimeout(g.timer);
    if (g.held) {
      setPaused(false);
      return;
    }
    if (cancelled) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) {
      goTo(dx < 0 ? idx + 1 : idx - 1);
      return;
    }
    if (Math.hypot(dx, dy) > TAP_MAX_MOVE_PX) return;
    const rect = e.currentTarget.getBoundingClientRect();
    goTo((e.clientX - rect.left) / rect.width < 0.4 ? idx - 1 : idx + 1);
  };

  const onColoredBg = current.bg !== WHITE;

  return (
    <div style={{ minHeight: "100vh", background: "#060606", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=Inter:wght@400;500&family=Space+Grotesk:wght@700&display=swap');
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
        @keyframes hintPulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.4; }
        }
        .story-paused * { animation-play-state: paused !important; }
        .bixi-still *, .bixi-still *::before, .bixi-still *::after { animation: none !important; transition: none !important; }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-delay: 0ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
        button{cursor:pointer;border:none;transition:opacity .15s,transform .1s}
        button:hover:not(:disabled){opacity:.9} button:active:not(:disabled){transform:scale(.98)}
        button:disabled{opacity:.75;cursor:wait}
      `}</style>

      <div style={{ width: "100%", maxWidth: 390 }}>
        <div>
          <div
            className={paused ? "story-paused" : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endGesture(e, false)}
            onPointerCancel={(e) => endGesture(e, true)}
            onPointerLeave={(e) => endGesture(e, true)}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              borderRadius: 28,
              overflow: "hidden",
              height: 620,
              position: "relative",
              touchAction: "pan-y",
              userSelect: "none",
              WebkitUserSelect: "none",
              WebkitTouchCallout: "none",
              cursor: "pointer",
              boxShadow: "0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
            }}
          >
            <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, background: current.bg }} />

            <AnimatePresence>
              {loading && <LoadingScreen key="loading" />}
            </AnimatePresence>

            {!loading && (
            <AnimatePresence initial={false} mode="wait">
                <StorySlide
                  key={idx}
                  reduced={reduced}
                  onTiming={(ms) => setTiming({ idx, ms })}
                  style={{
                    position: "absolute",
                    inset: 0,
                    padding: isLast ? "32px 24px 20px" : current.kind === "merci" ? "36px 24px 20px" : "36px 24px 60px",
                    zIndex: 20,
                    overflow: "hidden",
                    background: current.bg,
                  }}
                >
                  {/* The share card carries its own logo + sponsor header */}
                  {!isLast && <StoryHeader bg={current.bg} showLogo={!isFirst} />}
                  {current.render()}
                  {current.shareFile && (
                    <EntranceStep
                      step={ENTRANCE_STEP.text}
                      style={{ position: "absolute", left: 0, right: 0, bottom: 16, zIndex: 32, display: "flex", justifyContent: "center", pointerEvents: "none" }}
                    >
                      <SlideShareButton bg={current.bg} loading={shareLoading} onClick={() => shareSlideImage(idx)} />
                    </EntranceStep>
                  )}
                </StorySlide>
            </AnimatePresence>
            )}

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

            {!loading && (
              <StoryProgress count={allSlides.length} idx={idx} progress={progress} onColoredBg={onColoredBg} />
            )}
          </div>
        </div>
      </div>

      {captureIdx != null && <ShareImageFrame slide={allSlides[captureIdx]} frameRef={stillRef} />}

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
