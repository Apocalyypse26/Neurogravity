-- Fix all remaining security warnings

-- 1. Fix function search_path using ALTER FUNCTION
ALTER FUNCTION public.init_profile() SET search_path = '';
ALTER FUNCTION public.consume_credit(user_id uuid) SET search_path = '';
ALTER FUNCTION public.buy_credits(user_id uuid, amount integer) SET search_path = '';

-- 2. Fix RLS policies on follows table
DROP POLICY IF EXISTS "Enable all for anon" ON public.follows;

CREATE POLICY "Authenticated users can view follows"
ON public.follows FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can follow"
ON public.follows FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow"
ON public.follows FOR DELETE
TO authenticated
USING (auth.uid() = follower_id);

-- 3. Fix RLS policies on logs table
DROP POLICY IF EXISTS "Enable insert for anonymous bot" ON public.logs;

CREATE POLICY "Service role can manage logs"
ON public.logs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
