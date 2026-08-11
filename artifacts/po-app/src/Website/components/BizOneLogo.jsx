import bizoneSgLogo from "@assets/bizone_sg_optimized.webp";

/** Same logo as the app sidebar (Singapore BizOne mark). */
export default function BizOneLogo({ className = "h-14 w-auto" }) {
  return (
    <img
      src={bizoneSgLogo}
      alt="BizOne"
      className={`${className} object-contain object-left`}
    />
  );
}
