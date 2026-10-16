-- Trade licence application: the agreement for the business premises - rental / lease agreement when rented, sale /
-- purchase deed when self-owned (allotment / rent agreement for a Nagar Nigam stall or shop).
ALTER TABLE trade_license_application_documents DROP CONSTRAINT IF EXISTS trade_license_application_documents_doc_type_check;
ALTER TABLE trade_license_application_documents ADD CONSTRAINT trade_license_application_documents_doc_type_check
  CHECK (doc_type IN ('holding_receipt', 'bpl_proof', 'gstr_3b', 'pan_applicant', 'pan_firm', 'shop_photo', 'premises_agreement'));
