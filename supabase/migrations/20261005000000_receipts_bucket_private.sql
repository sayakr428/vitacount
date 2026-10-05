-- The receipts bucket was created public by the upload action, which made every
-- uploaded receipt readable by anyone holding its URL regardless of the
-- tenant-folder storage policies. Private buckets enforce those policies.
update storage.buckets set public = false where id = 'receipts';
