import React from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./MapPins.css"; // тут лежать стилі для піна і кнопки

/** Маленький логотип без зовнішнього кола/якоря */
function makeBmbIcon(size = 32) {
  const logoUrl = `${window.location.origin}/bmb-pin.svg`;

  return L.divIcon({
    className: "bmb-logo-only",
    html: `
      <img src="${logoUrl}" alt="bmb" style="
        width:${size}px; height:${size}px;
        display:block; object-fit:contain;
        border-radius:50%;
        box-shadow:0 2px 6px rgba(0,0,0,.15);
        pointer-events:none;
      " />
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],   // центр логотипа = точка на мапі
    popupAnchor: [0, -size / 2],
  });
}

/** Слухаємо кліки по мапі і повертаємо координати вгору */
function ClickCapture(props: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      props.onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function SelectLocation() {
  const navigate = useNavigate();
  const [picked, setPicked] = React.useState<{ lat: number; lng: number } | null>(null);

  const handlePick = (lat: number, lng: number) => {
    setPicked({ lat, lng });
  };

  const handleConfirm = () => {
    if (!picked) return;
    localStorage.setItem("latitude", String(picked.lat));
    localStorage.setItem("longitude", String(picked.lng));
    navigate("/scenario", { replace: true, state: { fromSelectLocation: true } });
  };

  // ESC — швидке скасування
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && navigate("/scenario", { replace: true });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="map-stage">
      <MapContainer center={[50.4501, 30.5234]} zoom={15} style={{ height: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />
        <ClickCapture onPick={handlePick} />
        {picked && <Marker position={[picked.lat, picked.lng]} icon={makeBmbIcon()} />}
      </MapContainer>

      {/* Чорна овальна кнопка поверх карти */}
      <button
        className="map-confirm-btn"
        onClick={handleConfirm}
        disabled={!picked}
        aria-disabled={!picked}
      >
        Підтвердити місце
      </button>
    </div>
  );
}
