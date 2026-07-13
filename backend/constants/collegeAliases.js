/**
 * Legacy college names that were renamed in the colleges table but may still
 * exist on student records. Maps old name -> current canonical name.
 */
const COLLEGE_LEGACY_ALIASES = {
  'Pydah Degree College': 'Pydah VRT Degree College'
};

module.exports = {
  COLLEGE_LEGACY_ALIASES
};
