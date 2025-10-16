// src/components/SignInWithWallet.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { connectWallet } from "../lib/providerBridge";
import "./SignInWithWallet.css";

export default function SignInWithWallet() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    setLoading(true);
    try {
      const walletAddress = await connectWallet();
      if (!walletAddress) throw new Error("Не вдалося зчитати адресу гаманця");

      // Перевіряємо, чи є профіль
      const { data: existingProfile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("wallet_address", walletAddress)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (!existingProfile) {
        const { error: insertError } = await supabase.from("profiles").insert([
          { wallet_address: walletAddress },
        ]);
        if (insertError) throw insertError;
      }

      navigate("/my-orders");
    } catch (err: any) {
      alert("Помилка: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signin-wallet-container">
      <h1 className="signin-title">Увійти через MetaMask</h1>

      <button className="signin-wallet-button" onClick={handleLogin} disabled={loading}>
        {loading ? "З'єднання..." : "🦊 Увійти через MetaMask"}
      </button>

      <button className="back-to-bmb-button" onClick={() => navigate("/my-orders")}>
        ⬅️ Повернутись у BMB
      </button>
    </div>
  );
}
