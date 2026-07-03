export default function InitialsAvatar({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <div
      className={`bg-surface-variant text-on-surface flex items-center justify-center font-label-sm text-label-sm uppercase ${className}`}
    >
      {initial}
    </div>
  );
}
