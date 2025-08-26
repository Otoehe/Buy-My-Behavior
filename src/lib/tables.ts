// scenarios (рівно під твої поля)
export interface ScenarioRow {
  id: string;
  creator_id: string;
  executor_id: string;
  description: string | null;
  donation_amount_usdt: number | null;
  date: string | null;
  time: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  created_at: string | null;
  sender_id: string | null;
  receiver_id: string | null;
  is_agreed_by_customer: boolean | null;
  is_agreed_by_executor: boolean | null;
  is_confirmed_by_customer: boolean | null;
  is_confirmed_by_executor: boolean | null;
  execution_time: string | null;
  escrow_tx_hash: string | null;
  is_completed_by_executor: boolean | null;
  is_completed_by_customer: boolean | null;
  scenario_number_id: number | null; // int? у тебе схоже int4
  referrer_wallet: string | null;
  updated_at: string | null;
}

// behaviors (з ipfs_cid і двома новими прапорами)
export interface BehaviorRow {
  id: string;
  user_id: string | null;
  title: string | null;
  description: string | null;
  ipfs_cid: string | null;
  created_at: string | null;
  likes_count: number | null;
  author_avatar_url: string | null;
  author_id: string | null;
  dislikes_count: number | null;
  // нові поля з міграції:
  is_dispute_evidence?: boolean;
  dispute_id?: string | null;
}

// profiles (витяг із твоїх полів)
export interface ProfileRow {
  user_id: string;
  email: string | null;
  role: string | null;
  abilities: any | null;
  wallet: string | null;
  avatar_url: string | null;
  kyc_verified: boolean | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string | null;
  description: string | null;
  name: string | null;
  kyc_passed: boolean | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  kyc_completed: boolean | null;
  bio: string | null;
  referral_code: string | null;
  referred_by: string | null;
  story_url: string | null;
  referrer_wallet: string | null;
  avg_rating: number | null;
  rating_count: number | null;
}

// disputes / dispute_votes
export type DisputeStatus = 'open' | 'resolved' | 'cancelled';
export type DisputeWinner = 'executor' | 'customer' | null;
export type VoteChoice = 'executor' | 'customer';

export interface DisputeRow {
  id: string;
  scenario_id: string;
  initiator_user_id: string;
  executor_user_id: string;
  status: DisputeStatus;
  started_at: string;
  deadline_at: string;
  behavior_id: string | null;
  winner: DisputeWinner;
  resolution_tx_hash: string | null;
  resolved_at: string | null;
}

export interface DisputeVoteRow {
  id: string;
  dispute_id: string;
  voter_user_id: string;
  choice: VoteChoice;
  created_at: string;
}
