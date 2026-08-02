import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import EditionsSection from "@/components/EditionsSection";
import EngineSection from "@/components/EngineSection";
import PricingSection from "@/components/PricingSection";
import AcademySection from "@/components/AcademySection";
import EnterpriseSection from "@/components/EnterpriseSection";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.23, 1, 0.32, 1] as any } },
};

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }}>
        <motion.section variants={fadeUp}>
          <HeroSection />
        </motion.section>
        <motion.section variants={fadeUp}>
          <EditionsSection />
        </motion.section>
        <motion.section variants={fadeUp}>
          <EngineSection />
        </motion.section>
        <motion.section variants={fadeUp}>
          <PricingSection />
        </motion.section>
        <motion.section variants={fadeUp}>
          <AcademySection />
        </motion.section>
        <motion.section variants={fadeUp}>
          <EnterpriseSection />
        </motion.section>
        <motion.section variants={fadeUp}>
          <CTASection />
        </motion.section>
        <motion.section variants={fadeUp}>
          <Footer />
        </motion.section>
      </motion.div>
    </div>
  );
}
