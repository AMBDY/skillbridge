/*
# Support Ticket System

A real ticketing system was in the original spec ("Support Center — manage
tickets, assign staff, priority levels, internal notes, close/reopen") and
didn't exist at all. This is a right-sized version: ticket creation +
threaded replies + status/priority + admin assignment. Internal-notes-only
visibility (staff-only comments invisible to the customer) is left out of
this pass — every message in a thread is visible to both the ticket owner
and admin, which covers the core use case.
*/

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "insert_own_ticket" ON support_tickets;
CREATE POLICY "insert_own_ticket" ON support_tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "read_own_ticket" ON support_tickets;
CREATE POLICY "read_own_ticket" ON support_tickets FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_all_tickets" ON support_tickets;
CREATE POLICY "admin_all_tickets" ON support_tickets FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "insert_own_ticket_message" ON support_ticket_messages;
CREATE POLICY "insert_own_ticket_message" ON support_ticket_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM support_tickets WHERE id = ticket_id AND user_id = auth.uid()) AND sender_id = auth.uid());
DROP POLICY IF EXISTS "read_own_ticket_message" ON support_ticket_messages;
CREATE POLICY "read_own_ticket_message" ON support_ticket_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM support_tickets WHERE id = ticket_id AND user_id = auth.uid()));
DROP POLICY IF EXISTS "admin_all_ticket_messages" ON support_ticket_messages;
CREATE POLICY "admin_all_ticket_messages" ON support_ticket_messages FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON support_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);
