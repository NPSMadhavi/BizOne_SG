/** BizOne mark for light backgrounds — matches landing footer/nav logo */
export default function BizOneLogo({ className = "h-10 w-auto" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 220 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="BizOne"
    >
      <circle cx="24" cy="24" r="22" fill="#2B7FFF" />
      {/* B1° inside circle */}
      <text
        x="20"
        y="31"
        textAnchor="middle"
        fill="#FFFFFF"
        fontFamily="Poppins, Inter, Arial, sans-serif"
        fontWeight="700"
        fontSize="18"
      >
        B1
      </text>
      <text
        x="32"
        y="22"
        fill="#FFFFFF"
        fontFamily="Poppins, Inter, Arial, sans-serif"
        fontWeight="700"
        fontSize="11"
      >
        °
      </text>
      {/* BizOne° wordmark */}
      <text
        x="56"
        y="32"
        fontFamily="Poppins, Inter, Arial, sans-serif"
        fontWeight="700"
        fontSize="26"
      >
        <tspan fill="#003DA5">Biz</tspan>
        <tspan fill="#2B7FFF">One</tspan>
      </text>
      <text
        x="168"
        y="20"
        fill="#2B7FFF"
        fontFamily="Poppins, Inter, Arial, sans-serif"
        fontWeight="700"
        fontSize="14"
      >
        °
      </text>
    </svg>
  );
}
