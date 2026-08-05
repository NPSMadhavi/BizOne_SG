import CTASection from "../components/CTA";
import FAQSection from "../components/FAQ";
import Features from "../components/Features";
import Hero from "../components/Hero";
import PricingSection from "../components/PricingSection";
import RoleBasedAccess from "../components/RoleBasedAccess";
import WhoCanUse from "../components/WhoCanUse";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Features />
      <RoleBasedAccess />
      <WhoCanUse />
      <PricingSection />
      <FAQSection />
      <CTASection />
    </>
  );
}