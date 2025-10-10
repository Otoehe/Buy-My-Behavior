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
  id: string; user_id: string; name: string; role: string;
  description: string; avatar_url: string; latitude: number; longitude: number; wallet: string;
  avg_rating?: number | null; rating_count?: number | null;
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

  // фіксуємо екземпляр StoryBar
  const storyBarElRef = useRef<JSX.Element | null>(null);
  if (!storyBarElRef.current) storyBarElRef.current = <StoryBar />;

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
    const el = panelRef.current; if (!
