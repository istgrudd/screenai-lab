import BrandSidebar from "@/components/layout/BrandSidebar";
import GlassTopbar from "@/components/layout/GlassTopbar";
import PageContainer from "@/components/layout/PageContainer";

export default function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <BrandSidebar />
      <main className="min-h-screen md:pl-[17rem]">
        <GlassTopbar />
        <PageContainer>{children}</PageContainer>
        <footer className="px-4 py-6 text-center text-xs text-muted-foreground">
          Menemukan bug atau punya masukan? Hubungi{" "}
          <a
            href="mailto:support@mbclaboratory.com?subject=ScreenAI%20Lab%20%E2%80%94%20Bug%20Report%20%2F%20Feedback"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            support@mbclaboratory.com
          </a>
        </footer>
      </main>
    </div>
  );
}
