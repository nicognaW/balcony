// A session in the list: project, status and title. The full T3 Code row
// layout (relative time, elapsed time, branch) comes with the list rules.
import type { Session } from "@balcony/contracts";
import { CircleDashedIcon, CircleDotDashedIcon } from "lucide-react";

const STATUS = {
  waiting: {
    className: "text-muted-foreground",
    icon: CircleDotDashedIcon,
    label: "Waiting",
  },
  working: {
    className: "text-info-foreground",
    icon: CircleDashedIcon,
    label: "Working",
  },
} as const;

export const SessionRow = ({ session }: { readonly session: Session }) => {
  const status = STATUS[session.status];
  const Icon = status.icon;

  return (
    <li className="bg-card rounded-xl border px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground min-w-0 flex-1 truncate">
          {session.project}
        </span>
        <span
          className={`flex shrink-0 items-center gap-1 font-medium ${status.className}`}
        >
          <Icon
            aria-hidden
            className={
              session.status === "working"
                ? "motion-safe:animate-spin-slow size-3.5"
                : "size-3.5"
            }
          />
          {status.label}
        </span>
      </div>
      <p className="mt-1 truncate text-sm">{session.title}</p>
    </li>
  );
};
