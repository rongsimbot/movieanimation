-- ──────────────────────────────────────────────────────────────
-- MovieAnimation: Stripe Subscription Tables
-- Adds stripe_customer_id to users, creates user_subscriptions
-- ──────────────────────────────────────────────────────────────

-- Add Stripe customer ID to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer
  ON users(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- User subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_customer_id     VARCHAR(255) NOT NULL,
  status          VARCHAR(50) NOT NULL DEFAULT 'incomplete',
  plan_id         VARCHAR(100),
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
  ON user_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON user_subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
  ON user_subscriptions(stripe_customer_id);
