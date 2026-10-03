import { readFileSync } from 'node:fs';
import { createCipheriv, randomBytes } from 'node:crypto';

export const catalogFor = language => JSON.parse(readFileSync(new URL(`sample-data/${language}.json`, import.meta.url), 'utf8'));
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
  const operations = [['system.manage'],['administration.manage'],['assets.manage'],['assets.credentials.read','assets.credentials.write']];
  const permissions = [];
  for (let i=0;i<operations.length;i++) {
   const id = await insert(client,'permissions',{name:catalog.permissions[i]}); permissions.push(id);
   for (const operation of operations[i]) await insert(client,'permission_operations',{operation,permission_id:id});
  }
  const mappings = [[0,1,2,3],[1,2],[2],[1,2,3]];
  for (let i=0;i<mappings.length;i++) {
   const id = await insert(client,'roles',{name:catalog.roles[i]});
   for (const permission of mappings[i]) await insert(client,'role_permissions',{role_id:id,permission_id:permissions[permission]});
  }
 }
 const name = employmentName(catalog,input.employmentType);
 // Legacy provisioning continues to reuse the existing English master.
 let type = await client.query('SELECT id FROM employment_types WHERE name=$1 AND deleted_at IS NULL',[name]);
 if (!type.rowCount) type = await client.query('SELECT id FROM employment_types WHERE name=$1 AND deleted_at IS NULL',[input.employmentType]);
 if (!type.rowCount) return await insert(client,'employment_types',{name});
 return type.rows[0].id;
}

export async function assertSampleDatabaseEmpty(client) {
 const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename")).rows;
 for (const {tablename} of tables) {
  if (!/^[a-z_]+$/.test(tablename) || (await client.query(`SELECT EXISTS(SELECT 1 FROM ${tablename}) AS populated`)).rows[0].populated) {
   throw new Error('Samples require an empty database before initial configuration, including logically deleted rows.');
  }
 }
}

export async function installSamples(client, catalog, {adminId, branchId, displayLanguage}) {
 const today = (await client.query('SELECT CURRENT_DATE::text AS today')).rows[0].today;
 const year = Number(today.slice(0,4));
 const date = (y,m=1,d=1) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
 const past = value => value > today ? today : value;
 const timestamp = value => value+'T00:00:00Z';
 const note = catalog.note;
 const masterIds = {};
 for (const [table, rows] of Object.entries(catalog.masters)) {
  masterIds[table] = [];
  for (let i=0;i<rows.length;i++) {
   const row = {...rows[i],sort_order:i+1};
   if (table === 'employment_types') {
    const found = await client.query('SELECT id FROM employment_types WHERE name=$1',[row.name]);
    if (found.rowCount) { masterIds[table].push(found.rows[0].id); continue; }
   }
   if (row.manufacturer_name) { row.manufacturer_id = masterIds.manufacturers[catalog.masters.manufacturers.findIndex(m => m.name === row.manufacturer_name)]; delete row.manufacturer_name; }
   if (table === 'employee_groups') row.department_id = masterIds.employment_departments[i];
   masterIds[table].push(await insert(client,table,row));
  }
 }
 const branches = [], storages = [];
 // The installer-created branch is one of the six locations, including a custom name.
 for (let b=0;b<6;b++) {
  const id = b === 0 ? branchId : await insert(client,'branches',{name:catalog.branches[b]});
  branches.push(id);
  await client.query('UPDATE branches SET sort_order=$2, opened_on=$3, city=$4, street_address=$5, building_name=$6, phone_number_1=$7, phone_number_1_label=$8, notes=$9 WHERE id=$1',[id,b+1,date(year-15+b),catalog.branches[b],`${b+1} ${catalog.street}`,catalog.building,displayLanguage==='ja' ? `03-0000-${String(b).padStart(4,'0')}` : `+1-202-555-01${String(b).padStart(2,'0')}`,catalog.phoneLabel,note]);
  for (let r=0;r<3;r++) {
   const room = await insert(client,'rooms',{branch_id:id,name:catalog.roomNames[r],sort_order:r+1,notes:note});
   for (let s=0;s<2;s++) storages.push({id:await insert(client,'storage',{branch_id:id,room_id:room,name:catalog.storageNames[s],sort_order:s+1,notes:note}),room});
  }
 }
 const calendar = await insert(client,'work_calendars',{name:catalog.calendar,calendar_year:year,description:note});
 for (let m=1;m<=12;m++) for (let d=1;d<=2;d++) await insert(client,'work_calendar_days',{calendar_id:calendar,work_date:date(year,m,d),entry_type:d===1?'working_day':'company_holiday',title:d===1?catalog.working:catalog.holiday,note});
 await insert(client,'external_links',{name:catalog.external,url:'https://intranet.example.test',sort_order:1});
 const roles = (await client.query('SELECT id FROM roles ORDER BY id')).rows.map(r=>r.id);
 const employees = [];
 const history = async (table,subject,action,changes,at=today) => {
  const key = table === 'employee_change_history' ? 'employee_id':'asset_id';
  const id = await insert(client,table,{[key]:subject,actor_id:adminId,action,changes:JSON.stringify(changes),changed_at:timestamp(at)});
  await insert(client,'audit_logs',{actor_id:adminId,action:'sample_import',resource:table,resource_id:id,detail:JSON.stringify({sample:true,language:displayLanguage,simulatedAction:action})});
 };
 for (let i=0;i<360;i++) {
  const gender = ['female','male','unspecified'][i%3];
  const firstName = (gender==='female'||gender==='unspecified'&&i%2===0 ? catalog.femaleNames:catalog.maleNames)[i%20];
  const lastName = catalog.lastNames[Math.floor(i/20)];
  const ageGroup = Math.floor(i/3)%6;
  const ageBase = i>=288 ? 30+(i%32) : [19,20,30,40,50,60][ageGroup]+(ageGroup===0?0:Math.floor(i/18)%10);
  const birth = date(Math.max(1965,year-ageBase),i%12+1,i%27+1);
  const age = year-Number(birth.slice(0,4));
  const retired = i>=288 ? past(date(year-i%10,(i*5)%12+1,1)) : null;
  const hireYear = retired ? Number(retired.slice(0,4))-1-i%Math.max(1,age-30) : year-(i*7)%Math.max(1,Math.min(25,age-18));
  const hire = past(date(Math.max(Number(birth.slice(0,4))+18,hireYear),(i*7)%12+1,1));
  const deleted = i>=342 ? timestamp(today):null;
  const b = Math.floor(i/15)%6, group=Math.floor(i/6)%3, position=Math.floor(i/18)%3, type=Math.floor(i/54)%4;
  const row = {employee_code:`SAMPLEEMP${String(i+1).padStart(6,'0')}`,first_name:firstName,last_name:lastName,
   birth_date:birth,gender,blood_type:['A','B','AB','O',null][i%5],email:`sample.employee.${i+1}@example.test`,hired_at:hire,retired_at:retired,
   employment_type_id:masterIds.employment_types[type],branch_id:branches[b],group_id:masterIds.employee_groups[group],work_calendar_id:calendar,
   city:catalog.branches[b],street_address:`${i+1} ${catalog.street}`,building_name:catalog.building,mobile_phone:displayLanguage==='ja'?`090-0000-${String(i+1).padStart(4,'0')}`:`+1-202-555-${String(100+i%100).padStart(4,'0')}`,
   middle_name:displayLanguage==='en'&&i%5===0 ? (gender==='female'?'Jane':'Lee'):null,
   name_kana:displayLanguage==='ja' ? `${catalog.lastNamesKana[Math.floor(i/20)]} ${(gender==='female'||gender==='unspecified'&&i%2===0 ? catalog.femaleNamesKana:catalog.maleNamesKana)[i%20]}` : null,
   notes:note,deleted_at:deleted};
  const id = await insert(client,'employees',row); employees.push({id,firstName,lastName,hire,retired,deleted});
  await insert(client,'employee_settings',{employee_id:id,display_language:displayLanguage,time_zone:displayLanguage==='ja'?'Asia/Tokyo':'Europe/London'});
  await insert(client,'employee_departments',{employee_id:id,department_id:masterIds.employment_departments[group],is_primary:true});
  await insert(client,'employee_positions',{employee_id:id,position_id:masterIds.employment_positions[position],is_primary:true});
  if (i%4===0) {
   await insert(client,'employee_departments',{employee_id:id,department_id:masterIds.employment_departments[(group+1)%3],is_primary:false});
   await insert(client,'employee_positions',{employee_id:id,position_id:masterIds.employment_positions[(position+1)%3],is_primary:false});
  }
  // All 15 nonempty combinations of the four roles are represented; accounts remain unprovisioned.
  const mask=i%15+1;
  for (let r=0;r<4;r++) if (mask & 1<<r) await insert(client,'employee_roles',{employee_id:id,role_id:roles[r]});
  if (i%30===0) {
   const department = masterIds.employment_departments[group];
   await insert(client,'employee_roles',{employee_id:id,role_id:roles[2],scope_type:'department',scope_key:`department:${department}`,department_id:department});
   await insert(client,'employee_roles',{employee_id:id,role_id:roles[2],scope_type:'employee',scope_key:`employee:${id}`,scope_employee_id:id});
  }
  await insert(client,'employee_social_links',{employee_id:id,platform:i%2?'website':'blog',url:`https://people.example.test/${i+1}`});
  const fields = Object.entries({employeeCode:row.employee_code,firstName,lastName,birthDate:birth,gender,bloodType:row.blood_type,email:row.email,hiredAt:hire,branchId:catalog.branches[b],employmentTypeId:catalog.masters.employment_types[type].name,groupId:catalog.group[group],notes:note});
  await history('employee_change_history',id,'create',fields.map(([field,after])=>({field,before:null,after})),hire);
  if (retired) await history('employee_change_history',id,'update',[{field:'retiredAt',before:null,after:retired}],retired);
  if (deleted) await history('employee_change_history',id,'delete',fields.map(([field,before])=>({field,before,after:null})));
 }
 for (let b=0;b<6;b++) await client.query('UPDATE branches SET manager_employee_id=$2, deputy_manager_employee_id=$3 WHERE id=$1',[branches[b],employees[b].id,employees[b+6].id]);
 const key = Buffer.from(process.env.IT_ASSET_CREDENTIAL_ENCRYPTION_KEY ?? '', 'base64url');
 if (key.length!==32) throw new Error('A valid asset credential encryption key is required for samples.');
 for (let i=0;i<128;i++) {
  const t=i%8, s=Math.floor(i/8)%4, type=catalog.masters.it_asset_types[t], loc=storages[i%36];
  const tag=`${type.management_code_prefix}-${String(Math.floor(i/8)+1).padStart(3,'0')}`;
  const purchased=date(year-3,i%12+1,1), disposed=s===3?past(date(year-1,i%12+1,1)):s===2&&Math.floor(i/32)%2?today:null;
  const row={asset_tag:tag,type_id:masterIds.it_asset_types[t],status_id:masterIds.it_asset_statuses[s],storage_id:loc.id,purchased_on:purchased,disposal_on:disposed,
   manufacturer_id:masterIds.manufacturers[i%masterIds.manufacturers.length],model_number:`DEMO-${t+1}-${i+1}`,serial_number:`SAMPLESERIAL${i+1}`,hostname:`sample-device-${i+1}`,notes:note,
   cpu_type_id:type.supports_cpu==='true'?masterIds.cpu_types[i%masterIds.cpu_types.length]:null,ram_gb:type.supports_ram==='true'?[8,16,32,64][Math.floor(i/8)%4]:null,
   operating_system_id:type.supports_os==='true'?masterIds.operating_systems[i%masterIds.operating_systems.length]:null,
   login_username:type.supports_login_username==='true'?`sample${i+1}`:null,admin_username:`sampleadmin${i+1}`,management_console_url:`https://device-${i+1}.example.test`,management_console_username:`sampleconsole${i+1}`};
  const id=await insert(client,'it_assets',row);
  await insert(client,'it_asset_management_codes',{code:tag,asset_id:id});
  for (let slot=1;slot<=2;slot++) await insert(client,'it_asset_ip_addresses',{asset_id:id,slot,room_id:loc.room,ip_address:`192.0.2.${i*2+slot<=254?i*2+slot:i*2+slot-254}`});
  for (const credential_type of ['admin','login','management_console']) {
   if (credential_type==='login'&&type.supports_login_username!=='true') continue;
   const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
   cipher.setAAD(Buffer.from(`sph:it-asset:${id}:${credential_type}:v1`));
   const encrypted=Buffer.concat([cipher.update(randomBytes(24).toString('base64url'),'utf8'),cipher.final()]);
   await insert(client,'it_asset_credentials',{asset_id:id,credential_type,ciphertext:encrypted.toString('base64url'),initialization_vector:iv.toString('base64url'),authentication_tag:cipher.getAuthTag().toString('base64url')});
  }
  await history('it_asset_change_history',id,'create',Object.entries({assetTag:tag,modelNumber:row.model_number,serialNumber:row.serial_number,purchasedOn:purchased,storageId:`${catalog.branches[Math.floor((i%36)/6)]} / ${catalog.roomNames[Math.floor((i%6)/2)]} / ${catalog.storageNames[i%2]}`,notes:note}).map(([field,after])=>({field,before:null,after})),purchased);
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
 for (const id of masterIds.it_asset_types) await client.query('UPDATE it_asset_types SET next_management_number=17 WHERE id=$1',[id]);
}
