// Brand assets live in /public and are served from the site root:
//   /mbc-logo.png       — full "MBC LAB" wordmark (for light surfaces)
//   /logo_mark.svg      — gradient logo mark
//   /logo_mark_w.svg    — white logo mark (for dark/navy surfaces)
//   /logo_mark_b.svg    — black logo mark
const WORDMARK_SRC = "/mbc-logo.png";
const MARK_SRC = {
  color: "/logo_mark.svg",
  white: "/logo_mark_w.svg",
  black: "/logo_mark_b.svg",
};

const WORDMARK_SIZE = { sm: "h-7", md: "h-9", lg: "h-11" };
const MARK_SIZE = { sm: "h-9 w-9", md: "h-11 w-11", lg: "h-16 w-16" };

// Legacy variant names map to a logo-mark tone. "primary" renders the
// full wordmark image instead of the mark.
const MARK_TONE_BY_VARIANT = {
  white: "white",
  black: "black",
  blue: "color",
  mark: "color",
};

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function MbcLogo({
  variant = "primary",
  size = "md",
  showText = true,
  className,
}) {
  // The wordmark already contains the "MBC LAB" lettering, so it is rendered
  // on its own (no adjacent text). Use it on light backgrounds only.
  if (variant === "primary" || variant === "wordmark") {
    return (
      <img
        src={WORDMARK_SRC}
        alt="MBC Lab"
        className={cx(
          "inline-block w-auto object-contain",
          WORDMARK_SIZE[size],
          className
        )}
      />
    );
  }

  const tone = MARK_TONE_BY_VARIANT[variant] || "color";
  const markSrc = MARK_SRC[tone];

  if (!showText) {
    return (
      <img
        src={markSrc}
        alt="MBC Lab"
        className={cx("shrink-0 object-contain", MARK_SIZE[size], className)}
      />
    );
  }

  const titleTone = tone === "white" ? "text-white" : "text-foreground";
  const subTone = tone === "white" ? "text-white/70" : "text-muted-foreground";

  return (
    <div
      className={cx("inline-flex items-center gap-3", className)}
      aria-label="MBC Laboratory"
    >
      <img
        src={markSrc}
        alt=""
        aria-hidden="true"
        className={cx("shrink-0 object-contain", MARK_SIZE[size])}
      />
      <div className="min-w-0 leading-tight">
        <div
          className={cx(
            "font-heading font-bold tracking-normal",
            size === "lg" ? "text-lg" : "text-sm",
            titleTone
          )}
        >
          MBC Laboratory
        </div>
        <div className={cx("text-xs font-medium", subTone)}>ScreenAI Lab</div>
      </div>
    </div>
  );
}
