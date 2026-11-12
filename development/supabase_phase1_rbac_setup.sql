-- ============================================================================
-- PALMNEX SMARTPALM & PALMNEXREADS — SUPABASE RBAC & PRIVATE USER STORAGE
-- Supabase Project: https://dkafzakyeuehvpkkhdsa.supabase.co
--
-- STORAGE & ACCESS RULES:
-- 1. Per-User Private Storage (`storage_<username>`):
--    Even within the same company, every client user gets their OWN isolated
--    storage group so they cannot see each other's maps or progress:
--      • adminbenta1@palmnex.com.my    -> storage_adminbenta1
--      • adminbenta2@palmnex.com.my    -> storage_adminbenta2
--      • adminachijaya1@palmnex.com.my -> storage_adminachijaya1
-- 2. Palmnex Master Admin (`storage_all` + Tier 'C'):
--      • admin1@palmnex.com.my
--      • adminpalmnex1@palmnex.com.my, adminpalmnex2@palmnex.com.my, etc.
--      • Or any user in `public.profiles` with `company_code = 'palmnex'` and `access_tier = 'C'`
--      -> Assigned `storage_all` (can view/manage ALL users' maps and progress).
-- 3. Access Tiers (Completely Hidden UI for restricted modules):
--      • Tier 'A' (Standard Only)       : ['home', 'standard']
--                                         (Comprehensive, PalmNexReaDS, KPSM hidden)
--      • Tier 'B' (Comprehensive+ReaDS) : ['home', 'comprehensive', 'palmnexreads']
--                                         (Standard, KPSM hidden)
--      • Tier 'C' (Full Access / Admin) : ['home', 'comprehensive', 'standard', 'palmnexreads', 'kpsm']
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Helper: Resolve Allowed Modules for Tier A, B, or C
CREATE OR REPLACE FUNCTION public.get_modules_for_tier(p_tier TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    CASE UPPER(TRIM(COALESCE(p_tier, 'A')))
        WHEN 'A' THEN
            RETURN ARRAY['home', 'standard'];
        WHEN 'B' THEN
            RETURN ARRAY['home', 'comprehensive', 'palmnexreads'];
        WHEN 'C' THEN
            RETURN ARRAY['home', 'comprehensive', 'standard', 'palmnexreads', 'kpsm'];
        ELSE
            RETURN ARRAY['home', 'standard'];
    END CASE;
END;
$$;

-- 2. Helper: Auto-extract company code from any username / email
--    e.g. 'adminbenta1@palmnex.com.my'   -> 'benta'
--         'adminpalmnex1@palmnex.com.my' -> 'palmnex'
--         'admin1@palmnex.com.my'        -> 'palmnex'
CREATE OR REPLACE FUNCTION public.extract_company_code(p_email_or_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_user TEXT;
    v_match TEXT[];
BEGIN
    v_user := LOWER(TRIM(SPLIT_PART(COALESCE(p_email_or_username, ''), '@', 1)));

    IF v_user IN ('admin', 'admin1', 'superadmin', 'palmnex') OR v_user LIKE 'adminpalmnex%' THEN
        RETURN 'palmnex';
    END IF;

    v_match := regexp_match(v_user, '^admin([a-z0-9_]+?)[0-9]*$');
    IF v_match IS NOT NULL AND v_match[1] IS NOT NULL AND v_match[1] <> '' THEN
        RETURN v_match[1];
    END IF;

    v_match := regexp_match(v_user, '^([a-z_]+?)[0-9]+$');
    IF v_match IS NOT NULL AND v_match[1] IS NOT NULL AND v_match[1] <> '' THEN
        RETURN v_match[1];
    END IF;

    RETURN COALESCE(NULLIF(v_user, ''), 'palmnex');
END;
$$;

-- 3. Helper: Resolve per-user private storage (`storage_<username>`) vs Master Admin (`storage_all`)
CREATE OR REPLACE FUNCTION public.resolve_user_storage_group(p_username TEXT, p_company_code TEXT, p_tier TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_clean_user TEXT := LOWER(TRIM(SPLIT_PART(COALESCE(p_username, ''), '@', 1)));
    v_clean_comp TEXT := LOWER(TRIM(COALESCE(p_company_code, '')));
    v_clean_tier TEXT := UPPER(TRIM(COALESCE(p_tier, 'A')));
BEGIN
    IF v_clean_comp = 'palmnex' AND v_clean_tier = 'C' THEN
        RETURN 'storage_all';
    END IF;
    IF v_clean_user IN ('admin', 'admin1', 'superadmin') OR v_clean_user LIKE 'adminpalmnex%' THEN
        RETURN 'storage_all';
    END IF;
    RETURN 'storage_' || COALESCE(NULLIF(v_clean_user, ''), 'default');
END;
$$;

-- 4. Create / Upgrade `public.profiles` Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT,
    email TEXT,
    full_name TEXT,
    company_code TEXT NOT NULL DEFAULT 'palmnex',
    company_name TEXT NOT NULL DEFAULT 'Palmnex Sdn Bhd',
    estate_company TEXT NOT NULL DEFAULT 'Palmnex Sdn Bhd',
    access_tier TEXT NOT NULL DEFAULT 'A',
    allowed_modules TEXT[] NOT NULL DEFAULT ARRAY['home', 'standard'],
    storage_group TEXT NOT NULL DEFAULT 'storage_default',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_code TEXT NOT NULL DEFAULT 'palmnex';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_name TEXT NOT NULL DEFAULT 'Palmnex Sdn Bhd';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS estate_company TEXT NOT NULL DEFAULT 'Palmnex Sdn Bhd';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS access_tier TEXT NOT NULL DEFAULT 'A';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_modules TEXT[] NOT NULL DEFAULT ARRAY['home', 'standard'];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS storage_group TEXT NOT NULL DEFAULT 'storage_default';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile or Admin reads all" ON public.profiles;
CREATE POLICY "Users can read own profile or Admin reads all"
ON public.profiles FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

CREATE OR REPLACE VIEW public.user_access_profiles AS
SELECT
    id,
    username,
    email,
    company_code,
    company_name,
    access_tier,
    allowed_modules,
    storage_group,
    created_at,
    updated_at
FROM public.profiles
ORDER BY company_code, username;

-- 5. Automatic Triggers for Manual User Creation & Table Editor Edits
CREATE OR REPLACE FUNCTION public.sync_profile_tier_and_storage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    NEW.username := LOWER(TRIM(COALESCE(NULLIF(NEW.username, ''), SPLIT_PART(NEW.email, '@', 1))));
    IF NEW.email IS NULL OR NEW.email = '' THEN
        NEW.email := NEW.username || '@palmnex.com.my';
    END IF;

    -- Auto-detect company_code if inserting or if username changed
    IF TG_OP = 'INSERT' OR (OLD.username IS DISTINCT FROM NEW.username AND NEW.company_code IS NOT DISTINCT FROM OLD.company_code) THEN
        NEW.company_code := public.extract_company_code(NEW.username);
        IF NEW.company_code = 'palmnex' THEN
            NEW.company_name := 'Palmnex Sdn Bhd';
            NEW.access_tier := 'C';
        ELSIF NEW.company_name IS NULL OR NEW.company_name = '' OR NEW.company_name = 'Palmnex Sdn Bhd' THEN
            NEW.company_name := UPPER(NEW.company_code);
        END IF;
    ELSE
        NEW.company_code := LOWER(TRIM(COALESCE(NULLIF(NEW.company_code, ''), public.extract_company_code(NEW.username))));
    END IF;

    NEW.access_tier := UPPER(TRIM(COALESCE(NEW.access_tier, CASE WHEN NEW.company_code = 'palmnex' THEN 'C' ELSE 'A' END)));
    NEW.allowed_modules := public.get_modules_for_tier(NEW.access_tier);

    -- Per-user private storage (`storage_<username>`), or `storage_all` for Palmnex Master Admin
    NEW.storage_group := public.resolve_user_storage_group(NEW.username, NEW.company_code, NEW.access_tier);

    IF NEW.company_name IS NOT NULL AND NEW.company_name <> '' THEN
        NEW.estate_company := NEW.company_name;
    END IF;

    NEW.updated_at := NOW();

    -- Sync back to auth.users metadata
    UPDATE auth.users
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'username', NEW.username,
        'company_code', NEW.company_code,
        'company_name', NEW.company_name,
        'estate_company', NEW.estate_company,
        'access_tier', NEW.access_tier,
        'allowed_modules', NEW.allowed_modules,
        'storage_group', NEW.storage_group
    )
    WHERE id = NEW.id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_tier_updated ON public.profiles;
CREATE TRIGGER on_profile_tier_updated
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_tier_and_storage();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_username TEXT;
    v_company_code TEXT;
    v_company_name TEXT;
    v_tier TEXT;
    v_storage TEXT;
BEGIN
    v_username := LOWER(TRIM(COALESCE(
        NEW.raw_user_meta_data->>'username',
        SPLIT_PART(NEW.email, '@', 1)
    )));
    v_company_code := LOWER(TRIM(COALESCE(
        NEW.raw_user_meta_data->>'company_code',
        public.extract_company_code(v_username)
    )));
    v_company_name := COALESCE(
        NEW.raw_user_meta_data->>'company_name',
        NEW.raw_user_meta_data->>'estate_company',
        CASE
            WHEN v_company_code = 'palmnex' THEN 'Palmnex Sdn Bhd'
            ELSE UPPER(v_company_code)
        END
    );
    v_tier := UPPER(TRIM(COALESCE(
        NEW.raw_user_meta_data->>'access_tier',
        CASE WHEN v_company_code = 'palmnex' THEN 'C' ELSE 'A' END
    )));
    v_storage := public.resolve_user_storage_group(v_username, v_company_code, v_tier);

    INSERT INTO public.profiles (
        id,
        username,
        email,
        full_name,
        company_code,
        company_name,
        estate_company,
        access_tier,
        allowed_modules,
        storage_group
    ) VALUES (
        NEW.id,
        v_username,
        LOWER(NEW.email),
        COALESCE(NEW.raw_user_meta_data->>'full_name', v_username),
        v_company_code,
        v_company_name,
        v_company_name,
        v_tier,
        public.get_modules_for_tier(v_tier),
        v_storage
    )
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        company_code = EXCLUDED.company_code,
        storage_group = EXCLUDED.storage_group,
        updated_at = NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill & update all existing users in `public.profiles` to use per-user private storage (`storage_<username>`)
INSERT INTO public.profiles (
    id,
    username,
    email,
    full_name,
    company_code,
    company_name,
    estate_company,
    access_tier,
    allowed_modules,
    storage_group
)
SELECT
    u.id,
    LOWER(SPLIT_PART(u.email, '@', 1)) AS username,
    LOWER(u.email) AS email,
    COALESCE(u.raw_user_meta_data->>'full_name', SPLIT_PART(u.email, '@', 1)) AS full_name,
    public.extract_company_code(u.email) AS company_code,
    CASE
        WHEN public.extract_company_code(u.email) = 'palmnex' THEN 'Palmnex Sdn Bhd'
        ELSE UPPER(public.extract_company_code(u.email))
    END AS company_name,
    CASE
        WHEN public.extract_company_code(u.email) = 'palmnex' THEN 'Palmnex Sdn Bhd'
        ELSE UPPER(public.extract_company_code(u.email))
    END AS estate_company,
    CASE
        WHEN public.extract_company_code(u.email) = 'palmnex' THEN 'C'
        ELSE COALESCE(u.raw_user_meta_data->>'access_tier', 'A')
    END AS access_tier,
    public.get_modules_for_tier(
        CASE
            WHEN public.extract_company_code(u.email) = 'palmnex' THEN 'C'
            ELSE COALESCE(u.raw_user_meta_data->>'access_tier', 'A')
        END
    ) AS allowed_modules,
    public.resolve_user_storage_group(
        LOWER(SPLIT_PART(u.email, '@', 1)),
        public.extract_company_code(u.email),
        CASE
            WHEN public.extract_company_code(u.email) = 'palmnex' THEN 'C'
            ELSE COALESCE(u.raw_user_meta_data->>'access_tier', 'A')
        END
    ) AS storage_group
FROM auth.users u
WHERE u.email IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
    storage_group = public.resolve_user_storage_group(EXCLUDED.username, public.profiles.company_code, public.profiles.access_tier),
    updated_at = NOW();

-- 6. Private User Storage Tables (`prediction_runs` & `company_custom_maps`)
CREATE TABLE IF NOT EXISTS public.prediction_runs (
    folder_name TEXT PRIMARY KEY,
    shp_key TEXT,
    estate_name TEXT,
    acquisition_date TEXT,
    year INT,
    month INT,
    timestamp TIMESTAMPTZ,
    total_blocks INT,
    bounds JSONB,
    block_summary JSONB,
    overlays JSONB,
    company_code TEXT NOT NULL DEFAULT 'palmnex',
    storage_group TEXT NOT NULL DEFAULT 'storage_all',
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.prediction_runs ADD COLUMN IF NOT EXISTS company_code TEXT NOT NULL DEFAULT 'palmnex';
ALTER TABLE public.prediction_runs ADD COLUMN IF NOT EXISTS storage_group TEXT NOT NULL DEFAULT 'storage_all';
ALTER TABLE public.prediction_runs ADD COLUMN IF NOT EXISTS created_by TEXT;

CREATE INDEX IF NOT EXISTS idx_prediction_runs_storage_group ON public.prediction_runs(storage_group);

CREATE TABLE IF NOT EXISTS public.company_custom_maps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_key TEXT NOT NULL,
    map_name TEXT NOT NULL,
    company_code TEXT NOT NULL,
    storage_group TEXT NOT NULL,
    geojson_data JSONB NOT NULL,
    uploaded_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (storage_group, map_key)
);

CREATE INDEX IF NOT EXISTS idx_company_custom_maps_storage ON public.company_custom_maps(storage_group);

ALTER TABLE public.company_custom_maps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read write company custom maps" ON public.company_custom_maps;
CREATE POLICY "Allow read write company custom maps"
ON public.company_custom_maps FOR ALL
USING (true)
WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-storage', 'company-storage', true)
ON CONFLICT (id) DO NOTHING;

-- Show current users and their per-user storage profiles:
SELECT username, email, company_code, company_name, access_tier, allowed_modules, storage_group
FROM public.profiles
ORDER BY company_code, username;
