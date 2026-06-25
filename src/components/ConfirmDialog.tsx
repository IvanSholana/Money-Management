import { AlertTriangle, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning";
  details?: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Ya, hapus",
  cancelLabel = "Batal",
  tone = "danger",
  details,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const toneClass =
    tone === "danger"
      ? "from-rose-600 to-red-500 text-white hover:from-rose-700 hover:to-red-600 focus:ring-rose-500/20"
      : "from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 focus:ring-amber-500/20";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-navy/45 px-4 py-10 backdrop-blur-sm sm:py-14"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="presentation"
          onMouseDown={onCancel}
        >
          <motion.div
            className="w-full max-w-md overflow-visible rounded-3xl drop-shadow-[0_28px_70px_rgba(15,23,42,0.28)]"
            initial={{ opacity: 0, y: 30, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="overflow-hidden rounded-3xl border border-white/70 dark:border-white/10 bg-white">
              <div className="bg-gradient-to-br from-rose-50/50 via-white to-teal/15 dark:from-rose-950/15 dark:via-slate-900/40 dark:to-teal-950/15 p-5">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <motion.div
                      initial={{ scale: 0.7, rotate: -25 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 ${
                        tone === "danger" ? "text-rose-700 bg-rose-100" : "text-amber-700 bg-amber-100"
                      }`}
                    >
                      <AlertTriangle size={24} className="animate-sparkle" />
                    </motion.div>
                    <div>
                      <h2 id="confirm-dialog-title" className="text-lg font-black tracking-tight text-navy">
                        {title}
                      </h2>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="secondary-button h-9 w-9 shrink-0 rounded-full p-0 flex items-center justify-center border border-slate-200 dark:border-white/10"
                    type="button"
                    aria-label="Tutup dialog"
                    onClick={onCancel}
                  >
                    <X size={16} />
                  </motion.button>
                </div>
                {details ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="rounded-2xl border border-slate-100 dark:border-white/5 bg-white/90 dark:bg-slate-950/40 p-4 shadow-sm text-xs"
                  >
                    {details}
                  </motion.div>
                ) : null}
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 dark:border-white/5 bg-white dark:bg-transparent p-4 sm:flex-row sm:justify-end">
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="secondary-button min-h-10 rounded-xl font-bold" 
                  type="button" 
                  onClick={onCancel}
                >
                  {cancelLabel}
                </motion.button>
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`min-w-32 bg-gradient-to-r shadow-sm min-h-10 rounded-xl font-extrabold ${toneClass}`} 
                  type="button" 
                  onClick={onConfirm}
                >
                  {confirmLabel}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

