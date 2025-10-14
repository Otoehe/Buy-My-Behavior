import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';

import ReviewsModal from './ReviewsModal';
import StoryBar from './StoryBar';
import './Pills.css';
import './MapView.css';

const MAPBOX_ACCESS_TOKEN =
  'pk.eyJ1IjoiYnV5bXliaWhhdmlvciIsImEiOiJjbWM4MzU3cDQxZGJ0MnFzM3NnOHhnaWM4In0.wShhGG9EvmIVxcHjBHImXw';
const MAPBOX_STYLE =
  `https://api.mapbox.com/styles/v1/mapbox/light-v10/tiles/{z}/{x}/{y}?access_token=${MAPBOX_ACCESS_TOKEN}`;

interface User {
  id: string;
  user_id: string;
  name: string;
  role: string;
  description: string;
  avatar_url: string;
  latitude: number;
  longitude: number;
  wallet: string;
  avg_rating?: number | null;
  rating_count?: number | null;
}
interface Scenario { id: string; description: string; price: number }

const CenterMap: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();
  useEffect(() => { map.setView(center, map.getZoom(), { animate: false }); }, [center, map]);
  return null;
};

function MoveOnClickLayer() {
  const map = useMap();
  useMapEvents({ click(e) { map.setView(e.latlng); } });
  return null;
}

function pctFrom10(v: number) { const x = Math.max(0, Math.min(10, v)); return (x / 10) * 100; }

export default function MapView() {
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const isSelectMode = location.pathname === '/map/select' || params.get('pick') === '1';

  const mapRef = useRef<L.Map | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [center, setCenter] = useState<[number, number]>([50.4501, 30.5234]);
  const [selectedProfile, setSelectedProfile] = useState<User | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [reviewsOpen, setReviewsOpen] = useState(false);

  const drawerWidth = 340;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const lastX = useRef<number | null>(null);
  const dragXRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // 🔒 Анти-дабл для кнопки "Замовити поведінку" (мобільний touch→click)
  const orderTapLocked = useRef(false);

  const setTransform = (dx: number) => {
    dragXRef.current = dx;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      const el = panelRef.current;
      const bd = backdropRef.current;
      if (el) el.style.transform = `translate3d(${dragXRef.current}px,0,0)`;
      if (bd) {
        const k = Math.max(0, Math.min(1, 1 - dragXRef.current / drawerWidth));
        bd.style.opacity = String(0.35 * k);
      }
      rafRef.current = null;
    });
  };
  const setTransition = (enabled: boolean) => {
    const el = panelRef.current; if (!el) return;
    el.style.transition = enabled ? 'transform 200ms cubic-bezier(.2,.8,.2,1)' : 'none';
  };
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX; lastX.current = touchStartX.current; setTransition(false);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const x = e.touches[0].clientX; lastX.current = x;
    const next = Math.max(0, Math.min(x - touchStartX.current, drawerWidth));
    setTransform(next);
  };
  const onTouchEnd = () => {
    if (touchStartX.current == null || lastX.current == null) { touchStartX.current = null; lastX.current = null; return; }
    const deltaX = lastX.current - touchStartX.current;
    setTransition(true);
    if (deltaX > 80) { setTransform(drawerWidth); setTimeout(() => { setTransform(0); setSelectedProfile(null); }, 180); }
    else { setTransform(0); }
    touchStartX.current = null; lastX.current = null;
  };

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('profiles').select('*')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      if (!error && data) setUsers(data as unknown as User[]);
    })();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles').select('latitude, longitude')
        .eq('user_id', user.id).single();
      if (data?.latitude && data?.longitude) setCenter([data.latitude, data.longitude]);
    })();
  }, []);

  useEffect(() => {
    if (!isSelectMode) return;
    const lat = Number(localStorage.getItem('latitude'));
    const lng = Number(localStorage.getItem('longitude'));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setCenter([lat, lng]);
      requestAnimationFrame(() => { const m = mapRef.current; if (m) m.setView({ lat, lng }, m.getZoom(), { animate: false }); });
    }
    setSelectedProfile(null);
    setReviewsOpen(false);
  }, [isSelectMode]);

  useEffect(() => {
    if (isSelectMode) return;
    const profileId = (location.state as any)?.profile;
    if (profileId && users.length > 0) {
      const u = users.find((x) => x.user_id === profileId);
      if (u) {
        setSelectedProfile(u);
        setCenter([u.latitude, u.longitude]);
        fetchScenarios(u);
        setReviewsOpen(false);
      }
    }
  }, [location.state, users, isSelectMode]);

  async function fetchScenarios(u: User) {
    const { data } = await supabase
      .from('scenario_drafts')
      .select('id, description, price')
      .eq('user_id', u.user_id)
      .eq('hidden', false);
    setScenarios((data || []) as unknown as Scenario[]);
  }

  function createAvatarIcon(avatarUrl: string) {
    return L.divIcon({
      html: `<div class="custom-marker small"><img src="${avatarUrl}" class="marker-img"/></div>`,
      className: '',
      iconSize: [60, 60],
      iconAnchor: [10, 10],
    });
  }

  function handleMarkerClick(u: User) {
    if (isSelectMode) return;
    setSelectedProfile(u);
    fetchScenarios(u);
    setReviewsOpen(false);
    setTimeout(() => { setTransform(0); setTransition(true); }, 0);
  }

  function handleMapClick() {
    if (isSelectMode) return;
    if (selectedProfile || reviewsOpen) { setSelectedProfile(null); setReviewsOpen(false); }
  }

  async function handleOrderClick(e?: React.MouseEvent | React.TouchEvent) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!selectedProfile) return;

    // збережемо контекст
    try {
      localStorage.setItem('scenario_receiverId', selectedProfile.user_id);
      if (selectedProfile.latitude && selectedProfile.longitude) {
        localStorage.setItem('latitude', String(selectedProfile.latitude));
        localStorage.setItem('longitude', String(selectedProfile.longitude));
      }
    } catch {}

    // перевіримо авторизацію
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // 🔁 Раніше тут був navigate('/register'...), тепер ведемо на MetaMask-логін:
      const next = `/scenario/new?executor_id=${encodeURIComponent(selectedProfile.user_id)}`;
      sessionStorage.setItem('bmb_next_after_auth', next);
      navigate(`/login?next=${encodeURIComponent(next)}`, { replace: false });
      return;
    }

    navigate(`/scenario/new?executor_id=${selectedProfile.user_id}`, {
      state: {
        executor_id: selectedProfile.user_id,
        receiverId: selectedProfile.user_id,
        latitude: selectedProfile.latitude,
        longitude: selectedProfile.longitude,
        from: '/map',
      },
    });
  }

  // ✅ Безпечний мобільний тап-обгортка: блокує повторний запуск (touch→click)
  const handleOrderSafeTap = (e?: React.MouseEvent | React.TouchEvent) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (orderTapLocked.current) return;
    orderTapLocked.current = true;
    Promise.resolve(handleOrderClick(e)).finally(() => {
      window.setTimeout(() => { orderTapLocked.current = false; }, 800);
    });
  };

  const confirmCenterAsLocation = () => {
    const m = mapRef.current; if (!m) return;
    const c = m.getCenter();
    try {
      localStorage.setItem('latitude', String(c.lat));
      localStorage.setItem('longitude', String(c.lng));
      sessionStorage.setItem('scenario_visited_map', '1');
    } catch {}
    const executorId =
      params.get('executor_id') || localStorage.getItem('scenario_receiverId') || '';
    navigate(`/scenario/new${executorId ? `?executor_id=${encodeURIComponent(executorId)}` : ''}`,
      { replace: true, state: { from: '/map/select' } });
  };

  const avg = selectedProfile?.avg_rating ?? 10;

  return (
    <div className="map-view-container" onClick={handleMapClick}>
      {!isSelectMode && (
        <div className="storybar-overlay">
          <StoryBar />
        </div>
      )}

      <MapContainer
        center={center}
        zoom={15}
        className="map-container"
        whenCreated={(m) => { mapRef.current = m; }}
        updateWhenIdle={true}
        preferCanvas={false}
        inertia={false}
        zoomAnimation={false}
        fadeAnimation={false}
        markerZoomAnimation={false}
      >
        <CenterMap center={center} />
        <TileLayer
          url={MAPBOX_STYLE}
          attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a>'
          tileSize={512}
          zoomOffset={-1}
        />

        {isSelectMode && <MoveOnClickLayer />}

        {!isSelectMode && users.map((u, idx) => (
          <Marker
            key={u.user_id || u.id || idx}
            position={[u.latitude + idx * 0.00015, u.longitude + idx * 0.00015]}
            icon={createAvatarIcon(u.avatar_url)}
            eventHandlers={{ click: (e) => { e.originalEvent.stopPropagation(); handleMarkerClick(u); } }}
          />
        ))}
      </MapContainer>

      {isSelectMode && (
        <>
          <div
            className="center-beacon"
            style={{
              position: 'absolute',
              left: '50%', top: '50%', transform: 'translate(-50%, -100%)',
              width: 26, height: 26, borderRadius: '50%',
              background: '#ff385c',
              boxShadow: '0 0 0 6px rgba(255,56,92,.25), 0 6px 16px rgba(0,0,0,.18)',
              zIndex: 4000, pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '50%', top: '50%', transform: 'translateX(-50%)',
              width: 22, height: 6, borderRadius: 999,
              background: 'rgba(0,0,0,.18)', filter: 'blur(1px)',
              zIndex: 3999, pointerEvents: 'none',
            }}
          />
          <button
            type="button"
            onClick={confirmCenterAsLocation}
            style={{
              position: 'absolute',
              left: '50%', bottom: 18, transform: 'translateX(-50%)',
              padding: '10px 16px', borderRadius: 999,
              background: '#000', color: '#fff', fontWeight: 800, border: 0,
              boxShadow: '0 12px 28px rgba(0,0,0,.25)', zIndex: 5000, cursor: 'pointer',
            }}
          >
            ✅ Підтвердити це місце
          </button>
          <div
            style={{
              position: 'absolute',
              top: 64, left: '50%', transform: 'translateX(-50%)',
              padding: '6px 10px', borderRadius: 9999,
              background: '#000', color: '#fff', fontSize: 12, opacity: 0.85,
              zIndex: 5000, pointerEvents: 'none',
            }}
          >
            Перемісти карту — маячок завжди в центрі
          </div>
        </>
      )}

      {!isSelectMode && selectedProfile && (
        <div
          ref={backdropRef}
          onClick={() => setSelectedProfile(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1999,
            background: 'rgba(0,0,0,0.35)', opacity: 0.35, transition: 'opacity 200ms ease',
          }}
        />
      )}

      {!isSelectMode && selectedProfile && (
        <div
          ref={panelRef}
          className="drawer-overlay"
          style={{
            position: 'fixed', zIndex: 2000, top: 0, right: 0, bottom: 0,
            width: drawerWidth,
            background: '#fff', boxShadow: '-8px 0 24px rgba(0,0,0,0.22)',
            padding: 20, overflowY: 'auto',
            transform: 'translate3d(0,0,0)',
            transition: 'transform 200ms cubic-bezier(.2,.8,.2,1)',
            touchAction: 'pan-y', willChange: 'transform',
            backgroundImage:
              'linear-gradient(90deg, rgba(0,0,0,0.04) 0, rgba(0,0,0,0) 24px), linear-gradient(#fff,#fff)',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '24px 100%, 100% 100%',
            backgroundPosition: 'left top, left top',
          }}
          onClick={(e) => { e.stopPropagation(); }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <button
            type="button" aria-label="Закрити"
            onClick={() => setSelectedProfile(null)}
            style={{
              position: 'absolute', top: 10, right: 10,
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.08)',
              display: 'grid', placeItems: 'center', cursor: 'pointer',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

          <DrawerContent
            selectedProfile={selectedProfile}
            scenarios={scenarios}
            avg={avg}
            onOpenReviews={() => setReviewsOpen(true)}
            onOrderClick={handleOrderSafeTap}
          />
        </div>
      )}

      {reviewsOpen && selectedProfile && (
        <ReviewsModal targetUserId={selectedProfile.user_id} onClose={() => setReviewsOpen(false)} />
      )}
    </div>
  );
}

function DrawerContent({
  selectedProfile, scenarios, avg, onOpenReviews, onOrderClick,
}: {
  selectedProfile: User; scenarios: Scenario[]; avg: number;
  onOpenReviews: () => void; onOrderClick: (e?: React.MouseEvent | React.TouchEvent) => void;
}) {
  return (
    <div>
      {selectedProfile.avatar_url && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <img
            src={selectedProfile.avatar_url}
            alt="avatar"
            style={{
              width: 110, height: 110, borderRadius: '50%', objectFit: 'cover',
              boxShadow: '0 4px 10px rgba(0,0,0,0.12)', border: '5px solid #fff',
            }}
          />
        </div>
      )}

      <h2 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>
        {selectedProfile.name}
      </h2>

      <div className="rating-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="stars-wrap" title={`${avg.toFixed(1)}/10`}>
            <div className="stars-bg">★★★★★★★★★★</div>
            <div className="stars-fill" style={{ width: `${pctFrom10(avg)}%` }}>★★★★★★★★★★</div>
          </div>
          <span className="rating-number">{avg.toFixed(1)}</span>
        </div>

        <button type="button" className="pill ghost" style={{ marginLeft: 8 }} onClick={onOpenReviews}>
          Відгуки
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8, marginBottom: 16 }}>
        <span
          style={{
            background: '#111827', color: '#fff', padding: '4px 12px',
            borderRadius: 999, fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
          }}
        >
          {selectedProfile.role}
        </span>
      </div>

      <p style={{ fontSize: 14, color: '#475569', marginBottom: 16, textAlign: 'left' }}>
        {selectedProfile.description}
      </p>

      <div>
        <strong style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 8 }}>
          СЦЕНАРІЇ ВИКОНАВЦЯ
        </strong>

        {scenarios.length === 0 ? (
          <p style={{ color: '#94a3b8' }}>Немає доступних сценаріїв</p>
        ) : (
          scenarios.map((s) => (
            <div
              key={s.id}
              style={{
                padding: 10, marginTop: 8, border: '1px solid #e2e8f0', borderRadius: 12,
                background: 'rgba(255,182,193,0.2)', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{s.description}</div>
              <div
                style={{
                  background: '#fff', color: '#6b7280', borderRadius: 999,
                  padding: '3px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                  border: '1px solid #e5e7eb',
                }}
              >
                {s.price} USDT
              </div>
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        style={{
          position: 'sticky', bottom: 16, marginTop: 24, width: '100%',
          padding: '12px 16px', background: '#000', color: '#fff',
          border: 'none', borderRadius: 999, cursor: 'pointer', fontWeight: 700,
        }}
        onClick={onOrderClick}
        onTouchStart={onOrderClick}
      >
        Замовити поведінку
      </button>
    </div>
  );
}
