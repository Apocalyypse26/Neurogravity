-- Final security fix with DROP IF EXISTS

-- Fix function search_path
ALTER FUNCTION public.init_profile() SET search_path = '';
ALTER FUNCTION public.consume_credit() SET search_path = '';
ALTER FUNCTION public.buy_credits(amount integer) SET search_path = '';

DO $$ BEGIN
  ALTER FUNCTION public.handle_new_user_profile() SET search_path = '';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Fix follows table RLS - drop all existing policies first
DROP POLICY IF EXISTS "Enable all for anon" ON public.follows;
DROP POLICY IF EXISTS "Authenticated users can view follows" ON public.follows;
DROP POLICY IF EXISTS "Users can follow" ON public.follows;
DROP POLICY IF EXISTS "Users can unfollow" ON public.follows;

CREATE POLICY "Authenticated users can view follows"
ON public.follows FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can follow"
ON public.follows FOR INSERT TO authenticated
WITH CHECK (auth.uid() = follower_user_id);

CREATE POLICY "Users can unfollow"
ON public.follows FOR DELETE TO authenticated
USING (auth.uid() = follower_user_id);

-- Fix logs table RLS
DROP POLICY IF EXISTS "Enable insert for anonymous bot" ON public.logs;
DROP POLICY IF EXISTS "Service role can manage logs" ON public.logs;

CREATE POLICY "Service role can manage logs"
ON public.logs FOR ALL TO service_role
USING (true) WITH CHECK (true);
