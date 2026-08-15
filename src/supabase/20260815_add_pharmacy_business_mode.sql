-- PostgreSQL requires a committed transaction before a newly-added enum value
-- can be referenced by a subsequent migration.
ALTER TYPE public.business_mode_type ADD VALUE IF NOT EXISTS 'pharmacy';
