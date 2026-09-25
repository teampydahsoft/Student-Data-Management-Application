export const formatCollegeName = (str) => {
  if (!str) return "Pydah College of Pharmacy";
  const trimmed = String(str).trim();
  if (trimmed === trimmed.toUpperCase()) {
    return trimmed
      .toLowerCase()
      .split(/\s+/)
      .map((word) => {
        if (word === 'of' || word === 'and' || word === '&') return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }
  return trimmed;
};

export const COLLEGES = {
  pharmacy: {
    name: "Pydah College of Pharmacy",
    website: "",
    logo: "/logo.png",
    address: "Kakinada - 533003",
    contact: ""
  },
  engineering: {
    name: "Pydah College of Engineering",
    website: "",
    logo: "/logo.png",
    address: "Kakinada - 533003",
    contact: ""
  },
  degree: {
    name: "Pydah VRT Degree College",
    website: "",
    logo: "/logo.png",
    address: "Kakinada - 533003",
    contact: ""
  }
};

export const DEFAULT_COLLEGE = COLLEGES.pharmacy;

/**
 * Resolves full college metadata (name, website, logo, address, contact)
 * dynamically from college prop, student object, or college name string.
 */
export const resolveCollegeDetails = (collegeProp, studentProp = {}) => {
  const colObj = (typeof collegeProp === 'object' && collegeProp !== null) ? collegeProp : {};
  const studObj = (typeof studentProp === 'object' && studentProp !== null) ? studentProp : {};

  const rawName =
    colObj.name ||
    colObj.collegeName ||
    colObj.college_name ||
    (typeof collegeProp === 'string' ? collegeProp : '') ||
    studObj.collegeName ||
    studObj.college_name ||
    studObj.college ||
    '';

  const nameLower = rawName.toLowerCase();
  const pinNo = String(
    studObj.pinNo ||
    studObj.pin_no ||
    studObj.admission_number ||
    studObj.admission_no ||
    ''
  ).toLowerCase();

  let matchedKey = 'pharmacy';
  if (nameLower.includes('engineering') || pinNo.startsWith('pce') || nameLower.includes('pce')) {
    matchedKey = 'engineering';
  } else if (nameLower.includes('degree') || nameLower.includes('vrt') || pinNo.startsWith('pvc') || nameLower.includes('pvc')) {
    matchedKey = 'degree';
  } else if (nameLower.includes('pharmacy') || pinNo.startsWith('pcp') || nameLower.includes('pcp')) {
    matchedKey = 'pharmacy';
  }

  const preset = COLLEGES[matchedKey] || DEFAULT_COLLEGE;

  const resolvedName = rawName ? formatCollegeName(rawName) : preset.name;
  const resolvedWebsite =
    colObj.website ||
    colObj.websiteUrl ||
    colObj.site ||
    studObj.website ||
    studObj.websiteUrl ||
    preset.website ||
    '';

  const resolvedLogo =
    colObj.logo ||
    colObj.logoUrl ||
    colObj.logo_url ||
    studObj.logo ||
    preset.logo;

  const resolvedAddress =
    colObj.address ||
    studObj.college_address ||
    preset.address;

  const resolvedContact =
    colObj.contact ||
    colObj.phone ||
    studObj.college_contact ||
    studObj.collegeContact ||
    preset.contact ||
    '';

  return {
    name: resolvedName,
    website: resolvedWebsite,
    logo: resolvedLogo,
    address: resolvedAddress,
    contact: resolvedContact,
  };
};

