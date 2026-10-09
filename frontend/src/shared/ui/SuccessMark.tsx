import { Check } from 'lucide-react';
import './success-feedback.css';

/** A brief visual receipt for a completed action; never conveys success by color alone. */
export function SuccessMark() {
  return <span className="study-success-mark" aria-hidden="true"><Check className="h-6 w-6" /></span>;
}
