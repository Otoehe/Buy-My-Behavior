/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import './ScenarioCard.css';

export type Status = 'draft' | 'active' | 'locked' | 'completed' | 'disputed';

export type Scenario = {
  id: string;
  title?: string | null;
  description?: string | null;
  amount: string | number;         // сума в USDT
  status?: Status;
  executor_wallet?: string | null; // гаманець виконавця (назва колонки може відрізнятися)
  created_at?: string;
  // ... інші ваші поля
};

type Props = {
  scenario: Scenario;
  onReserve?: () => void;       // НАТИСНЕННЯ «Забронювати ескроу кошти»
  onConfirmDone?: () => void;   // Підтвердити виконання
  onDispute?: () => void;       // Відкрити диспут
};

export default function ScenarioCard({
  scenario,
  onReserve,
  onConfirmDone,
  onDispute,
}: Props): JSX.Element {
  const usdt = typeof scenario.amount === 'string' ? scenario.amount : String(scenario.amount);

  return (
    <div className="scenario-card">
      <div className="scenario-head">
        <h3 className="scenario-title">{scenario.title ?? 'Сценарій'}</h3>
        <span className={`scenario-status status-${scenario.status || 'draft'}`}>
          {scenario.status || 'draft'}
        </span>
      </div>

      {scenario.description && <p className="scenario-desc">{scenario.description}</p>}

      <div className="scenario-row">
        <div className="scenario-amount">
          <span className="amount">{usdt}</span>
          <span className="currency">USDT</span>
        </div>
      </div>

      <div className="scenario-actions">
        {/* ГОЛОВНА КНОПКА — викликає MetaMask */}
        <button className="bmb-btn-primary" onClick={onReserve}>
          Забронювати ескроу кошти
        </button>

        <button className="bmb-btn" onClick={onConfirmDone}>
          Погодити угоду
        </button>

        <button className="bmb-btn-outline" onClick={onDispute}>
          Відкрити диспут
        </button>
      </div>
    </div>
  );
}
