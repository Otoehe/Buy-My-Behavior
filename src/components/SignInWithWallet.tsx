// src/components/SignInWithWallet.tsx
import React, { useState } from 'react';
import { ethers } from 'ethers';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function SignInWithWallet() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const signIn = async () => {
    try {
      setLoading(true);

      if (!window.ethereum) {
        alert('MetaMask не знайдено. Встановіть MetaMask.');
        return;
      }

      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = provider.getSigner();
      const address = await signer.getAddress();

      const message = `BuyMyBehavior Login\nAddress: ${address}\nTime: ${Date.now()}`;
      const signature = await signer.signMessage(message);

      const recovered = ethers.utils.verifyMessage(message, signature);
      if (recovered.toLowerCase() !== address.toLowerCase()) {
        alert('Підпис не вірний');
        return;
      }

      // Перевірка наявності профілю
      const { data: existingProfile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('wallet_address', address)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error(error);
        alert('Помилка при перевірці профілю');
        return;
      }

      if (!existingProfile) {
        const { error: insertError } = await supabase.from('profiles').insert({
          wallet_address: address,
          created_at: new Date().toISOString(),
        });
        if (insertError) {
          console.error(insertError);
          alert('Не вдалося створити профіль');
          return;
        }
      }

      localStorage.setItem('wallet_address', address);
      navigate('/map');
    } catch (err) {
      console.error(err);
      alert('Помилка входу через гаманець');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={signIn}
      disabled={loading}
      style={{
        backgroundColor: '#ffcdd6',
        color: 'black',
        padding: '12px 24px',
        borderRadius: '12px',
        fontWeight: 'bold',
        fontSize: '16px',
        border: 'none',
        width: '100%',
        marginTop: '12px',
      }}
    >
      {loading ? 'Підключення...' : 'Увійти через MetaMask'}
    </button>
  );
}
