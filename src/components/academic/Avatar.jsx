export function Avatar({ name = "" }) {
  const initial = (name?.trim()?.[0] || "?").toUpperCase();
  return (
    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold">
      {initial}
    </div>
  );
}
