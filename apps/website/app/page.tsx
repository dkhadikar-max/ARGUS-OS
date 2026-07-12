import { EvidenceField } from "@/components/EvidenceField";
import { Navigation } from "@/components/Navigation";
import { HeroSection } from "@/components/HeroSection";
import { FiveGraphsSection } from "@/components/FiveGraphsSection";
import { VerdictSpectrumSection } from "@/components/VerdictSpectrumSection";
import { CompanyMemorySection } from "@/components/CompanyMemorySection";
import { CTASection } from "@/components/CTASection";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main className="relative min-h-screen">
      <EvidenceField />
      <Navigation />
      <HeroSection />
      <FiveGraphsSection />
      <VerdictSpectrumSection />
      <CompanyMemorySection />
      <CTASection />
      <Footer />
    </main>
  );
}
