// State and UT portals are drawn from the Telangana State Web Directory and
// the National Portal of India. List exact hosts so discovery cannot fetch
// arbitrary URLs returned by the search provider.
const states = [
  ['Andhra Pradesh', 'ap.gov.in', 'gsws-nbm.ap.gov.in', 'nandyal.ap.gov.in'],
  ['Arunachal Pradesh', 'arunachalpradesh.gov.in'],
  ['Assam', 'assam.gov.in'],
  ['Bihar', 'state.bihar.gov.in'],
  ['Chhattisgarh', 'cgstate.gov.in'],
  ['Goa', 'goa.gov.in'],
  ['Gujarat', 'gujaratindia.gov.in'],
  ['Haryana', 'haryana.gov.in'],
  ['Himachal Pradesh', 'himachal.nic.in'],
  ['Jharkhand', 'jharkhand.gov.in'],
  ['Karnataka', 'karnataka.gov.in'],
  ['Kerala', 'kerala.gov.in'],
  ['Madhya Pradesh', 'mp.gov.in'],
  ['Maharashtra', 'maharashtra.gov.in'],
  ['Manipur', 'manipur.gov.in'],
  ['Meghalaya', 'meghalaya.gov.in'],
  ['Mizoram', 'mizoram.nic.in'],
  ['Nagaland', 'nagaland.gov.in'],
  ['Odisha', 'odisha.gov.in'],
  ['Punjab', 'punjab.gov.in'],
  ['Rajasthan', 'rajasthan.gov.in'],
  ['Sikkim', 'sikkim.gov.in'],
  ['Tamil Nadu', 'tn.gov.in'],
  ['Telangana', 'telangana.gov.in'],
  ['Tripura', 'tripura.gov.in'],
  ['Uttar Pradesh', 'up.gov.in'],
  ['Uttarakhand', 'uk.gov.in'],
  ['West Bengal', 'wb.gov.in'],
  ['Andaman and Nicobar Islands', 'andaman.gov.in'],
  ['Chandigarh', 'chandigarh.gov.in'],
  ['Dadra and Nagar Haveli and Daman and Diu', 'ddd.gov.in', 'dnh.gov.in', 'daman.nic.in'],
  ['Delhi', 'delhi.gov.in'],
  ['Jammu and Kashmir', 'jk.gov.in'],
  ['Ladakh', 'ladakh.gov.in'],
  ['Lakshadweep', 'lakshadweep.gov.in', 'lakshadweep.nic.in'],
  ['Puducherry', 'py.gov.in'],
] as const;

const central = [
  { host:'pmkisan.gov.in', issuer:'Department of Agriculture and Farmers Welfare', category:'Agriculture' },
  { host:'socialjustice.gov.in', issuer:'Ministry of Social Justice and Empowerment', category:'Social welfare' },
  { host:'pmay-urban.gov.in', issuer:'Ministry of Housing and Urban Affairs', category:'Housing' },
  { host:'pmayg.nic.in', issuer:'Ministry of Rural Development', category:'Housing' },
  { host:'labour.gov.in', issuer:'Ministry of Labour and Employment', category:'Employment' },
  { host:'nhm.gov.in', issuer:'National Health Mission', category:'Health' },
] as const;

export const searchPublishers = [
  ...central.map(publisher=>({...publisher, state:''})),
  ...states.flatMap(([state,...hosts])=>hosts.map(host=>({
    state, host, issuer:state+' government', category:'Other' as const,
  }))),
];

export function publisherForHost(host:string) {
  return searchPublishers.find(publisher=>publisher.host===host.replace(/^www\./,''));
}
