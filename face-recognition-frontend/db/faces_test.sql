CREATE TABLE public.insightface_faces_test (
	id serial4 NOT NULL,
	employee_number text NOT NULL,
	employee_name text NOT NULL,
	image_path text NOT NULL,
	face_locations jsonb NULL,
	face_landmarks jsonb NULL,
	face_descriptors jsonb NULL,
	created_at timestamp DEFAULT now() NULL,
	CONSTRAINT employee_number_unique UNIQUE (employee_number),
	CONSTRAINT insightface_faces_test_pkey PRIMARY KEY (id)
);