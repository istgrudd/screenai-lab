import BrandSidebar from "@/components/layout/BrandSidebar";
import GlassTopbar from "@/components/layout/GlassTopbar";
import PageContainer from "@/components/layout/PageContainer";

export default function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <BrandSidebar />
      <main className="min-h-screen lg:pl-[17rem]">
        <GlassTopbar />
        <PageContainer>{children}</PageContainer>
      </main>
    </div>
  );
}
