// 📁 src/components/ScenarioLocation.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "../lib/supabase";

const VISITED_MAP_KEY = "scenario_visited_map";
const PIN_SVG_URL = "/bmb-pin.svg";           // файл у /public
const KYIV: [number, number] = [50.4501, 30.5234];

const MAPBOX_ACCESS_TOKEN =
  "pk.eyJ1IjoiYnV5bXliaWhhdmlvciIsImEiOiJjbWM4MzU3cDQxZGJ0MnFzM3NnOHhnaWM4In0.wShhGG9EvmIVxcHjBHImXw";
const MAPBOX_STYLE = `https://api.mapbox.com/styles/v1/mapbox/light-v10/tiles/{z}/{x}/{y}?access_token=${MAPBOX_ACCESS_TOKEN}`;

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

const isFiniteLatLng = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const isNullIsland = (lat: number, lng: number) =>
  Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001;
const isSane = (lat: number, lng: number) =>
  isFiniteLatLng(lat, lng) && !isNullIsland(lat, lng);

// ✅ Наш круглий пін (біле коло + біла обводка + тінь; лого всередині)
function makeBmbIcon(size = 33, logoUrl = PIN_SVG_URL) {
  const ring = 2;                 // товщина білої обводки
  const total = size + ring * 2;  // загальний розмір divIcon

  return L.divIcon({
    className: "bmb-pin",
    html: `
      <div class="bmb-pin-inner"
           style="width:${total}px;height:${total + 10}px;pointer-events:none;">
        <div class="bmb-pin-ring"
             style="
               width:${size}px !important;
               height:${size}px !important;
               border:${ring}px solid #ffffff !important;   /* біла обводка */
               border-radius:50% !important;
               box-shadow:0 6px 18px rgba(0,0,0,.22) !important;
               background:#ffffff !important;                /* білий фон кола */
               overflow:hidden !important;
               display:flex !important;
               align-items:center !important;
               justify-content:center !important;
             ">
          <img class="bmb-pin-logo"
               src="${logoUrl}"
               alt="bmb"
               draggable="false"
               style="
                 width:100% !important;
                 height:100% !important;
                 object-fit:contain !important;              /* не обрізаємо логотип */
                 padding:4px !important;                     /* трохи повітря всередині */
               " />
        </div>
      </div>
    `,
    iconSize: [total, total + 10],
    iconAnchor: [total / 2, total + 5],
    popupAnchor: [0, -total / 2],
  });
}

const CenterMap: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();
  useEffect(() => { map.setView(center); }, [center, map]);
  return null;
};

// ✅ Ставіть пін саме туди, де натиснули
function ClickToPlace({ onPick }: { onPick: (latlng: L.LatLng) => void }) {
  useMapEvents({
    click(e) { onPick(e.latlng); },
  });
  return null;
}

export default function ScenarioLocation() {
  const q = useQuery();
  const navigate = useNavigate();
  const mapRef = useRef<L.Map | null>(null);

  const mode = (q.get("mode") || "").toLowerCase(); // "view" щоб лише дивитись
  const latQ = Number(q.get("lat"));
  const lngQ = Number(q.get("lng"));
  const querySane = isSane(latQ, lngQ);

  const executorId =
    q.get("executor_id") || localStorage.getItem("scenario_receiverId") || "";

  // === Центр карти ===
  const [center, setCenter] = useState<[number, number]>(() => {
    if (querySane) return [latQ, lngQ];
    const lsLat = Number(localStorage.getItem("latitude"));
    const lsLng = Number(localStorage.getItem("longitude"));
    if (isSane(lsLat, lsLng)) return [lsLat, lsLng];
    return KYIV;
  });

  // === Вибраний пін ===
  const [picked, setPicked] = useState<L.LatLng | null>(() => {
    if (querySane) return new L.LatLng(latQ, lngQ);
    const lsLat = Number(localStorage.getItem("latitude"));
    const lsLng = Number(localStorage.getItem("longitude"));
    if (isSane(lsLat, lsLng)) return new L.LatLng(lsLat, lsLng);
    return new L.LatLng(KYIV[0], KYIV[1]);
  });

  // Fallback: якщо Mapbox не вантажиться — OSM
  const [useOsm, setUseOsm] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setUseOsm((prev) => prev || true), 1500);
    return () => clearTimeout(t);
  }, []);
  const onMapboxTileLoad = () => setUseOsm(false);
  const onMapboxTileError = () => setUseOsm(true);

  useEffect(() => { if (querySane) setCenter([latQ, lngQ]); }, [querySane, latQ, lngQ]);

  const iconMedium = useMemo(() => makeBmbIcon(33), []);
  const isSelectMode = mode !== "view"; // за замовчуванням — режим вибору

  // Автопочаток: LS → GPS → профіль → Київ
  const [triedAutoPick, setTriedAutoPick] = useState(false);
  useEffect(() => {
    if (!isSelectMode || triedAutoPick) return;
    if (picked && isSane(picked.lat, picked.lng)) { setTriedAutoPick(true); return; }

    const fallbackToProfile = async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) { setPicked(new L.LatLng(KYIV[0], KYIV[1])); setCenter(KYIV); return; }
        const { data } = await supabase
          .from("profiles")
          .select("latitude, longitude")
          .eq("user_id", uid)
          .single();
        if (data && isSane(data.latitude, data.longitude)) {
          const ll = new L.LatLng(data.latitude, data.longitude);
          setPicked(ll); setCenter([data.latitude, data.longitude]);
        } else {
          setPicked(new L.LatLng(KYIV[0], KYIV[1])); setCenter(KYIV);
        }
      } finally { setTriedAutoPick(true); }
    };

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          if (isSane(latitude, longitude)) {
            const ll = new L.LatLng(latitude, longitude);
            setPicked(ll); setCenter([latitude, longitude]);
          } else {
            fallbackToProfile();
          }
          setTriedAutoPick(true);
        },
        () => fallbackToProfile(),
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 6000 }
      );
    } else {
      fallbackToProfile();
    }
  }, [isSelectMode, picked, triedAutoPick]);

  // ✅ Підтвердити → назад у форму (ScenarioForm зчитує LS та state)
  const confirmSelection = () => {
    const point = picked ?? mapRef.current?.getCenter();
    if (!point) return;
    localStorage.setItem("latitude", String(point.lat));
    localStorage.setItem("longitude", String(point.lng));
    sessionStorage.setItem(VISITED_MAP_KEY, "1");
    navigate(
      `/scenario/new${executorId ? `?executor_id=${encodeURIComponent(executorId)}` : ""}`,
      { replace: true, state: { from: "/scenario/location" } }
    );
  };

  return (
    <div
      style={{
        height: "calc(var(--vh, 1vh) * 100)",
        width: "100%",
        position: "relative",
        // невеликий відступ знизу, щоб ніщо не перекривалось кнопкою
        paddingBottom: "80px",
        boxSizing: "border-box",
      }}
    >
      <MapContainer
        center={center}
        zoom={16}
        style={{ height: "100%" }}
        whenCreated={(m) => { mapRef.current = m; }}
        scrollWheelZoom
      >
        <CenterMap center={center} />

        {!useOsm && (
          <TileLayer
            url={MAPBOX_STYLE}
            tileSize={512}
            zoomOffset={-1}
            attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a>'
            eventHandlers={{ tileload: onMapboxTileLoad, tileerror: onMapboxTileError }}
          />
        )}
        {useOsm && (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap"
          />
        )}

        {isSelectMode && (
          <>
            <ClickToPlace
              onPick={(ll) => {
                setPicked(ll);
                setCenter([ll.lat, ll.lng]);
              }}
            />
            {picked && (
              <Marker
                position={picked}
                icon={iconMedium}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const m = e.target as L.Marker;
                    setPicked(m.getLatLng());
                  },
                }}
              />
            )}
          </>
        )}

        {!isSelectMode && querySane && (
          <Marker position={[latQ, lngQ]} icon={iconMedium}>
            <Popup>Місце виконання сценарію</Popup>
          </Marker>
        )}
      </MapContainer>

      {/* ✅ Кнопка завжди видима: fixed + safe-area + високий z-index */}
      {isSelectMode && (
        <button
          type="button"
          onClick={confirmSelection}
          aria-label="Підтвердити це місце"
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)", // підняв вище, щоб завжди було видно
            height: "36px",
            lineHeight: "36px",
            padding: "0 18px",
            fontSize: "14px",
            borderRadius: 999,
            background: "#000",
            color: "#fff",
            fontWeight: 800,
            border: 0,
            boxShadow: "0 12px 28px rgba(0,0,0,.28)",
            zIndex: 9999,
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
            pointerEvents: "auto",
          }}
        >
          ✅ Підтвердити це місце
        </button>
      )}
    </div>
  );
}
