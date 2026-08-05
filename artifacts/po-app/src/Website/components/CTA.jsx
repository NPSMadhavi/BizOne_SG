import { motion } from "framer-motion";
import { ArrowRight, PlayCircle } from "lucide-react";
import { Link } from "wouter";

export default function CTASection() {
  return (
    <section id="contact" className="py-16">
      <div className="mx-auto max-w-7xl px-6">

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden bg-gradient-to-br from-[#EAF4FF] via-[#F4F8FF] to-[#E5F4FF] px-8 py-10 text-center lg:px-20"
        >
          {/* Decorative Blur */}
          <div className="absolute left-0 top-0 h-64 w-64 rounded-full bg-[#009FFF]/10 blur-3xl"></div>
          <div className="absolute right-0 bottom-0 h-64 w-64 rounded-full bg-[#0072F8]/10 blur-3xl"></div>

          {/* Heading */}
          <h2 className="mx-auto max-w-3xl text-5xl font-medium leading-tight text-[#101828]">
            Ready to Simplify Your Business Operations?
          </h2>

          {/* Description */}
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-[#667085]">
            Take control of your finances, inventory, sales, and business processes with one powerful ERP platform.
          </p>

          {/* Buttons */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">

            <Link href="/register" className="flex items-center gap-2 rounded-[16px] bg-gradient-to-r from-[#002E99] via-[#0072F8] to-[#009FFF] px-8 py-4 font-medium text-white shadow-lg transition-all duration-300 hover:scale-105">
              Start Free Trial
              <ArrowRight size={18} />
            </Link>

            <Link href="/login" className="flex items-center gap-2 rounded-[16px] border border-[#D0D5DD] bg-white px-8 py-4 font-medium text-[#101828] transition-all duration-300 hover:border-[#0072F8] hover:text-[#0072F8]">
              <PlayCircle size={20} />
              Login
            </Link>

          </div>

        </motion.div>

      </div>
    </section>
  );
}
