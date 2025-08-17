// src/hooks/useRandomPastel.js
import { useEffect, useState } from "react";

export const PASTEL_COLORS = [
  { bg: "hsl(200, 60%, 90%)", text: "hsl(200, 50%, 40%)" },
  { bg: "hsl(160, 60%, 90%)", text: "hsl(160, 50%, 32%)" },
  { bg: "hsl(40, 80%, 92%)",  text: "hsl(40, 50%, 38%)" },
  { bg: "hsl(280, 60%, 93%)", text: "hsl(280, 50%, 40%)" },
  { bg: "hsl(340, 60%, 94%)", text: "hsl(340, 50%, 42%)" },
];

export default function useRandomPastel() {
  const [color, setColor] = useState(null);
  useEffect(() => {
    setColor(PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)]);
    // eslint-disable-next-line
  }, []);
  return color || PASTEL_COLORS[0];
}