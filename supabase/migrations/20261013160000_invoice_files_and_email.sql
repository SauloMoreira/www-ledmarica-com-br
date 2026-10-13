-- Nota fiscal: anexar o PDF (DANFE) e o XML emitidos fora da plataforma e
-- enviar ao cliente por e-mail com os arquivos anexados.

-- Bucket privado. Sem policies em storage.objects para anon/authenticated:
-- só o servidor (service role, via server functions com requireAdmin) lê e
-- grava. O admin visualiza por URL assinada de curta duração.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoices',
  'invoices',
  false,
  5242880, -- 5 MB
  ARRAY['application/pdf', 'application/xml', 'text/xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_pdf_path text,
  ADD COLUMN IF NOT EXISTS invoice_xml_path text,
  ADD COLUMN IF NOT EXISTS invoice_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_email_sent_to text;
