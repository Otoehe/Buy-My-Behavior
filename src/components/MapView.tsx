import React, { useEffect, useMemo, useRef, useState } from 'react';
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

// ---- DEBUG перемикач: швидко вимкнути всі оверлеї панелі/бекдропа ----
const DEBUG_KILL_OVERLAYS = false;

export default function MapView() {
  const navigate = useNavigate();
  const location = useLocation();

  const isSelectMode = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return location.pathname === '/map/select' || params.get('pick') === '1';
  }, [location.pathname, location.search]);

  const mapRef = useRef<L.Map | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [center, setCenter] = useState<[number, number]>([50.4501, 30.5234]);
  const [selectedProfile, setSelectedProfile] = useState<User | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [reviewsOpen, setReviewsOpen] = useState(false);

  // зафіксований екземпляр сторісбару (щоб не створювався кожен ререндер)
  const storyBarElRef = useRef<JSX.Element | null>(null);
  if (!storyBarElRef.current) storyBarElRef.current = <StoryBar />;

  // drawer жест
  const drawerWidth = 340;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const lastX = useRef<number | null>(null);
  const dragXRef = useRef(0);
  const rafRef = useRef<number | null>(null);

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

  // cleanup RAF щоб не було витоку
  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  // початкове завантаження
  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: profiles, error: pErr }, { data: auth }] = await Promise.all([
        supabase.from('profiles').select('*').not('latitude', 'is', null).not('longitude', 'is', null),
        supabase.auth.getUser(),
      ]);
      if (!alive) return;

      if (!pErr && profiles) setUsers(profiles as unknown as User[]);

      const user = auth?.user;
      if (user) {
        const { data: coords } = await supabase
          .from('profiles')
          .select('latitude, longitude')
          .eq('user_id', user.id)
          .single();
        if (coords?.latitude && coords?.longitude) setCenter([coords.latitude, coords.longitude]);
      }
    })();
    return () => { alive = false; };
  }, []);

  // select mode — центруємо
  useEffect(() => {
    if (!isSelectMode) return;
    const lat = Number(localStorage.getItem('latitude'));
    const lng = Number(localStorage.getItem('longitude'));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setCenter([lat, lng]);
      requestAnimationFrame(() => {
        const m = mapRef.current;
        if (m) m.setView({ lat, lng }, m.getZoom(), { animate: false });
      });
    }
    setSelectedProfile(null);
    setReviewsOpen(false);
  }, [isSelectMode]);

  // прихід із state.profile
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

  function handleOrderClick(e?: React.MouseEvent) {
    e?.preventDefault(); e?.stopPropagation();
    if (!selectedProfile) return;
    localStorage.setItem('scenario_receiver
