import Image from "next/image";
import Link from "next/link";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="BSSC recruitment home">
      <span className="brand-mark">
        <Image
          src="/bssc-logo.png"
          alt="BSSC puzzle logo"
          width={52}
          height={52}
          unoptimized
          priority
        />
      </span>
      <span>
        BSSC<span className="brand-sub">BINUS Square Student Committee</span>
      </span>
    </Link>
  );
}
