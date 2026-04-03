-- Fix consume_credit to use auth.uid() internally
-- This is more secure: the user can't pass an arbitrary user_id from the client
-- The function now resolves the calling user from the JWT automatically

CREATE OR REPLACE FUNCTION public.consume_credit()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  credits_available INTEGER;
  calling_user UUID;
BEGIN
  -- Get the authenticated user from JWT
  calling_user := auth.uid();
  
  -- If no authenticated user, deny
  IF calling_user IS NULL THEN
    RETURN false;
  END IF;

  SELECT credits INTO credits_available
  FROM public.user_profiles
  WHERE user_profiles.user_id = calling_user
  FOR UPDATE;
  
  -- If no profile found or zero/null credits, deny
  IF credits_available IS NULL OR credits_available <= 0 THEN
    RETURN false;
  END IF;
  
  UPDATE public.user_profiles
  SET credits = credits - 1
  WHERE user_profiles.user_id = calling_user;
  
  RETURN true;
END;
$function$;

-- Also fix buy_credits to use auth.uid() internally for security
CREATE OR REPLACE FUNCTION public.buy_credits(amount integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  calling_user UUID;
BEGIN
  calling_user := auth.uid();
  
  IF calling_user IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.user_profiles
  SET credits = credits + amount
  WHERE user_profiles.user_id = calling_user;
  
  RETURN true;
END;
$function$;
