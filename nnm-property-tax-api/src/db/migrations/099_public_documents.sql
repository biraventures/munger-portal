-- Public documents / reports published on the website by the
-- Commissioner. The file itself is stored in the row (bytea), same as
-- shop_agreement_documents - this app has no separate file storage.
-- is_published lets the Commissioner take a document off the public
-- site without deleting it.
CREATE TABLE public_documents (
  id             BIGSERIAL PRIMARY KEY,
  title          VARCHAR(300) NOT NULL,
  description    TEXT,
  category       VARCHAR(40) NOT NULL DEFAULT 'Other',
  document_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  file_name      VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(100) NOT NULL,
  file_size      INTEGER NOT NULL,
  file_data      BYTEA NOT NULL,
  is_published   BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by    VARCHAR(150) NOT NULL,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_public_documents_published ON public_documents (is_published, document_date DESC);
