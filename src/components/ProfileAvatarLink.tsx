import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";

type ProfileAvatarLinkProps = {
  userId: string;
  username: string;
  children: React.ReactNode;
  className?: string;
};

export function ProfileAvatarLink({
  username,
  children,
  className,
}: ProfileAvatarLinkProps) {
  const navigate = useNavigate();

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!username) return;
    navigate({ to: "/u/$username", params: { username } });
  }, [navigate, username]);

  return (
    <span
      className={className}
      onClick={handleClick}
      style={{ display: "inline-flex", cursor: "pointer" }}
    >
      {children}
    </span>
  );
}
