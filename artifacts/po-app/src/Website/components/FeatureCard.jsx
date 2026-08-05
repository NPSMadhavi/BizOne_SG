import { motion } from "framer-motion";

export default function FeatureCard({
  image,
  title,
  description,
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.25 }}
      className="
        group
        w-full
        overflow-hidden
        rounded-[18px]
        bg-[#EEF0F2]
        p-3
        shadow-none
        transition-shadow
        duration-300
        hover:shadow-[0_10px_30px_rgba(0,0,0,0.06)]
        sm:rounded-[19px]
        sm:p-4
        lg:rounded-[20px]
      "
    >

      {/* Card Content */}
      <div className="flex flex-col">

        {/* Title */}
        <h3
          className="
            text-[14px]
            font-medium
            leading-5
            text-[#003DA5]
            sm:text-[15px]
            lg:text-[16px]
          "
        >
          {title}
        </h3>

        {/* Description */}
        <p
          className="
            mt-1.5
            min-h-[42px]
            text-[10px]
            leading-[15px]
            text-[#667085]
            sm:text-[11px]
            sm:leading-[16px]
          "
        >
          {description}
        </p>

        {/* Image */}
        <div
          className="
            mt-3
            w-full
            overflow-hidden
            rounded-[10px]
            bg-[#E6E9ED]
            sm:mt-4
            sm:rounded-[12px]
          "
        >
          <img
            src={image}
            alt={title}
            className="
              block
              aspect-[366/218]
              w-full
              object-cover
              transition-transform
              duration-500
              group-hover:scale-[1.02]
            "
          />
        </div>

      </div>

    </motion.div>
  );
}