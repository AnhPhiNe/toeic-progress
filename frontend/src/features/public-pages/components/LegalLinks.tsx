import React from 'react';

const supportEmail = (import.meta.env.VITE_SUPPORT_EMAIL || '').trim();

/** Consistent links to public legal and support pages from sign-in prompts and Settings. */
export const LegalLinks: React.FC<{ className?: string }> = ({ className = '' }) => (
  <nav aria-label="Pháp lý và hỗ trợ" className={`st-legal ${className}`.trim()}>
    <a href="/chinh-sach-quyen-rieng-tu" target="_blank" rel="noopener noreferrer">Quyền riêng tư</a>
    <span aria-hidden="true">·</span>
    <a href="/dieu-khoan" target="_blank" rel="noopener noreferrer">Điều khoản</a>
    <span aria-hidden="true">·</span>
    {supportEmail
      ? <a href={`mailto:${supportEmail}`}>Hỗ trợ ({supportEmail})</a>
      : <a href="/gioi-thieu" target="_blank" rel="noopener noreferrer">Giới thiệu</a>}
  </nav>
);
