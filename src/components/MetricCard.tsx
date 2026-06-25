import { ArrowDownRight, ArrowUpRight, CircleDollarSign } from "lucide-react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useState, useRef } from "react";

type MetricCardProps = {
  label: string;
  value: string;
  tone?: "default" | "good" | "bad";
  helper?: string;
  index?: number;
};

export function MetricCard({ label, value, tone = "default", helper, index = 0 }: MetricCardProps) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "bad"
        ? "text-rose-700 dark:text-rose-400"
        : "text-navy";
  const Icon = tone === "good" ? ArrowUpRight : tone === "bad" ? ArrowDownRight : CircleDollarSign;
  const iconClass =
    tone === "good"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
      : tone === "bad"
        ? "bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400"
        : "bg-teal/10 text-teal dark:bg-teal-950/30 dark:text-teal-400";

  // 1. Animated counting number logic
  const [displayValue, setDisplayValue] = useState(value);
  const prevValueRef = useRef(value);

  useEffect(() => {
    // If value hasn't changed, or if it's not mount, we might still animate or just set it.
    // Let's perform the parse and animation
    const cleanVal = value.trim();
    let isIDR = false;
    let isPercent = false;
    let numericValue = 0;
    let prefix = "";
    let suffix = "";

    if (cleanVal.includes("Rp")) {
      isIDR = true;
      const isNegative = cleanVal.startsWith("-");
      prefix = isNegative ? "-Rp " : "Rp ";
      // Extract numeric digits, strip spaces and dots
      const numStr = cleanVal.replace(/-?Rp\s*/, "").replace(/\./g, "");
      numericValue = parseInt(numStr, 10) || 0;
      if (isNegative) numericValue = -numericValue;
    } else if (cleanVal.endsWith("%")) {
      isPercent = true;
      suffix = "%";
      const numStr = cleanVal.replace("%", "").trim();
      numericValue = parseFloat(numStr) || 0;
    } else {
      const match = cleanVal.match(/(-?[\d.]+)/);
      if (match) {
        const numStr = match[1];
        numericValue = parseFloat(numStr) || 0;
        prefix = cleanVal.substring(0, cleanVal.indexOf(numStr));
        suffix = cleanVal.substring(cleanVal.indexOf(numStr) + numStr.length);
      } else {
        setDisplayValue(value);
        return;
      }
    }

    // Determine starting value for the transition.
    // If it's first render, start from 0. If it's a value update, start from previous number.
    let startVal = 0;
    const prevVal = prevValueRef.current;
    if (prevVal !== value) {
      const prevClean = prevVal.trim();
      const prevNumStr = prevClean.replace(/-?Rp\s*/, "").replace(/\./g, "").replace("%", "");
      const matched = prevNumStr.match(/(-?[\d.]+)/);
      if (matched) {
        startVal = parseFloat(matched[1]) || 0;
      }
    }
    prevValueRef.current = value;

    const controls = animate(startVal, numericValue, {
      duration: 1.0,
      ease: "easeOut",
      delay: index * 0.05, // stagger offset
      onUpdate: (latest) => {
        if (isIDR) {
          const absVal = Math.abs(Math.round(latest));
          const formattedAbs = new Intl.NumberFormat("id-ID").format(absVal);
          setDisplayValue(`${latest < 0 ? "-" : ""}Rp ${formattedAbs}`);
        } else if (isPercent) {
          setDisplayValue(`${latest.toFixed(1).replace(".0", "")}%`);
        } else {
          setDisplayValue(`${prefix}${latest.toFixed(1).replace(".0", "")}${suffix}`);
        }
      },
    });

    return () => controls.stop();
  }, [value, index]);

  // 2. 3D Tilt hover logic
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-0.5, 0.5], [10, -10]);
  const rotateY = useTransform(x, [-0.5, 0.5], [-10, 10]);

  const handleMouseMove = (event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = event.clientX - rect.left - width / 2;
    const mouseY = event.clientY - rect.top - height / 2;
    x.set(mouseX / width);
    y.set(mouseY / height);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.article
      className="metric-card cursor-pointer"
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
        perspective: 1000,
      }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: "easeOut" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-start justify-between gap-3" style={{ transform: "translateZ(20px)" }}>
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClass} metric-icon`}>
          <Icon size={18} />
        </span>
      </div>
      <p 
        className={`mt-3 text-2xl font-black tracking-tight ${toneClass}`}
        style={{ transform: "translateZ(35px)" }}
      >
        {displayValue}
      </p>
      {helper ? (
        <p 
          className="mt-1 text-xs text-slate-500"
          style={{ transform: "translateZ(15px)" }}
        >
          {helper}
        </p>
      ) : null}
    </motion.article>
  );
}

