// src/components/NavigationBar.tsx — мобайл-фьорст, бургер (3 горизонтальні лінії), модалка через portal
import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import StoryBar from './StoryBar'; // StoryBar показуємо лише на /map

const DESKTOP_BP = 992; // breakpoint для десктопу

const NavigationBar: React.FC = () => {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const location = useLocation();
  const isMapRoute =
    location.pathname === '/map' || location.pathname.startsWith('/map/');

  const toggleMenu = () => setIsOpen(v => !v);
  const closeMenu = () => setIsOpen(false);

  // breakpoint
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(min-width:${DESKTOP_BP}px)`);
    const handler = (e: MediaQueryList | MediaQueryListEvent) => {
      const match = 'matches' in e ? e.matches : (e as MediaQueryList).matches;
      setIsDesktop(match);
      if (match) setIsOpen(false);
    };
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // lock scroll for mobile modal
  useEffect(() => {
    if (!isDesktop) {
      const prevBodyOverflow = document.body.style.overflow;
      const prevHtmlOverflow =
        (document.documentElement && document.documentElement.style.overflow) || '';
      document.body.style.overflow = isOpen ? 'hidden' : prevBodyOverflow || '';
      document.documentElement.style.overflow = isOpen ? 'hidden' : prevHtmlOverflow || '';
      return () => {
        document.body.style.overflow = prevBodyOverflow || '';
        document.documentElement.style.overflow = prevHtmlOverflow || '';
      };
    }
  }, [isOpen, isDesktop]);

  // close by Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <nav style={styles.nav}>
      <div style={styles.container}>
        <div style={styles.logo}>Buy My Behavior</div>

        {/* Burger (mobile only) */}
        <button
          onClick={toggleMenu}
          aria-label="Toggle menu"
          aria-expanded={isOpen}
          aria-controls="mobile-menu"
          style={{ ...styles.burgerBtn, display: isDesktop ? 'none' : 'inline-flex' }}
        >
          <span style={styles.hbar} />
          <span style={styles.hbar} />
          <span style={styles.hbar} />
        </button>

        {/* Desktop links */}
        <div style={{ ...styles.linksDesktop, display: isDesktop ? 'flex' : 'none' }}>
          <NavLink to="/register"  onClick={closeMenu} style={({ isActive }) => linkStyle({ isActive })}>Реєстрація</NavLink>
          <NavLink to="/profile"   onClick={closeMenu} style={({ isActive }) => linkStyle({ isActive })}>Профіль</NavLink>
          <NavLink to="/map"       onClick={closeMenu} style={({ isActive }) => linkStyle({ isActive })}>Вибрати виконавця</NavLink>
          <NavLink to="/my-orders" onClick={closeMenu} style={({ isActive }) => linkStyle({ isActive })}>Мої замовлення</NavLink>
          <NavLink to="/received"  onClick={closeMenu} style={({ isActive }) => linkStyle({ isActive })}>Отримані сценарії</NavLink>
          <NavLink to="/manifest"  onClick={closeMenu} style={({ isActive }) => linkStyle({ isActive })}>Маніфест</NavLink>
        </div>
      </div>

      {/* ✅ StoryBar показуємо ЛИШЕ на /map */}
      {isMapRoute && (
        <div style={styles.storyStrip}>
          <StoryBar />
        </div>
      )}

      {/* Mobile modal via portal */}
      {!isDesktop && isOpen && createPortal(
        <div role="dialog" aria-modal="true" id="mobile-menu" style={styles.modalBackdrop} onClick={closeMenu}>
          <div style={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={styles.logo}>Buy My Behavior</div>
              <button aria-label="Close menu" onClick={closeMenu} style={styles.closeBtn}>×</button>
            </div>
            <nav style={styles.modalLinks}>
              <NavLink to="/profile"   onClick={closeMenu} style={({ isActive }) => modalLinkStyle({ isActive })}>Профіль</NavLink>
              <NavLink to="/map"       onClick={closeMenu} style={({ isActive }) => modalLinkStyle({ isActive })}>Вибрати виконавця</NavLink>
              <NavLink to="/my-orders" onClick={closeMenu} style={({ isActive }) => modalLinkStyle({ isActive })}>Мої замовлення</NavLink>
              <NavLink to="/received"  onClick={closeMenu} style={({ isActive }) => modalLinkStyle({ isActive })}>Отримані сценарії</NavLink>
              <NavLink to="/manifest"  onClick={closeMenu} style={({ isActive }) => modalLinkStyle({ isActive })}>Маніфест</NavLink>
              <NavLink to="/register"  onClick={closeMenu} style={({ isActive }) => modalLinkStyle({ isActive })}>Реєстрація</NavLink>
            </nav>
          </div>
        </div>,
        document.body
      )}
    </nav>
  );
};

const styles: Record<string, React.CSSProperties> = {
  nav: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #eee',
    padding: '12px 16px',
    fontFamily: 'sans-serif',
    position: 'sticky' as 'sticky',
    top: 0,
    zIndex: 1000,
  },
  container: {
    maxWidth: '1100px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  logo: { fontWeight: 700, fontSize: '20px', color: '#222', lineHeight: 1, userSelect: 'none' },

  burgerBtn: {
    padding: 8,
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: 10,
    cursor: 'pointer',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 4,
    display: 'inline-flex',
  },
  hbar: { width: 22, height: 2, backgroundColor: '#222', borderRadius: 2, display: 'block' },

  linksDesktop: { gap: '24px', alignItems: 'center' },

  // полоса під шапкою для StoryBar (висока, щоб не перекривалось)
  storyStrip: {
    background: '#fff',
    borderTop: '1px solid #f1f1f1',
    borderBottom: '1px solid rgba(0,0,0,.04)',
    padding: 0,
    position: 'relative',
    zIndex: 2,
  },

  // modal
  modalBackdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    zIndex: 999999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    paddingTop: 40, paddingLeft: 16, paddingRight: 16,
  },
  modalPanel: {
    width: '100%', maxWidth: 440, background: '#fff', borderRadius: 16,
    boxShadow: '0 14px 40px rgba(0,0,0,0.25)', padding: 16, fontFamily: 'sans-serif',
  },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  closeBtn: { background: 'none', border: 'none', fontSize: 28, lineHeight: 1, cursor: 'pointer', color: '#222' },
  modalLinks: { display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 },
};

const linkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  textDecoration: 'none',
  color: isActive ? '#000' : '#666',
  fontWeight: 500,
  fontSize: 16,
  borderBottom: isActive ? '2px solid #000' : '2px solid transparent',
  paddingBottom: 2,
  transition: '0.2s',
});

const modalLinkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  textDecoration: 'none',
  color: isActive ? '#000' : '#333',
  fontWeight: 600,
  fontSize: 18,
  padding: '10px 12px',
  borderRadius: 10,
  background: isActive ? '#f6f6f6' : 'transparent',
});

export default NavigationBar;
