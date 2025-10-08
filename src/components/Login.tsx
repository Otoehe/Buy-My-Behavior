// src/components/Login.tsx
import React, { useState } from 'react';
import { ethers } from 'ethers';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

function openBmb(payload: {
  kind?: 'success' | 'warning' | 'error' | 'confirm' | 'tx' | 'info' | 'magic' | 'congratsCustomer' | 'congratsPerformer',
  title?: React.ReactNode,
  subtitle?: React.ReactNode,
  actionLabel?: string,
}) {
  window.dispatchEvent(new CustomEvent('bmb:modal:open', { detail: payload }));
}

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const loginWithWallet = async () => {
    try {
      setLoading(true);

      if (!window.ethereum) {
        openBmb({
          kind: 'warning',
          title: 'MetaMask не знайдено',
          subtitle: 'Встановіть MetaMask для продовження.',
          actionLabel: 'OK',
        });
        return;
      }

      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = provider.getSigner();
      const address = await signer.getAddress();

      const message = `BuyMyBehavior Sign-In\nWallet: ${address}\nTime: ${Date.now()}`;
      const signature = await signer.signMessage(message);
      const recovered = ethers.utils.verifyMessage(message, signature);

      if (recovered.toLowerCase() !== address.toLowerCase()) {
        openBmb({
          kind: 'error',
          title: 'Підпис не збігається',
          subtitle: 'Будь ласка, спробуйте ще раз.',
          actionLabel: 'OK',
        });
        return;
      }

      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('wallet_address', address)
        .single();

      if (!existing) {
        const { error: insertError } = await supabase.from('profiles').insert({
          wallet_address: address
        });

        if (insertError) {
          openBmb({
            kind: 'error',
            title: 'Помилка створення профілю',
            subtitle: insertError.message,
            actionLabel: 'OK',
          });
          return;
        }
      }

      localStorage.setItem('wallet_address', address);
      navigate('/map');
    } catch (err: any) {
      openBmb({
        kind: 'error',
        title: 'Помилка входу через MetaMask',
        subtitle: err?.message || 'Спробуйте пізніше.',
        actionLabel: 'OK',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={wrapper}>
      <div style={card}>
        <h1 style={title}>Вхід через MetaMask</h1>
        <button onClick={loginWithWallet} style={btnOval} disabled={loading}>
          {loading ? 'Зачекайте…' : '🦊 Увійти через MetaMask'}
        </button>
      </div>
    </div>
  );
}

const wrapper: React.CSSProperties = {
  height: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  background: '#fff',
};

const card: React.CSSProperties = {
  padding: 24,
  borderRadius: 16,
  background: '#ffcdd6',
  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.1)',
  textAlign: 'center',
};

const title: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  marginBottom: 20,
};

const btnOval: React.CSSProperties = {
  backgroundColor: '#000',
  color: '#fff',
  padding: '14px 32px',
  fontSize: 16,
  fontWeight: 600,
  borderRadius: 999,
  border: 'none',
  cursor: 'pointer',
  width: '100%',
  maxWidth: 280,
  margin: '0 auto',
};