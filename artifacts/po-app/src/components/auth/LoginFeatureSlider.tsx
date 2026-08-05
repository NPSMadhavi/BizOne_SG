import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import multitenantIllustration from "@assets/Multitenant.png";
import secureIllustration from "@assets/SecureBusiness.png";
import advancedIllustration from "@assets/Advanced.png";

const FEATURES = [
  {
    title: "Secure Asset Management",
    description: "Track and manage enterprise assets with role-based access control.",
    image: secureIllustration,
  },
  {
    title: "Multi - tenant architecture",
    description: "Support multiple organizations with isolated data with customizable features",
    image: multitenantIllustration,
  },
  {
    title: "Advanced Reporting",
    description: "Real-time analytics and insights for informed decision making.",
    image: advancedIllustration,
  },
] as const;

const AUTO_SLIDE_MS = 4000;

export function LoginFeatureSlider() {
  const [activeIndex, setActiveIndex] = useState(1);

  const goToSlide = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % FEATURES.length);
    }, AUTO_SLIDE_MS);

    return () => window.clearInterval(timer);
  }, []);

  const activeFeature = FEATURES[activeIndex];

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-8 py-10 text-center lg:px-12 xl:px-16">
      <div className="mb-8 flex w-full max-w-md justify-center lg:max-w-lg">
        <AnimatePresence mode="wait">
          <motion.img
            key={activeFeature.image}
            src={activeFeature.image}
            alt={activeFeature.title}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="h-auto w-full max-w-[280px] object-contain sm:max-w-[320px] lg:max-w-[360px]"
          />
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeFeature.title}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
          className="max-w-xl space-y-4"
        >
          <h2 className="text-3xl font-semibold leading-tight text-white sm:text-4xl lg:text-[2.5rem]">
            {activeFeature.title}
          </h2>
          <p className="mx-auto max-w-lg text-base leading-relaxed text-white/85 sm:text-lg">
            {activeFeature.description}
          </p>
        </motion.div>
      </AnimatePresence>

      <div
        className="mt-10 flex items-center justify-center gap-2.5"
        role="tablist"
        aria-label="Feature highlights"
      >
        {FEATURES.map((feature, index) => (
          <button
            key={feature.title}
            type="button"
            role="tab"
            aria-selected={index === activeIndex}
            aria-label={`Show ${feature.title}`}
            onClick={() => goToSlide(index)}
            className={`h-2.5 rounded-full transition-all duration-300 ${
              index === activeIndex
                ? "w-8 bg-white"
                : "w-2.5 bg-white/35 hover:bg-white/55"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
