import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import StoryBar from './StoryBar';

const MapScreen: React.FC = () => {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <StoryBar />
      <div style={{ flex: 1 }}>
        <MapContainer center={[50.4501, 30.5234]} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
            url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          />
          <Marker position={[50.4501, 30.5234]}>
            <Popup>Я — тут!</Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  );
};

export default MapScreen;
