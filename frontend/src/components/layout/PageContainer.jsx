function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function PageContainer({ children, className }) {
  return (
    <div className={cx("mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8", className)}>
      {children}
    </div>
  );
}
