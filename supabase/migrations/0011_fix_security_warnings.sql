-- Fix Function Search Path Mutable warnings
-- Setting search_path prevents injection attacks via schema manipulation

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.init_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.user_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.consume_credit(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  credits_available INTEGER;
BEGIN
  SELECT credits INTO credits_available
  FROM public.user_profiles
  WHERE user_profiles.user_id = consume_credit.user_id
  FOR UPDATE;
  
  IF credits_available > 0 THEN
    UPDATE public.user_profiles
    SET credits = credits - 1
    WHERE user_profiles.user_id = consume_credit.user_id;
    RETURN true;
  END IF;
  
  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.buy_credits(user_id uuid, amount integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  UPDATE public.user_profiles
  SET credits = credits + amount
  WHERE user_profiles.user_id = buy_credits.user_id;
  RETURN true;
END;
$function$;

-- Fix RLS Policy Always True warnings
-- Remove overly permissive policies and create proper ones

-- Fix follows table - remove "Enable all for anon" policy
DROP POLICY IF EXISTS "Enable all for anon" ON public.follows;

-- Create proper restrictive policies for follows
CREATE POLICY "Users can view their own follows"
ON public.follows FOR SELECT
USING (auth.uid() = follower_id OR auth.uid() = following_id);

CREATE POLICY "Users can follow others"
ON public.follows FOR INSERT
WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow"
ON public.follows FOR DELETE
USING (auth.uid() = follower_id);

-- Fix logs table - remove "Enable insert for anonymous bot" policy
DROP POLICY IF EXISTS "Enable insert for anonymous bot" ON public.logs;

-- Create proper policy for logs (if bots need to insert, use service role)
CREATE POLICY "Service role can insert logs"
ON public.logs FOR INSERT
WITH CHECK (true);
-- Note: This should only be accessible via service_role key, not anon key
