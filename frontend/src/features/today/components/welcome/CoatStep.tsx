import { forwardRef } from 'react';
import { Soc } from '@/shared/ui/soc/Soc';
import { socCoat } from '@/shared/ui/soc/socCoat';
import { socIdentity, withSocCoat, withSocName } from '@/shared/ui/soc/socIdentity';
import type { UserProfile } from '@/shared/types';
import { SocCoatPicker } from '@/features/awards/components/SocCoatPicker';

interface Props {
  profile: UserProfile;
  onUpdateProfile: (update: (profile: UserProfile) => UserProfile) => void;
  /** Both buttons end the step; the coat and name are already saved as they change. */
  onDone: () => void;
}

const HINT = 'Đổi lại được trong Tủ đồ';
export const chooseLabel = (coatId: string) => `Chọn Sóc ${socCoat(coatId).label.toLowerCase()}`;

/** Welcome step after the goal pick (desktop card in the GoalCard spot): coat swatches and the name, skippable. */
export function CoatCard({ profile, onUpdateProfile, onDone }: Props) {
  const me = socIdentity(profile);
  return (
    <section className="td-gc td-coat" aria-label="Sóc của bạn">
      <small>SÓC CỦA BẠN</small>
      <h1>Sóc của bạn <em>trông thế nào?</em></h1>
      <div className="td-coat-row">
        <Soc state="hi" size={128} className="td-coat-soc" />
        <SocCoatPicker coat={me.coat} name={me.name} nameHint={HINT}
          onCoat={coat => onUpdateProfile(p => withSocCoat(p, coat))} onName={name => onUpdateProfile(p => withSocName(p, name))} />
      </div>
      <div className="td-gc-go">
        <button type="button" className="rd-btn td-coat-go" onClick={onDone}>{chooseLabel(me.coat)}</button>
        <button type="button" className="td-coat-skip" onClick={onDone}>Để sau</button>
      </div>
    </section>
  );
}

/** Phone version: the bottom panel of Hôm nay; the big Sóc stands in the scene above it (CoatStage). */
export const CoatPanel = forwardRef<HTMLElement, Props>(function CoatPanel({ profile, onUpdateProfile, onDone }, ref) {
  const me = socIdentity(profile);
  return (
    <section ref={ref} className="tp-panel tp-coat" aria-label="Sóc của bạn">
      <SocCoatPicker coat={me.coat} name={me.name} nameHint={HINT}
        onCoat={coat => onUpdateProfile(p => withSocCoat(p, coat))} onName={name => onUpdateProfile(p => withSocName(p, name))} />
      <button type="button" className="tp-go tp-go--wide" onClick={onDone}>{chooseLabel(me.coat)}</button>
      <div className="tp-ft is-links"><button type="button" className="tp-add" onClick={onDone}>Để sau</button></div>
    </section>
  );
});
