import { LoginFeatureSlider } from "./LoginFeatureSlider";

export function LoginHeroPanel() {
  return (
    <div className="relative hidden min-h-[42vh] overflow-hidden lg:flex lg:min-h-screen lg:flex-1">
      <div className="absolute inset-0 bg-[#0B4DB8]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.12) 0%, transparent 45%), radial-gradient(circle at 80% 80%, rgba(0,0,0,0.18) 0%, transparent 50%)",
        }}
      />
      <div className="relative z-10 flex w-full flex-1">
        <LoginFeatureSlider />
      </div>
    </div>
  );
}
