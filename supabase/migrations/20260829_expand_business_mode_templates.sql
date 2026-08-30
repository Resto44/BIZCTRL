-- Canonical operating models used by tenant business templates.
-- Kept separate because PostgreSQL enum additions must commit before later
-- migrations reference the new values.

ALTER TYPE public.business_mode_type ADD VALUE IF NOT EXISTS 'cafe';
ALTER TYPE public.business_mode_type ADD VALUE IF NOT EXISTS 'warehouse';
ALTER TYPE public.business_mode_type ADD VALUE IF NOT EXISTS 'factory';
ALTER TYPE public.business_mode_type ADD VALUE IF NOT EXISTS 'clinic';
ALTER TYPE public.business_mode_type ADD VALUE IF NOT EXISTS 'wholesale';
ALTER TYPE public.business_mode_type ADD VALUE IF NOT EXISTS 'services';
ALTER TYPE public.business_mode_type ADD VALUE IF NOT EXISTS 'other';
