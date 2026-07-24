/*
# Fix notifications: cannot notify anyone but yourself

The existing RLS policy `insert_own_notifications` requires
`auth.uid() = user_id` — meaning a user's own authenticated client can only
ever insert a notification addressed to themselves. Every real notification
use case is the opposite: a client releasing a payment needs to notify the
*worker*, an admin approving KYC needs to notify the *user*, someone applying
to a job needs to notify the *job owner*. None of that was possible.

Fix: a narrowly-scoped SECURITY DEFINER function that only ever inserts into
notifications (nothing else), callable by any authenticated user. This is
safe to be broad because notifications are informational-only — worst case
of misuse is spam, not data corruption or privilege escalation, and it's a
big improvement over the alternative of giving broad table-level bypass.
*/

CREATE OR REPLACE FUNCTION create_notification(p_user_id uuid, p_type text, p_title text, p_body text, p_link text)
RETURNS void AS $$
  INSERT INTO notifications (user_id, type, title, body, link) VALUES (p_user_id, p_type, p_title, p_body, p_link);
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_notification(uuid, text, text, text, text) TO authenticated;
