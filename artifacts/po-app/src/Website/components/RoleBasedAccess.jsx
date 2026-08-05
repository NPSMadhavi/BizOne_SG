import { useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  BarChart3,
  Package,
  Wallet,
  Settings,
} from "lucide-react";

import dashboardImage from "../assets/Rolebased image.png";

const roles = [
  {
    id: "accountant",
    label: "Accountant",
    icon: Wallet,
  },
  {
    id: "hr",
    label: "HR",
    icon: Users,
  },
  {
    id: "sales",
    label: "Sales Manager",
    icon: BarChart3,
  },
  {
    id: "store",
    label: "Store Manager",
    icon: Package,
  },
  {
    id: "cashier",
    label: "Cashier",
    icon: Wallet,
  },
  {
    id: "admin",
    label: "Admin",
    icon: Settings,
  },
];

export default function RoleBasedAccess() {
  const [activeRole, setActiveRole] = useState(roles[0]);

  return (
    <section className="bg-[#F9FAFB] py-16">
      <div className="mx-auto max-w-7xl px-6">

        {/* Badge */}
        <div className="flex justify-center">
          <span className="rounded-full border border-blue-200 bg-blue-50 px-5 py-2 text-sm font-medium text-blue-700">
            ✦ Role-based access
          </span>
        </div>
   

        {/* Heading */}
        <h2 className="mx-auto mt-6 max-w-5xl text-center text-5xl font-semibold leading-tight text-[#101828]">
          People only see what they're meant to
        </h2>

        {/* Description */}
        <p className="mx-auto mt-5 max-w-3xl text-center text-lg leading-8 text-[#667085]">
          Assign module permissions for every role. Users only see the modules
          they are allowed to access after login.
        </p>

        {/* Role Buttons */}
        <div className="mt-12 flex flex-wrap justify-center gap-4">
          {roles.map((role) => {
            const Icon = role.icon;

            return (
              <button
                key={role.id}
                onClick={() => setActiveRole(role)}
                className={`flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-medium transition-all duration-300
                ${
                  activeRole.id === role.id
                    ? "border-[#814FFF] bg-[#814FFF] text-white shadow-lg"
                    : "border-gray-200 bg-white text-gray-700 hover:border-[#814FFF] hover:text-[#814FFF]"
                }`}
              >
                <Icon size={18} />
                {role.label}
              </button>
            );
          })}
        </div>

        {/* Dashboard Image */}
        <div className="mt-16">
          <motion.div
            key={activeRole.id}
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="overflow-hidden rounded-[32px] border border-[#EAECF0] bg-white p-5 shadow-[0_20px_60px_rgba(16,24,40,0.08)]"
          >
            <img
              src={dashboardImage}
              alt="BizOne Dashboard"
              className="w-full rounded-[24px] object-cover"
            />
          </motion.div>
        </div>

        {/* <video
            src={dashboardVideo}
            autoPlay
            muted
            loop
            playsInline
            className="w-full rounded-[24px] object-cover"
        /> */}

      </div>
    </section>
  );
}