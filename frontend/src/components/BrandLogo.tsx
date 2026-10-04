import logo from "@/assets/ariza-logo.png";
export default function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <img
      className={`company-logo ${className}`}
      src={logo}
      alt="Distribuciones Ariza"
      width="64"
      height="64"
    />
  );
}
