-- Fix all security warnings with correct schema

-- 1. Fix function search_path
ALTER FUNCTION public.init_profile() SET search_path = '';
ALTER FUNCTION public.consume_credit() SET search_path = '';

-- Fix buy_credits (takes only amount integer)
ALTER FUNCTION public.buy_credits(amount integer) SET search_path = '';

-- 2. Fix follows table RLS (columns: follower_user_id, target_username)
DROP POLICY IF EXISTS "Enable all for anon" ON public.follows;

CREATE POLICY "Authenticated users can view follows"
ON public.follows FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can follow"
ON public.follows FOR INSERT TO authenticated
WITH CHECK (auth.uid() = follower_user_id);

CREATE POLICY "Users can unfollow"
ON public.follows FOR DELETE TO authenticated
USING (auth.uid() = follower_user_id);

-- 3. Fix logs table RLS
DROP POLICY IF EXISTS "Enable insert for anonymous bot" ON public.logs;

CREATE POLICY "Service role can manage logs"
ON public.logs FOR ALL TO service_role
USING (true) WITH CHECK (true);
