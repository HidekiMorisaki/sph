import { readFileSync } from 'node:fs';
import { createCipheriv, randomBytes } from 'node:crypto';
import { CABINET_OFFICE_HOLIDAY_CSV_URL, OPM_HOLIDAY_ICS_URL, fetchHolidayData } from './holiday-source.mjs';

export const catalogFor = language => JSON.parse(readFileSync(new URL(`sample-data/${language}.json`, import.meta.url), 'utf8'));
const defaultRoles = JSON.parse(readFileSync(new URL('../src/lib/server/auth/default-role-permissions.json', import.meta.url), 'utf8'));
const granularOperations = JSON.parse(readFileSync(new URL('../src/lib/server/auth/granular-operations.json', import.meta.url), 'utf8'));
const branchScopedCodes = new Set([
 'employees.read', 'employees.manage', 'masters.read', 'branches.manage', 'assets.read', 'assets.manage',
 'assets.credentials.read', 'assets.credentials.write', 'calendars.read', 'calendars.assign',
 'employees.create', 'employees.update', 'employees.delete', 'employees.invite', 'branches.update', 'branches.delete',
 'rooms.create', 'rooms.update', 'rooms.delete', 'storage.create', 'storage.update', 'storage.delete',
 'assets.create', 'assets.update', 'assets.delete', 'assets.assign', 'assets.return',
 'assets.credentials.view', 'assets.credentials.update', 'assets.credentials.access',
 'financial.read', 'financial.update', 'financial.preview', 'financial.publish'
]);
const roleCodes = role => [...role.permissionCodes, ...granularOperations.filter(operation =>
 (!operation.systemOnly || role.key === 'system_administrator' || (role.key === 'branch_administrator' && ['branches.update', 'branches.delete'].includes(operation.code))) &&
 (Array.isArray(operation.prerequisite) ? operation.prerequisite : [operation.prerequisite]).some(code => role.permissionCodes.includes(code))
).map(operation => operation.code)];
const employmentKeys = ['Regular','Contract','Part Time','Temporary'];
export function employmentName(catalog, key) {
 const index = employmentKeys.indexOf(key);
 if (index < 0) throw new Error('Unsupported initial employment type.');
 return catalog.masters.employment_types[index].name;
}
// Names below are owned by this module and the bundled catalogs, never user SQL.
export async function insert(client, table, data) {
 const keys = Object.keys(data);
 if (![table,...keys].every(k => /^[a-z_]+$/.test(k))) throw new Error('Invalid internal sample field.');
 return (await client.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_,i) => '$'+(i+1)).join(',')}) RETURNING id`, Object.values(data))).rows[0].id;
}
export async function initializeRequiredData(client, catalog, input) {
 const roleCount = (await client.query('SELECT count(*)::int AS count FROM roles')).rows[0].count;
 if (roleCount === 0) {
  for (const table of ['permissions','permission_operations','role_permissions']) {
   if ((await client.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count) throw new Error('Incomplete permission configuration; initialization refused.');
  }
  const operations = [...new Set(defaultRoles.flatMap(roleCodes))];
  const permissions = new Map();
  for (let i=0;i<operations.length;i++) {
   const id = await insert(client,'permissions',{name:`Operation: ${operations[i]}`}); permissions.set(operations[i], id);
   await insert(client,'permission_operations',{operation:operations[i],permission_id:id});
  }
  if (catalog.roles.length !== defaultRoles.length) throw new Error('Initial role catalog does not match the default permission sets.');
  for (let i=0;i<defaultRoles.length;i++) {
   const role = defaultRoles[i];
   const id = await insert(client,'roles',{name:catalog.roles[i],default_key:role.key});
   for (const code of roleCodes(role)) await insert(client,'role_permissions',{role_id:id,permission_id:permissions.get(code),scope_type:role.key === 'branch_administrator' && branchScopedCodes.has(code) ? 'own_branch' : 'global'});
  }
 }
 const name = employmentName(catalog,input.employmentType);
 // Keep the existing English selection when provisioning a legacy database.
 const legacyType = await client.query('SELECT id FROM employment_types WHERE name=$1 AND deleted_at IS NULL',[input.employmentType]);
 const masterIds = await installMasters(client, catalog, input.displayLanguage, ['employment_types']);
 const index = catalog.masters.employment_types.findIndex(type => type.name === name);
 if (index < 0) throw new Error('Initial employment type is missing from the catalog.');
 return legacyType.rowCount && input.employmentType !== name ? legacyType.rows[0].id : masterIds.employment_types[index];
}

export async function assertSampleDatabaseEmpty(client) {
 const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename")).rows;
 for (const {tablename} of tables) {
  if (!/^[a-z_]+$/.test(tablename) || (await client.query(`SELECT EXISTS(SELECT 1 FROM ${tablename}) AS populated`)).rows[0].populated) {
   throw new Error('Samples require an empty database before initial configuration, including logically deleted rows.');
  }
 }
}

const itAssetMasterTables = ['it_asset_types','it_asset_statuses','manufacturers','cpu_types','operating_system_vendors','operating_systems'];
async function installMasters(client, catalog, displayLanguage, tables, reuseExisting = false) {
 const masterIds = {};
 const nameOrder = new Intl.Collator(displayLanguage);
 const masterName = row => row.name ?? `${row.vendor_name} ${row.product} ${row.version}${row.edition ? ` ${row.edition}` : ''}${row.architecture ? ` (${row.architecture})` : ''}`;
 for (const [table, rows] of Object.entries(catalog.masters).filter(([name]) => tables.includes(name))) {
  masterIds[table] = Array(rows.length);
  const ordered = rows.map((row, index) => ({row, index})).sort((left, right) =>
   nameOrder.compare(masterName(left.row), masterName(right.row)) || left.index - right.index);
  for (const [position, {row: source, index}] of ordered.entries()) {
   const row = {...source,sort_order:position+1};
   if (row.manufacturer_name) { row.manufacturer_id = masterIds.manufacturers[catalog.masters.manufacturers.findIndex(m => m.name === row.manufacturer_name)]; delete row.manufacturer_name; }
   if (table === 'operating_systems') {
    row.vendor_id = masterIds.operating_system_vendors[catalog.masters.operating_system_vendors.findIndex(v => v.name === row.vendor_name)];
    delete row.vendor_name;
    if (!row.vendor_id) throw new Error('Unknown sample OS vendor.');
   }
   if (table === 'employee_groups') row.department_id = masterIds.employment_departments[index];
   if (table === 'employment_types' || reuseExisting) {
    const found = table === 'operating_systems'
     ? await client.query('SELECT id,deleted_at FROM operating_systems WHERE vendor_id=$1 AND product=$2 AND version=$3 AND edition IS NOT DISTINCT FROM $4 AND architecture IS NOT DISTINCT FROM $5',[row.vendor_id,row.product,row.version,row.edition ?? null,row.architecture ?? null])
     : await client.query(`SELECT id,deleted_at FROM ${table} WHERE name=$1`,[row.name]);
    if (found.rowCount) {
     if (found.rows[0].deleted_at) throw new Error(`A required ${table} master is deleted; initialization refused.`);
     masterIds[table][index] = found.rows[0].id;
     if (!reuseExisting) await client.query('UPDATE employment_types SET sort_order=$2 WHERE id=$1',[found.rows[0].id,row.sort_order]);
     continue;
    }
   }
   masterIds[table][index] = await insert(client,table,row);
  }
 }
 return masterIds;
}
export const installRequiredItAssetMasters = (client, catalog, displayLanguage) =>
 installMasters(client, catalog, displayLanguage, itAssetMasterTables, true);

export async function installSamples(client, catalog, {adminId, branchId, displayLanguage}) {
 const today = (await client.query('SELECT CURRENT_DATE::text AS today')).rows[0].today;
 const year = Number(today.slice(0,4));
 const holidayImports = await Promise.all(['JP', 'US'].map(async countryCode => {
  try { return {holidays:await fetchHolidayData(countryCode, year),status:'success'}; }
  catch { return {holidays:[],status:'failed'}; }
 }));
 const date = (y,m=1,d=1) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
 const past = value => value > today ? today : value;
 const timestamp = value => value+'T00:00:00Z';
 const note = catalog.note;
 if (catalog.branches.length !== catalog.branchCities.length) throw new Error('Sample branch names and cities must match.');
 const nameOrder = new Intl.Collator(displayLanguage);
 const masterIds = await installMasters(client, catalog, displayLanguage, Object.keys(catalog.masters));
 const branches = [], storages = [];
 // The installer-created branch is one of the sample locations, including a custom name.
 // Older installer defaults used only the city; normalize those sample branches.
 await client.query('UPDATE branches SET name=$2 WHERE id=$1 AND name=$3',[branchId,catalog.branches[0],catalog.branchCities[0]]);
 const branchOrder = catalog.branches.map((name, index) => ({name, index})).sort((left, right) =>
  nameOrder.compare(left.name, right.name) || left.index - right.index);
 const roomOrder = catalog.roomNames.map((name, index) => ({name, index})).sort((left, right) =>
  nameOrder.compare(left.name, right.name) || left.index - right.index);
 const storageOrder = catalog.storageNames.map((name, index) => ({name, index})).sort((left, right) =>
  nameOrder.compare(left.name, right.name) || left.index - right.index);
 for (const [position, {index: b}] of branchOrder.entries()) {
  const id = b === 0 ? branchId : await insert(client,'branches',{name:catalog.branches[b]});
  branches[b] = id;
  await client.query('UPDATE branches SET sort_order=$2, opened_on=$3, city=$4, street_address=$5, building_name=$6, phone_number_1=$7, phone_number_1_label=$8, notes=$9 WHERE id=$1',[id,position+1,date(2000+b),catalog.branchCities[b],`${b+1} ${catalog.street}`,catalog.building,displayLanguage==='ja' ? `03-0000-${String(b).padStart(4,'0')}` : `+1-202-555-01${String(b).padStart(2,'0')}`,catalog.phoneLabel,note]);
  for (const [roomPosition, {index: r}] of roomOrder.entries()) {
   const room = await insert(client,'rooms',{branch_id:id,name:catalog.roomNames[r],sort_order:roomPosition+1,notes:note});
   for (const [storagePosition, {index: s}] of storageOrder.entries()) {
    storages[(b*catalog.roomNames.length+r)*catalog.storageNames.length+s] = {id:await insert(client,'storage',{branch_id:id,room_id:room,name:catalog.storageNames[s],sort_order:storagePosition+1,notes:note}),room,branchName:catalog.branches[b],roomName:catalog.roomNames[r],storageName:catalog.storageNames[s]};
   }
  }
 }
 // Financial samples use the install language's currency. A fixed seed keeps
 // the fictional monthly pattern reproducible while varying profit and loss.
 await insert(client,'financial_period_settings',{key:'main',basis:'calendar',fiscal_start_month:4});
 const financialCurrency=displayLanguage==='ja'?'JPY':'USD';
 const firstFinancialYear=2005,lastFinancialYear=2025;
 // Fictional rates keep the offline sample usable in both display currencies.
 // The source explicitly distinguishes them from Bank of Japan observations.
 for(let financialYear=firstFinancialYear;financialYear<=lastFinancialYear;financialYear++) for(let month=1;month<=12;month++) {
  await insert(client,'financial_exchange_rates',{
   month:date(financialYear,month),base_currency:'USD',quote_currency:'JPY',
   rate:(105+(financialYear-2016)*3+month*0.25).toFixed(8),source:'SAMPLE_DATA'
  });
 }
 for (let b=0;b<branches.length;b++) for (let financialYear=firstFinancialYear;financialYear<=lastFinancialYear;financialYear++) {
  let seed=(financialYear*1009+(b+1)*9176)>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
  const shuffledMonths=Array.from({length:12},(_,index)=>index+1);
  for (let i=shuffledMonths.length-1;i>0;i--) {
   const j=Math.floor(random()*(i+1));
   [shuffledMonths[i],shuffledMonths[j]]=[shuffledMonths[j],shuffledMonths[i]];
  }
  const lossMonths=new Set(shuffledMonths.slice(0,3+Math.floor(random()*3)));
  const financialMonths=[];
  for (let month=1;month<=12;month++) {
   const base=(financialCurrency==='JPY'?28000000:280000)*(1-b*0.28)*(1+(financialYear-2016)*0.025);
   const seasonal=1+0.08*Math.sin((month-1)*Math.PI/6);
   const revenue=Math.round(base*seasonal*(0.85+random()*0.3));
   const variableCost=Math.round(revenue*(0.34+random()*0.17));
   const grossProfit=revenue-variableCost;
   const fixedCost=Math.round(grossProfit*(lossMonths.has(month)?1.08+random()*0.42:0.52+random()*0.32));
   financialMonths.push({month,revenue,variableCost,fixedCost});
  }
  // Rotate annual losses and make every fifth year a loss across all branches,
  // so both branch and combined trends include deficit years.
  if((financialYear-firstFinancialYear)%5===0 || b===(financialYear-firstFinancialYear)%branches.length) {
   const annualGross=financialMonths.reduce((total,row)=>total+row.revenue-row.variableCost,0);
   const annualProfit=financialMonths.reduce((total,row)=>total+row.revenue-row.variableCost-row.fixedCost,0);
   const adjustment=Math.max(0,annualProfit+Math.max(1,Math.round(annualGross*0.04)));
   const lossRows=financialMonths.filter(row=>lossMonths.has(row.month));
   const perMonth=Math.floor(adjustment/lossRows.length);
   lossRows.forEach((row,index)=>{row.fixedCost+=perMonth+(index<adjustment%lossRows.length?1:0);});
  }
  for(const row of financialMonths) await insert(client,'financial_months',{
   branch_id:branches[b],month:date(financialYear,row.month),currency:financialCurrency,
   revenue:row.revenue,variable_cost:row.variableCost,fixed_cost:row.fixedCost
  });
  await insert(client,'financial_publications',{
   branch_id:branches[b],basis:'calendar',fiscal_start_month:4,year:financialYear,
   published:true,published_at:new Date()
  });
 }
 const calendar = await insert(client,'work_calendars',{name:catalog.calendar,calendar_year:year,country_code:'JP',description:note});
 const usCalendar = await insert(client,'work_calendars',{name:catalog.calendarUs,calendar_year:year,country_code:'US',description:note});
 for (const [index, countryCode] of ['JP', 'US'].entries()) {
  const sourceUrl = countryCode === 'JP' ? CABINET_OFFICE_HOLIDAY_CSV_URL : OPM_HOLIDAY_ICS_URL;
  for (const holiday of holidayImports[index].holidays) await insert(client,'calendar_date_attributes',{
   country_code:countryCode,calendar_date:holiday.dateKey,kind:'public_holiday',name:holiday.name,
   source:countryCode === 'JP' ? 'cabinet_office' : 'opm',source_url:sourceUrl
  });
  const importId = await insert(client,'calendar_holiday_imports',{
   country_code:countryCode,source_url:sourceUrl,range_start:date(year),range_end:date(year,12,31),
   imported_count:holidayImports[index].holidays.length,status:holidayImports[index].status
  });
  await insert(client,'audit_logs',{actor_id:adminId,action:holidayImports[index].status === 'success' ? 'import' : 'import_failed',resource:'calendar_holiday_import',resource_id:importId});
 }
 for (const calendarId of [calendar,usCalendar]) for (let m=1;m<=12;m++) for (let d=1;d<=2;d++) await insert(client,'work_calendar_days',{calendar_id:calendarId,work_date:date(year,m,d),entry_type:d===1?'working_day':'company_holiday',title:d===1?catalog.working:catalog.holiday,note});
 await insert(client,'external_links',{name:catalog.external,url:'https://intranet.example.test',sort_order:1});
 const roles = new Map((await client.query('SELECT id, default_key FROM roles WHERE deleted_at IS NULL')).rows.map(role => [role.default_key, role.id]));
 for (const key of ['system_administrator','server_administrator','business_administrator','branch_administrator','general_user']) {
  if (!roles.has(key)) throw new Error(`Required sample role is missing: ${key}`);
 }
 // The installer administrator is separate from these fictional sample employees.
 const branchRolePlans = branches.map(() => [
  'system_administrator',
  'server_administrator',
  'business_administrator','business_administrator',
  'branch_administrator','branch_administrator'
 ]);
 const branchEmployeeCounts = branches.map(() => 0);
 const employees = [];
 const history = async (table,subject,action,changes,at=today) => {
  const key = table === 'employee_change_history' ? 'employee_id':'asset_id';
  const id = await insert(client,table,{[key]:subject,actor_id:adminId,action,changes:JSON.stringify(changes),changed_at:timestamp(at)});
  await insert(client,'audit_logs',{actor_id:adminId,action:'sample_import',resource:table,resource_id:id,detail:JSON.stringify({sample:true,language:displayLanguage,simulatedAction:action})});
 };
 for (let i=0;i<360;i++) {
  const gender = ['female','male','unspecified'][i%3];
  const lastNameIndex = i % catalog.lastNames.length;
  const firstNameIndex = (i + Math.floor(i / catalog.lastNames.length) * 7) % 20;
  const firstName = (gender==='female'||gender==='unspecified'&&i%2===0 ? catalog.femaleNames:catalog.maleNames)[firstNameIndex];
  const lastName = catalog.lastNames[lastNameIndex];
  const ageGroup = Math.floor(i/3)%6;
  const ageBase = i>=288 ? 30+(i%32) : [19,20,30,40,50,60][ageGroup]+(ageGroup===0?0:Math.floor(i/18)%10);
  const birth = date(Math.max(1965,year-ageBase),i%12+1,i%27+1);
  const age = year-Number(birth.slice(0,4));
  const retired = i>=288 ? past(date(year-i%10,(i*5)%12+1,1)) : null;
  const hireYear = retired ? Number(retired.slice(0,4))-1-i%Math.max(1,age-30) : year-(i*7)%Math.max(1,Math.min(25,age-18));
  const hire = past(date(Math.max(Number(birth.slice(0,4))+18,hireYear),(i*7)%12+1,1));
  const deleted = i>=342 ? timestamp(today):null;
  const b = Math.floor(i/15)%branches.length, group=Math.floor(i/6)%3, position=Math.floor(i/18)%3, type=Math.floor(i/54)%4;
  const row = {employee_code:`SAMPLEEMP${String(i+1).padStart(6,'0')}`,first_name:firstName,last_name:lastName,
   birth_date:birth,gender,blood_type:['A','B','AB','O',null][i%5],email:`sample.employee.${i+1}@example.test`,hired_at:hire,retired_at:retired,
   employment_type_id:masterIds.employment_types[type],branch_id:branches[b],group_id:masterIds.employee_groups[group],work_calendar_id:calendar,
   city:catalog.branchCities[b],street_address:`${i+1} ${catalog.street}`,building_name:catalog.building,mobile_phone:displayLanguage==='ja'?`090-0000-${String(i+1).padStart(4,'0')}`:`+1-202-555-${String(100+i%100).padStart(4,'0')}`,
   middle_name:displayLanguage==='en'&&i%5===0 ? (gender==='female'?'Jane':'Lee'):null,
   name_kana:displayLanguage==='ja' ? `${catalog.lastNamesKana[lastNameIndex]} ${(gender==='female'||gender==='unspecified'&&i%2===0 ? catalog.femaleNamesKana:catalog.maleNamesKana)[firstNameIndex]}` : null,
   notes:note,deleted_at:deleted};
  const id = await insert(client,'employees',row); employees.push({id,firstName,lastName,hire,retired,deleted});
  await insert(client,'employee_settings',{employee_id:id,display_language:displayLanguage,time_zone:displayLanguage==='ja'?'Asia/Tokyo':'Europe/London'});
  await insert(client,'employee_departments',{employee_id:id,department_id:masterIds.employment_departments[group],is_primary:true});
  await insert(client,'employee_positions',{employee_id:id,position_id:masterIds.employment_positions[position],is_primary:true});
  if (i%4===0) {
   await insert(client,'employee_departments',{employee_id:id,department_id:masterIds.employment_departments[(group+1)%3],is_primary:false});
   await insert(client,'employee_positions',{employee_id:id,position_id:masterIds.employment_positions[(position+1)%3],is_primary:false});
  }
  // Each branch has one system and server administrator, and two business and branch administrators.
  const roleKey = branchRolePlans[b][branchEmployeeCounts[b]++] ?? 'general_user';
  const scope = roleKey === 'branch_administrator' ? 'own_branch' : 'global';
  await insert(client,'employee_roles',{employee_id:id,role_id:roles.get(roleKey),scope_type:scope,scope_key:scope});
  const socialPlatform = ['threads','bluesky','mastodon'][i%3];
  const socialPath = socialPlatform==='bluesky' ? `/profile/sample${i+1}.example.test` : `/@sample${i+1}`;
  await insert(client,'employee_social_links',{employee_id:id,platform:socialPlatform,url:`https://${socialPlatform}.example.test${socialPath}`});
  const fields = Object.entries({employeeCode:row.employee_code,firstName,lastName,birthDate:birth,gender,bloodType:row.blood_type,email:row.email,hiredAt:hire,branchId:catalog.branches[b],employmentTypeId:catalog.masters.employment_types[type].name,groupId:catalog.group[group],notes:note});
  await history('employee_change_history',id,'create',fields.map(([field,after])=>({field,before:null,after})),hire);
  if (retired) await history('employee_change_history',id,'update',[{field:'retiredAt',before:null,after:retired}],retired);
  if (deleted) await history('employee_change_history',id,'delete',fields.map(([field,before])=>({field,before,after:null})));
 }
 for (let b=0;b<branches.length;b++) await client.query('UPDATE branches SET manager_employee_id=$2, deputy_manager_employee_id=$3 WHERE id=$1',[branches[b],employees[b].id,employees[b+branches.length].id]);
 const key = Buffer.from(process.env.IT_ASSET_CREDENTIAL_ENCRYPTION_KEY ?? '', 'base64url');
 if (key.length!==32) throw new Error('A valid asset credential encryption key is required for samples.');
 const assetTypeCount=catalog.masters.it_asset_types.length;
 for (let i=0;i<128;i++) {
  const t=i%assetTypeCount, s=Math.floor(i/assetTypeCount)%4, type=catalog.masters.it_asset_types[t], loc=storages[i%storages.length];
  const tag=`${type.management_code_prefix}-${String(Math.floor(i/assetTypeCount)+1).padStart(3,'0')}`;
  const purchased=date(year-3,i%12+1,1), disposed=s===3?past(date(year-1,i%12+1,1)):s===2&&Math.floor(i/32)%2?today:null;
  const row={asset_tag:tag,type_id:masterIds.it_asset_types[t],status_id:masterIds.it_asset_statuses[s],storage_id:loc.id,purchased_on:purchased,disposal_on:disposed,
   manufacturer_id:masterIds.manufacturers[i%masterIds.manufacturers.length],model_number:`DEMO-${t+1}-${i+1}`,serial_number:`SAMPLESERIAL${i+1}`,hostname:`sample-device-${i+1}`,notes:note,
   cpu_type_id:type.supports_cpu==='true'?masterIds.cpu_types[i%masterIds.cpu_types.length]:null,ram_gb:type.supports_ram==='true'?[8,16,32,64][Math.floor(i/assetTypeCount)%4]:null,
   operating_system_id:type.supports_os==='true'?masterIds.operating_systems[i%masterIds.operating_systems.length]:null,
   login_username:type.supports_login_username==='true'?`sample${i+1}`:null,admin_username:`sampleadmin${i+1}`,management_console_url:`https://device-${i+1}.example.test`,management_console_username:`sampleconsole${i+1}`};
  const id=await insert(client,'it_assets',row);
  await insert(client,'it_asset_management_codes',{code:tag,asset_id:id});
  for (let slot=1;slot<=2;slot++) {
   const addressNumber=i*2+slot;
   const ipAddress=addressNumber<=254 ? `192.0.2.${addressNumber}` : `198.51.100.${addressNumber-254}`;
   await insert(client,'it_asset_ip_addresses',{asset_id:id,slot,room_id:loc.room,ip_address:ipAddress});
  }
  for (const credential_type of ['admin','login','management_console']) {
   if (credential_type==='login'&&type.supports_login_username!=='true') continue;
   const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
   cipher.setAAD(Buffer.from(`sph:it-asset:${id}:${credential_type}:v1`));
   const encrypted=Buffer.concat([cipher.update(randomBytes(24).toString('base64url'),'utf8'),cipher.final()]);
   await insert(client,'it_asset_credentials',{asset_id:id,credential_type,ciphertext:encrypted.toString('base64url'),initialization_vector:iv.toString('base64url'),authentication_tag:cipher.getAuthTag().toString('base64url')});
  }
  await history('it_asset_change_history',id,'create',Object.entries({assetTag:tag,modelNumber:row.model_number,serialNumber:row.serial_number,purchasedOn:purchased,storageId:`${loc.branchName} / ${loc.roomName} / ${loc.storageName}`,notes:note}).map(([field,after])=>({field,before:null,after})),purchased);
  const previous=employees[(i+72)%288], assigned=past(date(year-2,i%12+1,1)), returned=past(date(year-1,i%12+1,1));
  await insert(client,'it_asset_assignments',{asset_id:id,employee_id:previous.id,assigned_at:timestamp(assigned),returned_at:timestamp(returned)});
  const name={firstName:previous.firstName,middleName:null,lastName:previous.lastName};
  await history('it_asset_change_history',id,'assign',[{field:'assigneeId',before:null,after:name}],assigned);
  await history('it_asset_change_history',id,'return',[{field:'assigneeId',before:name,after:null}],returned);
  if (s===0) {
   const employee=employees[i%288];
   await insert(client,'it_asset_assignments',{asset_id:id,employee_id:employee.id,assigned_at:timestamp(today)});
   await history('it_asset_change_history',id,'assign',[{field:'assigneeId',before:null,after:{firstName:employee.firstName,middleName:null,lastName:employee.lastName}}]);
  }
  if (disposed) await history('it_asset_change_history',id,'update',[{field:'disposalOn',before:null,after:disposed}],disposed);
 }
 for (const id of masterIds.it_asset_types) await client.query('UPDATE it_asset_types SET next_management_number=$2 WHERE id=$1',[id,Math.ceil(128/assetTypeCount)+1]);
 return ['JP', 'US'].filter((_, index) => holidayImports[index].status === 'failed');
}
