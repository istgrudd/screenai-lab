const logoModules = import.meta.glob("../../assets/brand/*.{png,jpg,jpeg,webp,svg}", {
  eager: true,
  query: "?url",
  import: "default",
});

const LOGO_FILE_BY_VARIANT = {
  primary: "mbc-logo-primary",
  blue: "mbc-logo-blue",
  white: "mbc-logo-white",
  mark: "mbc-logo-mark",
};

const LOGO_SIZE_CLASS = {
  sm: "h-8",
  md: "h-10",
  lg: "h-14",
};

const MARK_SIZE_CLASS = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
};

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function findLogoUrl(variant) {
  const targetName = LOGO_FILE_BY_VARIANT[variant] || LOGO_FILE_BY_VARIANT.primary;

  return (
    Object.entries(logoModules).find(([path]) =>
      path.toLowerCase().includes(targetName)
    )?.[1] || null
  );
}

export default function MbcLogo({
  variant = "primary",
  size = "md",
  showText = true,
  className,
}) {
  const logoUrl = findLogoUrl(variant);
  const isMarkOnly = variant === "mark" || !showText;

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt="MBC Laboratory"
        className={cx("inline-block w-auto object-contain", LOGO_SIZE_CLASS[size], className)}
      />
    );
  }

  return (
    <div className={cx("inline-flex items-center gap-3", className)} aria-label="MBC Laboratory">
      <div
        className={cx(
          "brand-gradient flex shrink-0 items-center justify-center rounded-lg font-heading font-bold text-white shadow-sm",
          MARK_SIZE_CLASS[size]
        )}
      >
        MBC
      </div>

      {!isMarkOnly && (
        <div className="min-w-0 leading-tight">
          <div className="font-heading text-sm font-bold tracking-normal text-foreground">
            MBC Laboratory
          </div>
          <div className="text-xs font-medium text-muted-foreground">
            ScreenAI Lab
          </div>
        </div>
      )}
    </div>
  );
}
