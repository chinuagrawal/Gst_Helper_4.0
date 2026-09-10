export const STATE_TO_POS = {
  'JAMMU AND KASHMIR': '01',
  'JAMMU & KASHMIR': '01',
  'HIMACHAL PRADESH': '02',
  'PUNJAB': '03',
  'CHANDIGARH': '04',
  'UTTARAKHAND': '05',
  'UTTARANCHAL': '05',
  'HARYANA': '06',
  'DELHI': '07',
  'RAJASTHAN': '08',
  'UTTAR PRADESH': '09',
  'BIHAR': '10',
  'SIKKIM': '11',
  'ARUNACHAL PRADESH': '12',
  'NAGALAND': '13',
  'MANIPUR': '14',
  'MIZORAM': '15',
  'TRIPURA': '16',
  'MEGHALAYA': '17',
  'ASSAM': '18',
  'WEST BENGAL': '19',
  'JHARKHAND': '20',
  'ODISHA': '21',
  'ORISSA': '21',
  'CHATTISGARH': '22',
  'CHHATTISGARH': '22',
  'MADHYA PRADESH': '23',
  'GUJARAT': '24',
  'DAMAN AND DIU': '25',
  'DAMAN & DIU': '25',
  'DADRA AND NAGAR HAVELI': '26',
  'DADRA & NAGAR HAVELI': '26',
  'MAHARASHTRA': '27',
  'ANDHRA PRADESH (OLD)': '28',
  'KARNATAKA': '29',
  'GOA': '30',
  'LAKSHADWEEP': '31',
  'KERALA': '32',
  'TAMIL NADU': '33',
  'PUDUCHERRY': '34',
  'PONDICHERRY': '34',
  'ANDAMAN AND NICOBAR ISLANDS': '35',
  'ANDAMAN & NICOBAR ISLANDS': '35',
  'TELANGANA': '36',
  'ANDHRA PRADESH': '37',
  'LADAKH': '38',
};

export const POS_TO_STATE = Object.fromEntries(
  Object.entries(STATE_TO_POS).map(([k, v]) => [v, k])
);

function normalize(s) {
  return (s || '').toString().trim().toUpperCase();
}

export function getPOS(stateName) {
  const norm = normalize(stateName);
  if (STATE_TO_POS[norm]) return STATE_TO_POS[norm];
  for (const k of Object.keys(STATE_TO_POS)) {
    if (norm.includes(k) || k.includes(norm)) return STATE_TO_POS[k];
  }
  return null;
}

export function toNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

export function r2(v) {
  return Math.round(v * 100) / 100;
}

export function mapHSN_UQC(hsn_code) {
  if (hsn_code === '392401') {
    return { hsn_sc: '392490', uqc: 'PAC' };
  }
  return { hsn_sc: hsn_code, uqc: 'PCS' };
}

export function transformETIN(ecoGstin, sellerStateCode) {
  if (!ecoGstin || ecoGstin.length < 15) return ecoGstin;
  return sellerStateCode + ecoGstin.slice(2);
}

export function buildFP(month, year) {
  const mm = String(month).padStart(2, '0');
  const yy = String(year).slice(-4);
  return `${mm}${yy}`;
}
