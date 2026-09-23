-- Adds "No Formal Education" as a selectable educational qualification.
ALTER TABLE employees DROP CONSTRAINT employees_educational_qualification_check;
ALTER TABLE employees ADD CONSTRAINT employees_educational_qualification_check
  CHECK (educational_qualification IN ('no_formal_education', 'below_matric', 'matriculation', 'intermediate', 'diploma_degree'));
