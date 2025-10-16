// src/components/ProfilePage.tsx
import React from 'react';
import Profile from './Profile';
import ProfileInstallCTA from './ProfileInstallCTA';

export default function ProfilePage() {
  return (
    <main>
      {/* CTA завжди зверху профілю, видимий і на мобільному, і на десктопі */}
      <ProfileInstallCTA />
      <Profile />
    </main>
  );
}
