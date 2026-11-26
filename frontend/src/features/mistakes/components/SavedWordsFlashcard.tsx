import { useEffect, useRef, useState } from 'react';
import { Volume2, X } from 'lucide-react';
import type { SavedWord } from '@/features/mistakes/lib/savedWords';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { playChime } from '@/shared/lib/sound';
import { triggerHaptic } from '@/shared/lib/haptics';
import { Soc } from '@/shared/ui/soc/Soc';

interface Props {
  words: SavedWord[];
  onClose: () => void;
  onComplete: (reviewedCount: number) => void;
}

export function SavedWordsFlashcard({ words, onClose, onComplete }: Props) {
  const dialogRef = useModalA11y(true, onClose);
  const [queue, setQueue] = useState<SavedWord[]>(() => [...words]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [remembered, setRemembered] = useState(0);
  const requeued = useRef(new Set<string>());
  const completedRef = useRef(false);

  const done = index >= queue.length;
  const current = queue[Math.min(index, Math.max(0, queue.length - 1))];

  useEffect(() => {
    if (!done || completedRef.current || words.length === 0) return;
    completedRef.current = true;
    playChime('complete');
    triggerHaptic(12);
    onComplete(words.length);
  }, [done, words.length, onComplete]);

  const speak = (word: string) => {
    try {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.92;
      window.speechSynthesis.speak(utterance);
    } catch {
      /* speechSynthesis unavailable */
    }
  };

  const handleAgain = () => {
    if (!current) return;
    const key = current.word.toLowerCase();
    if (!requeued.current.has(key)) {
      requeued.current.add(key);
      setQueue(prev => [...prev, current]);
    }
    setFlipped(false);
    setIndex(i => i + 1);
  };

  const handleRemembered = () => {
    playChime('correct');
    triggerHaptic(8);
    setRemembered(c => c + 1);
    setFlipped(false);
    setIndex(i => i + 1);
  };

  return (
    <div className="rd rv" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Ôn từ đã lưu">
      <div className="rv-wrap">
        <div className="rv-bar">
          <div className="rv-bar-l">
            <Soc state={done ? 'cheerC' : 'idle'} size={40} />
            <b>Ôn từ đã lưu{!done && <span>{index + 1} / {queue.length}</span>}</b>
          </div>
          <div className="rv-bar-acts">
            <button type="button" className="rv-x" onClick={onClose} aria-label="Đóng ôn từ"><X size={18} aria-hidden="true" /> Đóng</button>
          </div>
        </div>

        {!done && (
          <div className="rv-prog" aria-hidden="true">
            <i style={{ width: `${Math.min(100, ((index + (flipped ? 0.5 : 0)) / Math.max(1, queue.length)) * 100)}%` }} />
          </div>
        )}

        {done ? (
          <div className="rv-done">
            <Soc state="cheerC" size={146} />
            <h2>Đã ôn {words.length} từ!</h2>
            <p className="rv-done-sub">Ghi nhớ {remembered} lượt · hôm nay đã tính vào chuỗi học của bạn.</p>
            <div className="rv-done-acts">
              <button type="button" className="rd-btn rd-btn--pink" onClick={onClose}>Về Sổ tay</button>
            </div>
          </div>
        ) : current ? (
          <div className="fc-wrap">
            <div className={'fc-card' + (flipped ? ' is-flipped' : '')}>
              <div className="fc-meta">
                <span className={'rv-part p' + current.part}>Part {current.part}</span>
                {current.questionNumber && <small>Câu {current.questionNumber}</small>}
              </div>
              <div className="fc-word-row">
                <b lang="en" className="fc-word">{current.word}</b>
                <button type="button" className="fc-speak" onClick={() => speak(current.word)} aria-label={`Phát âm ${current.word}`}>
                  <Volume2 size={18} aria-hidden="true" />
                  <span>Nghe</span>
                </button>
              </div>
              {flipped ? (
                <div className="fc-meaning" role="region" aria-label="Nghĩa của từ">
                  <p>{current.meaning || 'Chưa có nghĩa — bấm vào câu gốc trong danh sách để xem ngữ cảnh.'}</p>
                </div>
              ) : (
                <p className="fc-prompt">Nhớ lại nghĩa và cách dùng rồi lật thẻ nhé</p>
              )}
            </div>

            <div className="rv-foot">
              <div className="rv-acts">
                {!flipped ? (
                  <button type="button" className="rd-btn" onClick={() => setFlipped(true)}>Lật xem nghĩa</button>
                ) : (
                  <>
                    <button type="button" className="rd-btn rd-btn--white" onClick={handleAgain}>Ôn lại cuối buổi</button>
                    <button type="button" className="rd-btn" onClick={handleRemembered}>Đã nhớ</button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
