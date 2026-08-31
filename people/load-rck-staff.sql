-- =====================================================================
-- RCK People — load the RCK employees from "Staff List and Tracking.xlsx"
--
-- Taken from the "Update" sheet of
--   HRandStaffManagement / Shared Documents / Staff List and Tracking.xlsx
-- as it stood on 16 August 2026. Only people on an Employee or
-- Employee - Casual contract are here — labour hire (Pacific, Cellwatch,
-- Standup, agencies) and subcontractors are not, and can be added the
-- same way once their companies exist.
--
-- Run it AFTER supabase-schema.sql, in Supabase -> SQL Editor.
-- Running it twice is harmless: every row carries a fixed id and any
-- clash is ignored, so nobody is duplicated and nothing already edited
-- in the app is overwritten.
--
-- WHAT IS DELIBERATELY NOT HERE
--   * Licence classes. The spreadsheet writes them as "1F", "1L", "2L",
--     "1R" and so on, where the letter is the licence stage on some rows
--     and an endorsement on others — "1F, F" being the giveaway. Guessing
--     would put wrong classes into a compliance record, so each licence
--     carries its expiry date and the original wording in Conditions, and
--     the classes are left for someone to tick off against the card.
--   * Start dates. The spreadsheet does not have them, so length of
--     service will read as blank until they are filled in.
--   * First aid, ConstructSafe, inductions and competencies. Those
--     columns are mostly empty and their headings do not line up
--     reliably with the few values that are there.
-- =====================================================================

insert into staff
  (id, first_name, last_name, preferred_name, worker_type, role, crew,
   date_of_birth, status, email)
values
  ('10cb2d38-12a7-5106-b5e8-a1e4a411b242', 'Misi', 'Misi', null, 'rck', 'Labourer', 'civil', null, 'active', 'misionesaints@gmail.com'),
  ('575f789b-e389-5865-9f0f-58287efcb7d1', 'Barry', 'Tahitahi', null, 'rck', 'Operator', 'civil', null, 'active', 'barrytahitahi@gmail.com'),
  ('336d23d5-051f-5885-8cba-b44ec0b43936', 'Noel', 'Webster', null, 'rck', 'Asphalt & Traffic Supervisor', 'yellow', '2000-08-21', 'active', 'noel.webster75@gmail.com'),
  ('9c5072ed-c675-5d21-a161-e3afbd039d89', 'Hamesh', 'Dewandran', 'Hamo', 'rck', 'Foreman', 'yellow', '1995-07-11', 'active', 'hdewandran@gmail.com'),
  ('2fadf847-072d-5fbb-8caa-be3da2fb0d35', 'Etuate', 'Torombau', 'Eddie', 'rck', 'Paver / Operator', 'yellow', '1996-02-23', 'active', 'eddielangstontee@gmail.com'),
  ('d1884653-7ac8-5fae-aa78-584fe523a9c8', 'Caleb', 'Cunningham', null, 'rck', 'Labourer', 'yellow', '1998-12-11', 'active', 'kingig@hotmail.co.uk'),
  ('338bee4e-497d-5376-8c87-dd3c6f9144b6', 'Teancum', 'McCarthy', null, 'rck', 'QA', 'yellow', '2000-09-09', 'active', 'teancum.mccarthy@gmail.com'),
  ('936effa0-77bf-5cd9-a47c-3e2dd9143139', 'Jason', 'Harper', 'Geeza', 'rck', 'Operator', 'yellow', '1967-08-14', 'active', 'harperj2010@myyahoo.com'),
  ('1c7651b0-0dca-531b-99fb-56e6ac6904e8', 'John', 'Tuilata', null, 'rck', 'STMS', 'yellow', null, 'active', 'john.tuilata@outlook.com'),
  ('e2f99107-33b3-5ac1-89cd-b30dfbcd5cd1', 'Taliu', 'Tupotu', null, 'rck', 'Labourer', 'yellow', null, 'active', 'taliu1610@gmail.com'),
  ('ec4258ee-b228-5b49-8535-0077e6165049', 'Michael', 'Briones', null, 'rck', 'Operator', 'yellow', '1986-11-26', 'active', 'michael26briones@gmail.com'),
  ('cea76b9e-79a8-51db-a29c-0a86dc178a73', 'Isaiah', 'Tavita Palu Salu', null, 'rck', 'Operator', 'yellow', '1997-03-16', 'active', 'isaiahsalu159@gmail.com'),
  ('2522bac5-2539-53af-9a67-90df121a8224', 'Tiepa', 'Bluegum', null, 'rck', 'Supervisor', 'green', null, 'active', 'teps.b@xtra.co.nz'),
  ('b655a25d-90ab-55f9-acee-c1a1783bd142', 'Hokioromai', 'Dunn', 'Hoki', 'rck', 'Foreman', 'green', '2005-08-09', 'active', 'hokioramaid@gmail.com'),
  ('e4302072-9e40-5dc4-b099-0d62725827f1', 'Byers', 'Beazley', null, 'rck', 'Labour', 'green', '1954-03-16', 'active', 'byersbeazley1@gmail.com'),
  ('2ec39a88-09ee-5ec2-a59a-2fbeda56bcff', 'Rowell', 'Porras', null, 'rck', 'Labourer / linemarking', 'green', null, 'active', 'porrasrv24@gmail.com'),
  ('416bc7c9-b4be-53f5-91bf-be94bb37fe34', 'Kris', 'Finnie', null, 'rck', 'Labourer', 'green', null, 'active', 'kfinnie6@gmail.com'),
  ('ddbdab61-a338-5261-89e7-7c7bc63d36d4', 'Lyndon', 'Wan', null, 'rck', 'Operations Lead', 'office', null, 'active', 'lyndon@rcknz.co.nz'),
  ('35dd4f20-48c9-5e4e-bc68-6459a2c3d95c', 'Robin', 'Cunningham', null, 'rck', 'Financial Controller', 'office', null, 'active', 'info@rcknz.co.nz'),
  ('31a8ee57-eedf-57e5-b3e5-4b5de1c03049', 'Clint', 'Cunningham', null, 'rck', 'Director', 'office', null, 'active', 'clint@rcknz.co.nz'),
  ('0727b5ab-09d8-5e27-8dd9-2f47e8815058', 'Shyamal', 'Shah', 'Sam', 'rck', 'Commercial Lead', 'office', null, 'active', 'sam@rcknz.co.nz'),
  ('24732355-9425-59d8-8ec2-9172a0e50bb7', 'Diane', 'Fuiava', null, 'rck', 'HR & Office', 'office', null, 'active', 'diane@rcknz.co.nz'),
  ('d5d42840-ca37-5a07-acd9-67d524a74958', 'Priyamal', 'Samaratunga', null, 'rck', 'Graduate Engineer', 'office', null, 'active', 'pri@rcknz.co.nz'),
  ('8b560ec8-3ec7-5864-81ef-c62805f10919', 'Robbie', 'Otene', null, 'rck', 'Transport Driver', 'transport', null, 'active', 'robbiemotene@gmail.com'),
  ('e2cbf47b-8bca-589b-81b3-c6e7baaae9ce', 'Ave', 'Likou', null, 'rck', 'Transport Driver', 'transport', null, 'active', 'soloavenue@outlook.co.nz'),
  ('3f29c4f8-254c-553b-b659-f0d377239c92', 'Jason', 'Peters', null, 'rck', 'Driver', 'transport', null, 'active', '22jcp22@gmail.com'),
  ('b32cdf78-d067-5331-a8fe-6ae491809453', 'Jay Lord', 'Rebadulla', null, 'rck', 'Driver', 'transport', null, 'active', 'jaylordrevadulla@yahoo.com'),
  ('47b0d4cf-e6df-5223-9c0a-3d2afb35103e', 'Mil Ian John', 'Bibaoco', null, 'rck', 'Workshop Team Leader', 'yard', null, 'active', 'mijbibaoco17@gmail.com'),
  ('0d8bdf06-47ab-55f4-9e53-d7f61d3d89b3', 'Sebastian', 'Cunningham', null, 'rck', 'Yard Member', 'yard', null, 'active', null),
  ('a9973c8a-8b56-504f-a8f6-087a1a206345', 'Ryda', 'Davis', null, 'rck', 'Yard Member', 'yard', null, 'active', 'rydastevendavis@gmail.com'),
  ('393d67e7-d14b-55d9-b185-b9a043f34a71', 'Rafael', 'Sugdon', null, 'rck', 'Builder', 'yard', null, 'active', 'rafael1274@yahoo.com'),
  ('fb75a7dc-b232-5c42-81aa-e5aad33e65e2', 'Wennie', 'Bantad', null, 'rck', 'Builder', 'yard', null, 'active', 'bantadmay@gmail.com'),
  ('dfb6ef3a-1f6e-54b7-8918-dbceaa986cd8', 'John', 'Harding', null, 'rck', 'STMS', 'stms', null, 'active', 'johnhardingyt1@gmail.com'),
  ('8b67f737-5173-5e4f-a5bd-668326956794', 'Sandor', 'Drugon', null, 'rck', 'STMS', 'stms', null, 'active', 'Mr.sandordrugan@gmail.com'),
  ('c9b19189-d931-56eb-844c-f3149e06d7a0', 'Silivelio', 'Sanele', 'Leo', 'rck', 'Traffic Controller', 'stms', null, 'active', 'siliveliosanele@gmail.com'),
  ('1277f9c5-554c-5cde-83fc-ebd2320edf71', 'Grechelle', 'Porras', null, 'rck', 'Traffic Controller', 'stms', null, 'active', 'grechellemaep@gmail.com'),
  ('9b12e09a-acf4-5d3c-8fd6-041bf6b78e5f', 'Eiven', null, null, 'rck', 'Labourer', 'watercare', null, 'active', null),
  ('fdc72446-6bfa-50d6-950e-5d0e9dd99dc8', 'Davanto', 'Loto''aniu', null, 'rck', 'Labourer', null, null, 'finished', null),
  ('97b5ba6b-cd8b-5c0e-80d5-9951108b4e77', 'Lynaire', 'Barnett', null, 'rck', 'QA', null, null, 'finished', null)
on conflict (id) do nothing;

insert into profile_sections (id, staff_id, section_key, data)
values
  ('1d518f94-07ed-5835-af43-715a8a977a67', '10cb2d38-12a7-5106-b5e8-a1e4a411b242', 'contract', '{"role": "Labourer", "pay_rate": "27.00", "pay_unit": "hourly"}'::jsonb),
  ('969dff60-a152-5b1d-8940-c4abd860f2d7', '10cb2d38-12a7-5106-b5e8-a1e4a411b242', 'licence', '{"expires_on": "2032-01-15", "conditions": "From the staff spreadsheet: 1L 15/01/2032"}'::jsonb),
  ('a983dbb5-2443-59e6-b44b-d34632b1fe07', '10cb2d38-12a7-5106-b5e8-a1e4a411b242', 'safety', '{"sitesafe_number": "1096403"}'::jsonb),
  ('bcca38f4-bdd2-566e-a8fa-31ffb02efc4d', '575f789b-e389-5865-9f0f-58287efcb7d1', 'contract', '{"role": "Operator", "pay_rate": "32.00", "pay_unit": "hourly"}'::jsonb),
  ('a38e8ccf-386d-5de5-a5c5-7e8640b5271f', '575f789b-e389-5865-9f0f-58287efcb7d1', 'licence', '{"expires_on": "2028-09-06", "conditions": "From the staff spreadsheet: 1,2,4 06/09/2028", "endorsements": ["W", "T", "R"]}'::jsonb),
  ('c1fe8f67-044d-5fa3-9c2f-2d74a1c6ff36', '575f789b-e389-5865-9f0f-58287efcb7d1', 'safety', '{"sitesafe_number": "1096404"}'::jsonb),
  ('d1c968da-61b5-5474-8a75-9b4eee8f66b3', '336d23d5-051f-5885-8cba-b44ec0b43936', 'contract', '{"role": "Asphalt & Traffic Supervisor", "pay_rate": "38.00", "pay_unit": "hourly"}'::jsonb),
  ('85c11b96-4267-5b57-9c67-0aa1bb5275ed', '336d23d5-051f-5885-8cba-b44ec0b43936', 'licence', '{"expires_on": "2030-08-10", "conditions": "From the staff spreadsheet: 1, D 10/08/2030", "endorsements": ["W", "T", "R"]}'::jsonb),
  ('ec6ac496-9854-5081-9987-34bbc1a3aaa5', '336d23d5-051f-5885-8cba-b44ec0b43936', 'safety', '{"sitesafe_number": "738949"}'::jsonb),
  ('d01946c2-e902-5fdd-82a4-dd1fb292f3a2', '9c5072ed-c675-5d21-a161-e3afbd039d89', 'contract', '{"role": "Foreman", "pay_rate": "34.50", "pay_unit": "hourly"}'::jsonb),
  ('bcbafe06-4f5e-5d6c-a61a-4fd8ffb71ca5', '9c5072ed-c675-5d21-a161-e3afbd039d89', 'licence', '{"expires_on": "2031-07-12", "conditions": "From the staff spreadsheet: 1F 12/07/2031", "endorsements": ["W", "T", "R"]}'::jsonb),
  ('24378d31-866c-59ab-979b-505ec42b2d6c', '9c5072ed-c675-5d21-a161-e3afbd039d89', 'safety', '{"sitesafe_number": "1074635"}'::jsonb),
  ('cbd6d3a5-dd6d-59e4-ad55-7ce786986d9b', '2fadf847-072d-5fbb-8caa-be3da2fb0d35', 'contract', '{"role": "Paver / Operator", "pay_rate": "34.50", "pay_unit": "hourly"}'::jsonb),
  ('e05a872b-c728-53ca-bff6-e8fead6d5bce', '2fadf847-072d-5fbb-8caa-be3da2fb0d35', 'licence', '{"expires_on": "2034-09-06", "conditions": "From the staff spreadsheet: 1, 2L 06/09/2034", "endorsements": ["W", "T", "R"]}'::jsonb),
  ('711f76e7-2d1c-58f9-b83e-a6217898cb44', '2fadf847-072d-5fbb-8caa-be3da2fb0d35', 'safety', '{"sitesafe_number": "1074637"}'::jsonb),
  ('d9242ed5-c737-59f8-8dbf-a34e19640593', 'd1884653-7ac8-5fae-aa78-584fe523a9c8', 'contract', '{"role": "Labourer", "pay_rate": "34.00", "pay_unit": "hourly"}'::jsonb),
  ('ef752aa4-0d29-5323-9375-1dcd9122caf7', 'd1884653-7ac8-5fae-aa78-584fe523a9c8', 'licence', '{"expires_on": "2031-12-08", "conditions": "From the staff spreadsheet: 1R 8/12/2031"}'::jsonb),
  ('d79f566d-1766-5294-80c4-b857fadc28f5', '338bee4e-497d-5376-8c87-dd3c6f9144b6', 'contract', '{"role": "QA", "pay_rate": "32.00", "pay_unit": "hourly"}'::jsonb),
  ('e3506c0e-7895-5004-bef8-be3969956cc3', '338bee4e-497d-5376-8c87-dd3c6f9144b6', 'licence', '{"expires_on": "2028-06-11", "conditions": "From the staff spreadsheet: 1F 11/06/2028"}'::jsonb),
  ('0fabde14-a94d-5efa-ad37-38ea5f64b672', '338bee4e-497d-5376-8c87-dd3c6f9144b6', 'safety', '{"sitesafe_number": "1084073"}'::jsonb),
  ('d8df38b1-2e71-53be-90b0-f09711361f28', '936effa0-77bf-5cd9-a47c-3e2dd9143139', 'contract', '{"role": "Operator", "pay_unit": "hourly"}'::jsonb),
  ('1dab4566-0904-5e3e-a02c-4dcefa7d0101', '936effa0-77bf-5cd9-a47c-3e2dd9143139', 'licence', '{"expires_on": "2032-12-28", "conditions": "From the staff spreadsheet: 1,2,4,6 28/12/2032", "endorsements": ["W", "T", "R"]}'::jsonb),
  ('6e2fc6a5-fb81-5955-a2fb-67426ff55605', '936effa0-77bf-5cd9-a47c-3e2dd9143139', 'safety', '{"sitesafe_number": "242618"}'::jsonb),
  ('d7c7a00e-f2a8-519a-8c96-fa27f5eda616', '1c7651b0-0dca-531b-99fb-56e6ac6904e8', 'contract', '{"role": "STMS", "pay_rate": "32.00", "pay_unit": "hourly"}'::jsonb),
  ('53368b9b-75a7-5656-96c7-6c5b8770632d', 'e2f99107-33b3-5ac1-89cd-b30dfbcd5cd1', 'contract', '{"role": "Labourer", "pay_rate": "32.00", "pay_unit": "hourly"}'::jsonb),
  ('41e6ddb1-e2e3-5609-9e45-818641625688', 'e2f99107-33b3-5ac1-89cd-b30dfbcd5cd1', 'licence', '{"expires_on": "2034-10-06", "conditions": "From the staff spreadsheet: 1L 06/10/2034"}'::jsonb),
  ('3d4acd86-f457-5367-a05f-9d3768765c05', 'e2f99107-33b3-5ac1-89cd-b30dfbcd5cd1', 'safety', '{"sitesafe_number": "797916"}'::jsonb),
  ('b767c9d0-4fb0-59a3-b09a-51cefa77596e', 'ec4258ee-b228-5b49-8535-0077e6165049', 'contract', '{"role": "Operator", "pay_rate": "34.00", "pay_unit": "hourly"}'::jsonb),
  ('b59b5b8c-7c19-5cae-8f21-dfd771bd2c73', 'ec4258ee-b228-5b49-8535-0077e6165049', 'licence', '{"expires_on": "2034-05-30", "conditions": "From the staff spreadsheet: 1F 30/05/2034", "endorsements": ["W", "T", "R"]}'::jsonb),
  ('bfe46ac4-3a74-519a-8a35-90b14749a027', 'ec4258ee-b228-5b49-8535-0077e6165049', 'safety', '{"sitesafe_number": "1096528"}'::jsonb),
  ('3c515ff8-e0a5-5a35-bd36-f7d4d1ca16fd', 'cea76b9e-79a8-51db-a29c-0a86dc178a73', 'contract', '{"role": "Operator", "pay_unit": "hourly"}'::jsonb),
  ('a26e101b-f7f1-53dc-81f3-e2a6e98364d9', 'cea76b9e-79a8-51db-a29c-0a86dc178a73', 'licence', '{"expires_on": "2035-04-10", "conditions": "From the staff spreadsheet: 1, 2 10/04/2035", "endorsements": ["W", "T", "R"]}'::jsonb),
  ('e006b679-25b0-589f-bd96-4e436a329991', '2522bac5-2539-53af-9a67-90df121a8224', 'contract', '{"role": "Supervisor", "pay_unit": "salary"}'::jsonb),
  ('b1de3fe8-a97b-58bb-a063-426162496abf', '2522bac5-2539-53af-9a67-90df121a8224', 'licence', '{"expires_on": "2027-10-30", "conditions": "From the staff spreadsheet: AUD License 30/10/27"}'::jsonb),
  ('bec219e0-207a-5c37-80e1-204470f5984f', '2522bac5-2539-53af-9a67-90df121a8224', 'safety', '{"sitesafe_number": "1024487"}'::jsonb),
  ('78c218d4-c8ae-5b10-bac7-0b688e86de2b', 'b655a25d-90ab-55f9-acee-c1a1783bd142', 'contract', '{"role": "Foreman", "pay_rate": "35.00", "pay_unit": "hourly"}'::jsonb),
  ('ae9c8f2c-ecbe-5510-a73b-776da65667dd', 'b655a25d-90ab-55f9-acee-c1a1783bd142', 'safety', '{"sitesafe_number": "1084076"}'::jsonb),
  ('0311c5ef-66b5-5a29-b3a2-842be9217afa', 'e4302072-9e40-5dc4-b099-0d62725827f1', 'contract', '{"role": "Labour", "pay_unit": "hourly"}'::jsonb),
  ('8910d5f5-1e61-5d64-9e48-21ba222202bb', 'e4302072-9e40-5dc4-b099-0d62725827f1', 'licence', '{"expires_on": "2029-03-16", "conditions": "From the staff spreadsheet: 1F, F 16/03/2029", "endorsements": ["W", "T", "R"]}'::jsonb),
  ('7535f15e-9720-5584-8abc-8c7c6e4c5d7f', '2ec39a88-09ee-5ec2-a59a-2fbeda56bcff', 'contract', '{"role": "Labourer / linemarking", "pay_rate": "30.00", "pay_unit": "hourly"}'::jsonb),
  ('35b96fff-952d-5396-84b2-a7aaa725799a', '2ec39a88-09ee-5ec2-a59a-2fbeda56bcff', 'licence', '{"expires_on": "2035-11-12", "conditions": "From the staff spreadsheet: 1F 12/11/2035"}'::jsonb),
  ('e3fce780-fe45-5855-88ef-7cac43b2f2f7', '2ec39a88-09ee-5ec2-a59a-2fbeda56bcff', 'safety', '{"sitesafe_number": "1084078"}'::jsonb),
  ('ff5bf583-a761-510d-81c2-11b6a5cdee0c', '416bc7c9-b4be-53f5-91bf-be94bb37fe34', 'contract', '{"role": "Labourer", "pay_rate": "30.00", "pay_unit": "hourly"}'::jsonb),
  ('e0d30a12-6aa1-5ae6-8d3e-fe0446111755', '416bc7c9-b4be-53f5-91bf-be94bb37fe34', 'licence', '{"expires_on": "2035-10-28", "conditions": "From the staff spreadsheet: 1,2, D, F 28/10/2035", "endorsements": ["W", "T", "R"]}'::jsonb),
  ('9c49c8f5-27c2-5051-970d-fa41b8916fa1', '416bc7c9-b4be-53f5-91bf-be94bb37fe34', 'safety', '{"sitesafe_number": "1092263"}'::jsonb),
  ('193079e9-a84c-53d9-b2ed-34d3a2c84e5b', 'ddbdab61-a338-5261-89e7-7c7bc63d36d4', 'contract', '{"role": "Operations Lead", "pay_rate": "95000.00", "pay_unit": "salary"}'::jsonb),
  ('2e39340a-f3da-5723-899e-f1421abe3cc1', '35dd4f20-48c9-5e4e-bc68-6459a2c3d95c', 'contract', '{"role": "Financial Controller", "pay_rate": "2.50", "pay_unit": "hourly"}'::jsonb),
  ('e2d6da72-2337-54a2-bd22-17ac19e06ad2', '31a8ee57-eedf-57e5-b3e5-4b5de1c03049', 'contract', '{"role": "Director", "pay_rate": "1.00", "pay_unit": "salary"}'::jsonb),
  ('553b7a59-2880-5380-af83-c3674aab122c', '0727b5ab-09d8-5e27-8dd9-2f47e8815058', 'contract', '{"role": "Commercial Lead", "pay_unit": "salary"}'::jsonb),
  ('6aaebf04-5ab8-5a56-93c7-563c22dc6ce6', '0727b5ab-09d8-5e27-8dd9-2f47e8815058', 'safety', '{"sitesafe_number": "735117"}'::jsonb),
  ('c1b4b7b7-d14a-5cfd-b2eb-c062a25f6170', '24732355-9425-59d8-8ec2-9172a0e50bb7', 'contract', '{"role": "HR & Office", "pay_unit": "salary"}'::jsonb),
  ('9cfb1ee1-35df-568f-99f7-71633640d5d8', '24732355-9425-59d8-8ec2-9172a0e50bb7', 'safety', '{"sitesafe_number": "1075049"}'::jsonb),
  ('b4a108ff-a4f3-573a-8637-e236a7b3c51a', 'd5d42840-ca37-5a07-acd9-67d524a74958', 'contract', '{"role": "Graduate Engineer", "pay_rate": "35.00", "pay_unit": "hourly"}'::jsonb),
  ('4e6462bd-907d-5ee1-83b2-42a072247ce3', '8b560ec8-3ec7-5864-81ef-c62805f10919', 'contract', '{"role": "Transport Driver", "pay_unit": "hourly"}'::jsonb),
  ('9e1577a3-aaee-5471-b619-39631b17de49', '8b560ec8-3ec7-5864-81ef-c62805f10919', 'licence', '{"expires_on": "2036-10-10", "conditions": "From the staff spreadsheet: 1,2,3,4,5, F 10/10/2036", "endorsements": ["W", "T", "R"]}'::jsonb),
  ('2c85c9a5-ac0b-5d1b-b2ec-556de9e88b83', '8b560ec8-3ec7-5864-81ef-c62805f10919', 'safety', '{"sitesafe_number": "1084081"}'::jsonb),
  ('cc2e0a21-e417-5c5f-8669-317df547b9ad', 'e2cbf47b-8bca-589b-81b3-c6e7baaae9ce', 'contract', '{"role": "Transport Driver", "pay_rate": "36.50", "pay_unit": "hourly"}'::jsonb),
  ('8c535105-17c5-53da-a50e-2f4e341bf2bf', 'e2cbf47b-8bca-589b-81b3-c6e7baaae9ce', 'licence', '{"expires_on": "2032-07-06", "conditions": "From the staff spreadsheet: 1, 2, 3, 4,5,6.D, F 06/07/2032 · WTR recorded as \"WTR 0607/2032\"", "endorsements": ["W", "T", "R"]}'::jsonb),
  ('c2c9ac14-5481-5c15-b643-e2835aa21768', 'e2cbf47b-8bca-589b-81b3-c6e7baaae9ce', 'safety', '{"sitesafe_number": "1074619"}'::jsonb),
  ('3ae8a53a-a309-59f5-a26f-c7169f380c80', '3f29c4f8-254c-553b-b659-f0d377239c92', 'contract', '{"role": "Driver", "pay_unit": "hourly"}'::jsonb),
  ('ffece877-b310-5c2a-a961-9a10852721e3', '3f29c4f8-254c-553b-b659-f0d377239c92', 'licence', '{"expires_on": "2036-02-23", "conditions": "From the staff spreadsheet: 1,2,3,4,5,6R,D, F 23/02/2036", "endorsements": ["W", "T", "R"]}'::jsonb),
  ('5ae24a7b-0a08-5aca-adcd-5d64892b59ae', 'b32cdf78-d067-5331-a8fe-6ae491809453', 'contract', '{"role": "Driver", "pay_rate": "35.00", "pay_unit": "hourly"}'::jsonb),
  ('5108e75f-4327-5613-bdac-16381eedeaf8', 'b32cdf78-d067-5331-a8fe-6ae491809453', 'licence', '{"expires_on": "2030-12-11", "conditions": "From the staff spreadsheet: 1,2,3,4,5,F 11/12/2030", "endorsements": ["W", "T", "R"]}'::jsonb),
  ('99bec5d0-6c7d-59fb-b8e6-a8e0bc0fba2c', '47b0d4cf-e6df-5223-9c0a-3d2afb35103e', 'contract', '{"role": "Workshop Team Leader", "pay_rate": "32.00", "pay_unit": "hourly"}'::jsonb),
  ('f26ba626-3882-5286-a35c-351402ba9e77', '47b0d4cf-e6df-5223-9c0a-3d2afb35103e', 'licence', '{"expires_on": "2035-03-22", "conditions": "From the staff spreadsheet: 1F 22/03/2035"}'::jsonb),
  ('b9447328-75ce-5c6f-b28a-dc1d66f6d8c9', '47b0d4cf-e6df-5223-9c0a-3d2afb35103e', 'safety', '{"sitesafe_number": "1018643"}'::jsonb),
  ('a3c23364-cfdd-598a-bf40-7305357e10d0', '0d8bdf06-47ab-55f4-9e53-d7f61d3d89b3', 'contract', '{"role": "Yard Member", "pay_rate": "24.00", "pay_unit": "hourly"}'::jsonb),
  ('43d4f126-8f47-5028-a856-fae021336a3d', '0d8bdf06-47ab-55f4-9e53-d7f61d3d89b3', 'licence', '{"expires_on": "2036-06-10", "conditions": "From the staff spreadsheet: 1R 10/06/2036"}'::jsonb),
  ('5754a557-cb1c-559e-a82a-ffdb608b8b18', 'a9973c8a-8b56-504f-a8f6-087a1a206345', 'contract', '{"role": "Yard Member", "pay_rate": "23.00", "pay_unit": "hourly"}'::jsonb),
  ('8730547e-f456-5bd6-991d-50afe704f08e', 'a9973c8a-8b56-504f-a8f6-087a1a206345', 'licence', '{"expires_on": "2036-04-14", "conditions": "From the staff spreadsheet: 1L, 6L 14/04/2036"}'::jsonb),
  ('f821809a-a524-5860-b1fc-3ffb75306555', '393d67e7-d14b-55d9-b185-b9a043f34a71', 'contract', '{"role": "Builder", "pay_rate": "38.00", "pay_unit": "hourly"}'::jsonb),
  ('88390b74-4394-58ac-8729-8da44c9e7cda', '393d67e7-d14b-55d9-b185-b9a043f34a71', 'licence', '{"expires_on": "2030-11-17", "conditions": "From the staff spreadsheet: 1F 17/11/2030"}'::jsonb),
  ('1a5608dc-6f37-5609-8def-daf13c250760', 'fb75a7dc-b232-5c42-81aa-e5aad33e65e2', 'contract', '{"role": "Builder", "pay_rate": "38.00", "pay_unit": "hourly"}'::jsonb),
  ('423ee732-26d1-57c8-b555-ffe208ac8bf5', 'dfb6ef3a-1f6e-54b7-8918-dbceaa986cd8', 'contract', '{"role": "STMS", "pay_rate": "34.00", "pay_unit": "hourly"}'::jsonb),
  ('bef47556-6ff7-5c80-8936-53be6918dcb8', 'dfb6ef3a-1f6e-54b7-8918-dbceaa986cd8', 'licence', '{"expires_on": "2031-06-11", "conditions": "From the staff spreadsheet: 1F 11/06/2031"}'::jsonb),
  ('2618b97d-32a1-5e83-a1f8-fd5fb33889c9', 'dfb6ef3a-1f6e-54b7-8918-dbceaa986cd8', 'safety', '{"sitesafe_number": "914087"}'::jsonb),
  ('7640303f-904b-59d0-b909-28c184668b17', '8b67f737-5173-5e4f-a5bd-668326956794', 'contract', '{"role": "STMS", "pay_rate": "32.00", "pay_unit": "hourly"}'::jsonb),
  ('bcc263ea-4285-5248-8b7e-9923024a2bef', '8b67f737-5173-5e4f-a5bd-668326956794', 'licence', '{"expires_on": "2030-12-05", "conditions": "From the staff spreadsheet: 1,2,4L 05/12/2030"}'::jsonb),
  ('d8fcd5ca-7aef-5a40-9e78-1daf2ad03c80', '8b67f737-5173-5e4f-a5bd-668326956794', 'safety', '{"sitesafe_number": "1095609"}'::jsonb),
  ('405b78ca-16d4-53ff-ae0d-2d95ce5ea806', 'c9b19189-d931-56eb-844c-f3149e06d7a0', 'contract', '{"role": "Traffic Controller", "pay_rate": "29.00", "pay_unit": "hourly"}'::jsonb),
  ('5f8e56af-7b87-50cb-8c85-e6ce199cb0f7', 'c9b19189-d931-56eb-844c-f3149e06d7a0', 'licence', '{"expires_on": "2030-07-06", "conditions": "From the staff spreadsheet: 1F 06/07/2030"}'::jsonb),
  ('da33e4ac-334a-55eb-a7c4-ebbe772d8a70', '1277f9c5-554c-5cde-83fc-ebd2320edf71', 'contract', '{"role": "Traffic Controller", "pay_rate": "28.00", "pay_unit": "hourly"}'::jsonb),
  ('c86cffc8-f16c-5630-b1d1-3de3cbd47bcf', '1277f9c5-554c-5cde-83fc-ebd2320edf71', 'licence', '{"expires_on": "2036-02-23", "conditions": "From the staff spreadsheet: 1F 23/02/2036"}'::jsonb),
  ('535fdfd9-b047-5587-bcfa-8439ea3e0369', '1277f9c5-554c-5cde-83fc-ebd2320edf71', 'safety', '{"sitesafe_number": "1095607"}'::jsonb),
  ('72cef713-ed74-5f9b-80f4-7f622434f6d5', '9b12e09a-acf4-5d3c-8fd6-041bf6b78e5f', 'contract', '{"role": "Labourer", "pay_rate": "30.00", "pay_unit": "hourly"}'::jsonb),
  ('956b9f14-f56a-5167-bef4-4d1e9b3385bf', 'fdc72446-6bfa-50d6-950e-5d0e9dd99dc8', 'contract', '{"role": "Labourer", "pay_rate": "29.00", "pay_unit": "hourly"}'::jsonb),
  ('f508ce47-2f56-5f0d-b4f8-ffec7a605562', '97b5ba6b-cd8b-5c0e-80d5-9951108b4e77', 'contract', '{"role": "QA", "pay_rate": "25.00", "pay_unit": "hourly"}'::jsonb)
on conflict do nothing;

-- How it went:
select count(*) || ' people on the books' as loaded from staff;
