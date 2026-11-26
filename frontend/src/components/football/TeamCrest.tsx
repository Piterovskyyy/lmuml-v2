import { useState } from "react";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export function TeamCrest({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl: string | null;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span className={cn("team-crest", className)} aria-hidden="true">
      {logoUrl && failedUrl !== logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          width="40"
          height="40"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(logoUrl)}
        />
      ) : (
        <Shield size={25} strokeWidth={1.5} data-team={name} />
      )}
    </span>
  );
}
