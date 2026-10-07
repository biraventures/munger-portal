-- Documents uploaded by the City Manager, Deputy Commissioner or an operator are
-- held for APSWMO approval before they appear on the public website. Documents
-- uploaded by the Commissioner or the APSWMO are published as before.
ALTER TABLE public_documents ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE public_documents ADD COLUMN IF NOT EXISTS uploaded_by_role TEXT;
ALTER TABLE public_documents ADD COLUMN IF NOT EXISTS uploaded_by_key TEXT;
ALTER TABLE public_documents ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE public_documents ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public_documents ADD COLUMN IF NOT EXISTS reject_reason TEXT;
ALTER TABLE public_documents DROP CONSTRAINT IF EXISTS public_documents_approval_status_check;
ALTER TABLE public_documents ADD CONSTRAINT public_documents_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));
