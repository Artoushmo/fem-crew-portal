-- Locks the portal was leaning on the browser for.
--
-- The screens check that a link starts with https and that an invoice is a
-- PDF under ten megabytes. The browser is not the only client, so the
-- database and the storage buckets now say the same thing themselves.

-- ---------------------------------------------------------------------------
-- A link is a link
-- ---------------------------------------------------------------------------

-- Anything that is rendered as an href. A javascript: scheme in one of these
-- is how one person's paste runs in another person's browser.
update public.assignments set maps_url = null
  where maps_url is not null and maps_url !~* '^https?://';
update public.assignments set gallery_link = null
  where gallery_link is not null and gallery_link !~* '^https?://';
update public.assignment_roles set delivery_link = null
  where delivery_link is not null and delivery_link !~* '^https?://';

alter table public.assignments
  add constraint assignments_maps_url_is_url
    check (maps_url is null or maps_url ~* '^https?://'),
  add constraint assignments_gallery_link_is_url
    check (gallery_link is null or gallery_link ~* '^https?://');

alter table public.assignment_roles
  add constraint assignment_roles_delivery_link_is_url
    check (delivery_link is null or delivery_link ~* '^https?://');

-- ---------------------------------------------------------------------------
-- A file is the kind of file it says
-- ---------------------------------------------------------------------------

-- The buckets enforce what the upload buttons only suggested. Agreements and
-- invoices are PDFs; a certificate may also be a photo of one; an avatar is
-- an image.
update storage.buckets
  set file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf']
  where id = 'agreements';

update storage.buckets
  set file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
  where id = 'credentials';

update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  where id = 'avatars';
