import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { LegalLinks } from '@/features/public-pages/components/LegalLinks';
import { Soc } from '@/shared/ui/soc/Soc';

/**
 * Shown when a guest reaches for an AI feature: one Google sign-in unlocks it, and typing by hand stays
 * one tap away. Data already on this device is kept and offered for transfer after signing in.
 */
export function AISignInPrompt({ onSignIn, onClose }: { onSignIn: () => void; onClose: () => void }) {
  const dialogRef = useModalA11y(true, onClose);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm animate-backdrop sm:items-center">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="ai-sign-in-title" tabIndex={-1}
        className="rd w-full max-w-[380px] rounded-[28px] bg-[#FBFDF8] px-6 pb-6 pt-4 text-center text-slate-900 shadow-[0_24px_60px_-26px_rgba(30,60,20,.45)] animate-sheet-up dark:bg-[#121A2B] dark:text-white sm:animate-modal-pop">
        <Soc state="think" size={104} className="mx-auto" />
        <h2 id="ai-sign-in-title" className="mt-1 text-[21px] font-extrabold tracking-tight">Đăng nhập để dùng AI</h2>
        <p className="mx-auto mt-1.5 max-w-[300px] text-[14px] leading-relaxed text-slate-600 dark:text-slate-300">
          Một lần đăng nhập Google, AI sẽ đọc ảnh kết quả và giải thích câu sai giúp bạn. Dữ liệu trên máy này vẫn được giữ.
        </p>
        <button type="button" onClick={onSignIn}
          className="mt-5 block w-full cursor-pointer rounded-[18px] bg-[#46b35a] px-4 py-3.5 text-[15.5px] font-black text-white shadow-[0_5px_0_#2f8a42] transition hover:brightness-105 active:translate-y-0.5 active:shadow-[0_3px_0_#2f8a42]">
          Đăng nhập Google
        </button>
        <button type="button" onClick={onClose}
          className="mx-auto mt-2 block min-h-10 cursor-pointer px-4 text-[13.5px] font-black text-[#2f8a42] dark:text-emerald-300">
          Để sau, tôi nhập tay
        </button>
        <LegalLinks className="mt-3 justify-center text-[12px]" />
      </div>
    </div>
  );
}
