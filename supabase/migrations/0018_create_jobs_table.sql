-- Create jobs table for persistent job storage
-- This table stores analysis jobs that survive server restarts

CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL UNIQUE,
    upload_id UUID NOT NULL,
    user_id UUID NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
    file_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preprocessing', 'ocr_extracting', 'tribe_analyzing', 'mapping_scores', 'completed', 'failed')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    result JSONB,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);

-- Create index for faster lookups by upload_id
CREATE INDEX IF NOT EXISTS idx_jobs_upload_id ON public.jobs(upload_id);

-- Create index for faster lookups by status
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);

-- Create trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_jobs_updated_at
    BEFORE UPDATE ON public.jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on jobs table
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can view their own jobs
CREATE POLICY "Users can view own jobs"
ON public.jobs
FOR SELECT
USING (auth.uid() = user_id);

-- Create policy: Users can insert their own jobs
CREATE POLICY "Users can insert own jobs"
ON public.jobs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own jobs
CREATE POLICY "Users can update own jobs"
ON public.jobs
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create policy: Service role can manage all jobs
CREATE POLICY "Service role can manage all jobs"
ON public.jobs
FOR ALL
USING (auth.jwt()->>'role' = 'service_role')
WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Create function to clean up old completed/failed jobs (for scheduled maintenance)
CREATE OR REPLACE FUNCTION public.cleanup_old_jobs(max_age_hours integer DEFAULT 24)
RETURNS integer AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM public.jobs
    WHERE status IN ('completed', 'failed')
    AND updated_at < NOW() - (max_age_hours || ' hours')::interval;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
