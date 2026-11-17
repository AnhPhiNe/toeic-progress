import { DEFAULT_COAT, isSocCoat, type SocCoatId } from './socCoat';

/** "Sóc của bạn": coat and name stored on the profile (synced through the profile's `extra` column). */
export const DEFAULT_SOC_NAME = 'Hạt Tiêu';
export const SOC_NAME_MAX = 20;

interface SocFields { socCoat?: string; socName?: string }
export interface SocIdentity { coat: SocCoatId; name: string }

/** Tidy a typed name: single spaces, at most SOC_NAME_MAX characters; '' means "use the default". */
export function cleanSocName(raw: string | undefined | null): string {
  return Array.from((raw ?? '').replace(/\s+/g, ' ').trim()).slice(0, SOC_NAME_MAX).join('').trim();
}

/** The learner's Sóc; a profile from before this existed (or with an unknown coat) gets Nâu cam and the default name. */
export function socIdentity(profile: SocFields): SocIdentity {
  return {
    coat: isSocCoat(profile.socCoat) ? profile.socCoat : DEFAULT_COAT,
    name: cleanSocName(profile.socName) || DEFAULT_SOC_NAME
  };
}

export function withSocCoat<P extends SocFields>(profile: P, coat: SocCoatId): P {
  return isSocCoat(coat) ? { ...profile, socCoat: coat } : profile;
}

/** An empty or default name is not stored, so the default can change later without touching profiles. */
export function withSocName<P extends SocFields>(profile: P, raw: string): P {
  const name = cleanSocName(raw);
  const next = { ...profile };
  if (!name || name === DEFAULT_SOC_NAME) delete next.socName;
  else next.socName = name;
  return next;
}
