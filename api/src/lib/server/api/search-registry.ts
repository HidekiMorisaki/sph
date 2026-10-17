import { Prisma } from '$lib/server/generated/prisma/client';
import type { AuthenticatedUser } from '$lib/server/auth/types';
import { requiredBranchScope } from './branch-access';
import { throwApiError } from './response';
import { bookRentableSql } from './book-availability';

export type SearchTarget = 'employees' | 'books';
export type SearchField = { code: string; label: { en: string; ja: string }; type: 'string' | 'number' | 'date' | 'datetime' | 'boolean' | 'choice'; maxLength: number; choices?: string[]; expression: string; source: string; operation?: string; private?: boolean; reference?: {table:string;key:string;name:string;branch?:string} };
export type SearchContext = { code: string; label: { en: string; ja: string }; category: string; from: string; link: string; operation?: string; branch?: string; private?: boolean; policy?: 'loans' | 'reservations' | 'purchases'; fields: SearchField[] };
const snake = (value: string) => value.replace(/[A-Z]/g, char => '_' + char.toLowerCase()).replace(/([a-z])(\d)/g,'$1_$2');
const english = (value: string) => value.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase());
function fields(model: string, alias: string, specs: string): SearchField[] {
 return specs.split(';').filter(Boolean).map(spec => {
  const [code, ja, kind = 'string', max = '500', options] = spec.split('|');
  return { code, label: { en: english(code), ja }, type: kind as SearchField['type'], maxLength: Number(max), expression: alias + '.' + snake(code), source: model + '.' + code, ...(options ? {choices: options.split(',')} : {}) };
 });
}
const timestamps = ';createdAt|作成日時|datetime;updatedAt|更新日時|datetime';
const orderedModels=new Set(['Branch','Department','EmployeeGroup','Position','EmploymentType','Room','Storage','Role','ItAssetType','Manufacturer','CpuType','OperatingSystem','OperatingSystemVendor','ItAssetStatus']);
const named = (model: string, alias: string, specs = 'name|名称|string|128;notes|備考') => fields(model, alias, specs + (orderedModels.has(model)?';sortOrder|表示順|number':'') + timestamps);
function context(code: string, ja: string, category: string, from: string, link: string, list: SearchField[], extra: Partial<SearchContext> = {}): SearchContext {
 return { code, label: { en: english(code), ja }, category, from, link, fields: list, ...extra };
}
const branchFields = (alias: string) => named('Branch', alias, 'name|名称;openedOn|開設日|date;closedOn|閉鎖日|date;countryCode|国コード|choice|2|JP,US;postalCode|郵便番号|string|10;prefecture|都道府県|string|64;city|市区町村|string|128;streetAddress|番地|string|255;buildingName|建物名|string|255;phoneNumber1|電話番号1|string|32;phoneNumber1Label|電話番号1名称|string|128;phoneNumber2|電話番号2|string|32;phoneNumber2Label|電話番号2名称|string|128;faxNumber1|FAX1|string|32;faxNumber1Label|FAX1名称|string|128;faxNumber2|FAX2|string|32;faxNumber2Label|FAX2名称|string|128;notes|備考');
function prefix(list: SearchField[], value: string, ja: string) { return list.map(field => ({ ...field, code: value + '.' + field.code, label: { en: english(value) + ': ' + field.label.en, ja: ja + '：' + field.label.ja } })); }
const storageJoin = 'JOIN storage location ON location.id=asset.storage_id AND location.deleted_at IS NULL JOIN rooms room ON room.id=location.room_id AND room.deleted_at IS NULL JOIN branches place_branch ON place_branch.id=location.branch_id AND place_branch.deleted_at IS NULL';
const storageFields = [...prefix(named('Storage','location'),'storage','保管場所'),...prefix(named('Room','room'),'room','部屋'),...prefix(branchFields('place_branch'),'branch','拠点')];
const assetFrom = 'it_asset_assignments assignment JOIN it_assets asset ON asset.id=assignment.asset_id AND asset.deleted_at IS NULL ' + storageJoin + ' JOIN it_asset_types asset_type ON asset_type.id=asset.type_id AND asset_type.deleted_at IS NULL LEFT JOIN manufacturers manufacturer ON manufacturer.id=asset.manufacturer_id AND manufacturer.deleted_at IS NULL LEFT JOIN cpu_types cpu ON cpu.id=asset.cpu_type_id AND cpu.deleted_at IS NULL LEFT JOIN operating_systems os ON os.id=asset.operating_system_id AND os.deleted_at IS NULL JOIN it_asset_statuses asset_status ON asset_status.id=asset.status_id AND asset_status.deleted_at IS NULL LEFT JOIN operating_system_vendors os_vendor ON os_vendor.id=os.vendor_id AND os_vendor.deleted_at IS NULL LEFT JOIN manufacturers cpu_manufacturer ON cpu_manufacturer.id=cpu.manufacturer_id AND cpu_manufacturer.deleted_at IS NULL';
const assetLink = 'assignment.employee_id=employee.id AND assignment.deleted_at IS NULL AND assignment.returned_at IS NULL';
const assetFields = [...fields('ItAsset','asset','assetTag|資産番号|string|64;modelNumber|型番|string|255;serialNumber|シリアル番号|string|255;ramGb|RAM (GB)|number;hostname|ホスト名|string|253;purchasedOn|購入日|date;disposalOn|廃棄日|date;notes|備考'+timestamps), ...prefix(fields('ItAssetAssignment','assignment','assignedAt|割当日時|datetime'+timestamps),'assignment','割当'), ...storageFields,...prefix(named('OperatingSystemVendor','os_vendor'),'osVendor','OSベンダー'),...prefix(named('Manufacturer','cpu_manufacturer','name|名称;notes|備考;officialUrl|公式URL;sourceCheckedOn|確認日|date'),'cpuManufacturer','CPUメーカー'),
 ...prefix(named('ItAssetType','asset_type','name|名称;notes|備考;managementCodePrefix|管理コード接頭辞|string|5;supportsCpu|CPU対応|boolean;supportsRam|RAM対応|boolean;supportsOs|OS対応|boolean;supportsLoginUsername|ログイン名対応|boolean'),'type','種別'),...prefix(named('Manufacturer','manufacturer','name|名称;notes|備考;officialUrl|公式URL;sourceCheckedOn|確認日|date'),'manufacturer','メーカー'),...prefix(named('CpuType','cpu','name|名称;series|シリーズ;modelNumber|型番|string|255;notes|備考;officialUrl|公式URL;sourceCheckedOn|確認日|date'),'cpu','CPU'),...prefix(named('OperatingSystem','os','product|製品;version|バージョン;edition|版;architecture|アーキテクチャ;notes|備考;officialUrl|公式URL;sourceCheckedOn|確認日|date'),'os','OS'),...prefix(named('ItAssetStatus','asset_status','name|名称;notes|備考;disposalDatePolicy|廃棄日方針|choice|32|prohibited,optional,required'),'status','状態'),
 ...fields('ItAsset','asset','loginUsername|ログイン名;adminUsername|管理者名|string|255;managementConsoleUrl|管理URL|string|2048;managementConsoleUsername|管理ログイン名|string|255').map(f=>({...f,operation:'assets.credentials.read'}))];
const softwareFields = [...prefix(named('SoftwareProduct','product','name|製品名|string|255;manufacturer|メーカー|string|255;edition|版|string|128;version|バージョン|string|128;productCode|製品コード|string|128;notes|備考'),'product','製品'), ...prefix(fields('SoftwareContract','contract','reference|契約番号|string|255;licenseType|ライセンス種別|choice|32|user,device,concurrent;purchasedQuantity|購入数量|number;startsOn|開始日|date;endsOn|終了日|date;renewsOn|更新日|date;autoRenew|自動更新|boolean;vendor|販売元|string|255;orderNumber|注文番号|string|128;amount|金額|number;currency|通貨|string|3;evidenceReference|証憑|string|2048;notes|備考'+timestamps),'contract','契約'), ...prefix(fields('SoftwareLicenseTerms','terms','countingUnit|集計単位|choice|32|employee,asset,concurrent;usersPerLicense|利用者数／ライセンス|number;devicesPerUser|端末数／利用者|number;usersPerDevice|利用者数／端末|number;concurrentLimit|同時利用上限|number;evidenceStatus|確認状態|choice|16|confirmed,unverified;termsReference|条件参照|string|2048;notes|備考'+timestamps),'terms','契約条件')];
const softwareJoin = ' JOIN software_contracts contract ON contract.id=software.contract_id AND contract.deleted_at IS NULL JOIN software_products product ON product.id=contract.product_id AND product.deleted_at IS NULL LEFT JOIN software_license_terms terms ON terms.contract_id=contract.id AND terms.deleted_at IS NULL';
const assignmentFields = fields('SoftwareAssignment','software','assignmentNo|割当番号|number;assignedOn|割当日|date;plannedReleaseOn|解除予定日|date;notes|備考'+timestamps);
const keyJoin=' LEFT JOIN software_license_keys license_key ON license_key.id=software.key_id AND license_key.contract_id=software.contract_id AND license_key.deleted_at IS NULL';
const keyFields=prefix(fields('SoftwareLicenseKey','license_key','label|ラベル|string|255;activationLimit|認証上限|number;expiresOn|期限|date;notes|備考'+timestamps),'key','ライセンスキーの公開情報');
const installationFields = fields('SoftwareInstallation','software','installationNo|インストール番号|number;installedOn|インストール日|date;notes|備考'+timestamps);
const titleFields = fields('BookTitle','title','catalogCode|書誌コード|string|40;name|書名|string|500;author|著者|string|500;publisher|出版社|string|255;edition|版|string|100;isbn|ISBN|string|13;notes|備考;sourceProvider|登録元|string|40;sourceUrl|登録元URL|string|500;sourceRetrievedAt|取得日時|datetime;coverSource|カバー登録元|string|20;coverSourceUrl|カバーURL|string|500'+timestamps);
const copyFields = fields('BookCopy','copy','copyCode|現物番号|string|40;purchasedOn|購入日|date;status|利用状態|choice|20|available,unavailable;notes|備考'+timestamps);
const copyJoin = ' JOIN storage location ON location.id=copy.storage_id AND location.deleted_at IS NULL JOIN rooms room ON room.id=location.room_id AND room.deleted_at IS NULL JOIN branches place_branch ON place_branch.id=location.branch_id AND place_branch.deleted_at IS NULL';
const reservationFields = fields('BookReservation','reservation','reservationCode|予約番号|string|40;status|状態|choice|20|waiting,held;reservedAt|予約日時|datetime;expiresOn|期限|date'+timestamps);
const purchaseFields = [...fields('BookPurchaseRequest','purchase','requestCode|依頼番号|string|40;kind|種別|choice|20|new,additional;quantity|希望冊数|number;reason|理由;status|状態|choice|20|pending,approved,ordered;decisionReason|判断理由'+timestamps),...prefix(fields('BookPurchaseOrder','purchase_order','orderCode|手配番号|string|40;quantity|手配冊数|number;status|手配状態|choice|20|approved,ordered;decisionReason|判断理由'+timestamps),'order','手配')];
const purchaseJoin = ' JOIN branches purchase_branch ON purchase_branch.id=purchase.branch_id AND purchase_branch.deleted_at IS NULL LEFT JOIN book_purchase_orders purchase_order ON purchase_order.id=purchase.order_id AND purchase_order.deleted_at IS NULL';

export const employeeSearchContexts: SearchContext[] = [
 context('employee','基本・雇用','basic','','true',fields('Employee','employee','employeeCode|社員番号|string|64;firstName|名|string|128;middleName|ミドルネーム|string|128;lastName|姓|string|128;nameKana|ふりがな|string|255;birthDate|生年月日|date;gender|性別|choice|32|female,male,unspecified;bloodType|血液型|choice|8|A,B,O,AB;countryCode|国コード|choice|2|JP,US;postalCode|郵便番号|string|10;prefecture|都道府県|string|64;city|市区町村|string|128;streetAddress|番地|string|255;buildingName|建物名|string|255;mobilePhone|電話番号|string|32;email|メールアドレス|string|254;hiredAt|入社日|date;retiredAt|退職日|date;notes|備考'+timestamps)),
 context('account','アカウント（本人）','other','employees account','account.id=employee.id AND account.deleted_at IS NULL',fields('Employee','account','username|ユーザー名|string|64;accountStatus|アカウント状態|choice|32|unprovisioned,active,suspended'),{private:true}),
 context('branch','所属拠点','organization','branches branch','branch.id=employee.branch_id AND branch.deleted_at IS NULL',branchFields('branch')),
 context('employmentType','雇用形態','organization','employment_types employment_type','employment_type.id=employee.employment_type_id AND employment_type.deleted_at IS NULL',named('EmploymentType','employment_type')),
 context('group','グループ','organization','employee_groups employee_group LEFT JOIN employment_departments parent_department ON parent_department.id=employee_group.department_id AND parent_department.deleted_at IS NULL','employee_group.id=employee.group_id AND employee_group.deleted_at IS NULL',[...named('EmployeeGroup','employee_group'),...prefix(named('Department','parent_department'),'department','部門')]),
 context('departments','所属部門','organization','employee_departments membership JOIN employment_departments department ON department.id=membership.department_id AND department.deleted_at IS NULL','membership.employee_id=employee.id AND membership.deleted_at IS NULL',[...named('Department','department'),...prefix(fields('EmployeeDepartment','membership','isPrimary|主部門|boolean'+timestamps),'membership','所属')]),
 context('positions','役職','organization','employee_positions membership JOIN employment_positions position ON position.id=membership.position_id AND position.deleted_at IS NULL','membership.employee_id=employee.id AND membership.deleted_at IS NULL',[...named('Position','position'),...prefix(fields('EmployeePosition','membership','isPrimary|主役職|boolean'+timestamps),'membership','所属')]),
 context('teams','チーム','organization','employee_teams membership JOIN teams team ON team.id=membership.team_id AND team.deleted_at IS NULL','membership.employee_id=employee.id AND membership.deleted_at IS NULL',[...named('Team','team','name|名称|string|128;description|説明'),...prefix(fields('EmployeeTeam','membership','createdAt|所属日時|datetime;updatedAt|更新日時|datetime'),'membership','所属')],{operation:'teams.read'}),
 context('roles','ロール・適用範囲','organization','employee_roles grant_record JOIN roles role ON role.id=grant_record.role_id AND role.deleted_at IS NULL',"grant_record.employee_id=employee.id AND grant_record.deleted_at IS NULL AND grant_record.scope_type IN ('global','own_branch')",[...named('Role','role'),...fields('EmployeeRole','grant_record','scopeType|付与範囲|choice|32|global,own_branch'+timestamps)]),
 context('managedBranches','主責任拠点','organization','branches branch','branch.manager_employee_id=employee.id AND branch.deleted_at IS NULL',branchFields('branch'),{operation:'masters.read',branch:'branch.id'}),
 context('deputyManagedBranches','副責任拠点','organization','branches branch','branch.deputy_manager_employee_id=employee.id AND branch.deleted_at IS NULL',branchFields('branch'),{operation:'masters.read',branch:'branch.id'}),
 context('skills','スキル','workforce','employee_skills record JOIN skills skill ON skill.id=record.skill_id AND skill.deleted_at IS NULL','record.employee_id=employee.id AND record.deleted_at IS NULL',[...named('Skill','skill','name|名称|string|128;category|分類|string|128;description|説明'),...prefix(fields('EmployeeSkill','record','proficiency|習熟度|number;experienceYears|経験年数|number;notes|備考'+timestamps),'record','習熟')],{operation:'skills.read'}),
 context('participations','案件参画','workforce','project_participations record JOIN projects project ON project.id=record.project_id AND project.deleted_at IS NULL','record.employee_id=employee.id AND record.deleted_at IS NULL',[...named('Project','project','name|名称|string|128;description|説明'),...prefix(fields('ProjectParticipation','record','startsOn|開始日|date;endsOn|終了日|date;responsibility|担当内容'+timestamps),'record','参画')],{operation:'projects.read'}),
 context('calendar','勤務カレンダー','other','work_calendars calendar','calendar.id=employee.work_calendar_id AND calendar.deleted_at IS NULL',named('WorkCalendar','calendar','name|名称|string|128;calendarYear|年度|number;countryCode|国コード|choice|2|JP,US;scheduledWorkMinutesPerDay|所定勤務時間（分）|number;description|説明|string|1000'),{operation:'calendars.read',branch:'employee.branch_id'}),
 context('calendarDays','勤務日','other','work_calendars calendar JOIN work_calendar_days day ON day.calendar_id=calendar.id AND day.deleted_at IS NULL','calendar.id=employee.work_calendar_id AND calendar.deleted_at IS NULL',fields('WorkCalendarDay','day','workDate|勤務日|date;entryType|勤務区分|string|32;title|名称|string|128;note|備考'+timestamps),{operation:'calendars.read',branch:'employee.branch_id'}),
 context('socialLinks','SNS','other','employee_social_links link','link.employee_id=employee.id AND link.deleted_at IS NULL',fields('EmployeeSocialLink','link','platform|プラットフォーム|string|32;url|URL|string|2048'+timestamps)),
 context('avatar','プロフィール画像','other','employee_avatars avatar','avatar.employee_id=employee.id AND avatar.deleted_at IS NULL',fields('EmployeeAvatar','avatar','createdAt|作成日時|datetime;updatedAt|更新日時|datetime')),
 context('assets','現在のIT資産割当','assets',assetFrom,assetLink,assetFields,{operation:'assets.read',branch:'location.branch_id'}),
 context('assetCodes','IT資産管理コード','assets',assetFrom+' JOIN it_asset_management_codes code ON code.asset_id=asset.id AND code.deleted_at IS NULL',assetLink,fields('ItAssetManagementCode','code','code|管理コード'+timestamps),{operation:'assets.read',branch:'location.branch_id'}),
 context('assetIps','IT資産IPアドレス','assets',assetFrom+' JOIN it_asset_ip_addresses ip ON ip.asset_id=asset.id AND ip.deleted_at IS NULL JOIN rooms ip_room ON ip_room.id=ip.room_id AND ip_room.deleted_at IS NULL',assetLink,[...fields('ItAssetIpAddress','ip','slot|スロット|number;ipAddress|IPアドレス|string|45'+timestamps),...prefix(named('Room','ip_room'),'room','部屋')],{operation:'assets.read',branch:'location.branch_id'}),
 context('softwareAssignments','個人へのソフトウェア割当','software','software_assignments software'+softwareJoin+keyJoin,'software.employee_id=employee.id AND software.deleted_at IS NULL AND software.released_on IS NULL',[...assignmentFields,...keyFields,...softwareFields],{operation:'software.read'}),
 context('softwareUsers','ソフトウェア利用者登録','software','software_installation_users usage JOIN software_installations software ON software.id=usage.installation_id AND software.deleted_at IS NULL AND software.removed_on IS NULL JOIN it_assets asset ON asset.id=software.asset_id AND asset.deleted_at IS NULL'+softwareJoin,'usage.employee_id=employee.id AND usage.deleted_at IS NULL AND usage.ended_on IS NULL',[...prefix(fields('SoftwareInstallationUser','usage','usageNo|利用番号|number;startedOn|利用開始日|date;notes|備考'+timestamps),'usage','利用'),...installationFields,...softwareFields],{operation:'software.read'}),
 context('deviceSoftware','割当端末のソフトウェア割当','software',assetFrom+' JOIN software_assignments software ON software.asset_id=asset.id AND software.deleted_at IS NULL AND software.released_on IS NULL'+softwareJoin+keyJoin,assetLink,[...assignmentFields,...keyFields,...softwareFields,...prefix(fields('ItAsset','asset','assetTag|資産番号'),'asset','端末')],{operation:'software.read',branch:'location.branch_id'}),
 context('deviceInstallations','割当端末のインストール','software',assetFrom+' JOIN software_installations software ON software.asset_id=asset.id AND software.deleted_at IS NULL AND software.removed_on IS NULL'+softwareJoin,assetLink,[...installationFields,...softwareFields,...prefix(fields('ItAsset','asset','assetTag|資産番号'),'asset','端末')],{operation:'software.read',branch:'location.branch_id'}),
 context('loans','現在の書籍貸出','books','book_loans loan JOIN book_copies copy ON copy.id=loan.copy_id AND copy.deleted_at IS NULL JOIN book_titles title ON title.id=copy.title_id AND title.deleted_at IS NULL'+copyJoin,'loan.employee_id=employee.id AND loan.deleted_at IS NULL AND loan.returned_on IS NULL',[...fields('BookLoan','loan','loanCode|貸出番号|string|40;loanedOn|貸出日|date;dueOn|返却期限|date'+timestamps),...prefix(titleFields,'title','書誌'),...prefix(copyFields,'copy','現物'),...storageFields],{operation:'books.read',policy:'loans',branch:'location.branch_id'}),
 context('reservations','有効な書籍予約','books','book_reservations reservation JOIN book_titles title ON title.id=reservation.title_id AND title.deleted_at IS NULL JOIN branches branch ON branch.id=reservation.branch_id AND branch.deleted_at IS NULL',"reservation.employee_id=employee.id AND reservation.deleted_at IS NULL AND reservation.status IN ('waiting','held')",[...reservationFields,...prefix(titleFields,'title','書誌'),...prefix(branchFields('branch'),'branch','拠点')],{operation:'books.read',policy:'reservations'}),
 context('purchases','未完了の書籍購入依頼','books','book_purchase_requests purchase JOIN book_titles title ON title.id=purchase.title_id AND title.deleted_at IS NULL'+purchaseJoin,"purchase.employee_id=employee.id AND purchase.deleted_at IS NULL AND purchase.status IN ('pending','approved','ordered')",[...purchaseFields,...prefix(titleFields,'title','書誌'),...prefix(branchFields('purchase_branch'),'branch','拠点')],{operation:'books.purchases.read',policy:'purchases'}),
 context('settings','個人設定（本人）','other','employee_settings settings','settings.employee_id=employee.id AND settings.deleted_at IS NULL',fields('EmployeeSettings','settings','timeZone|タイムゾーン|string|64;displayLanguage|表示言語|choice|64|ja,en;displayCurrency|表示通貨|choice|3|JPY,USD'+timestamps),{private:true}),
 context('widgets','ウィジェット（本人）','other','employee_widgets widget','widget.employee_id=employee.id AND widget.deleted_at IS NULL',fields('EmployeeWidget','widget','code|種類|string|50;sortOrder|表示順|number;enabled|有効|boolean'+timestamps),{private:true})
];

export const bookSearchContexts: SearchContext[] = [
 context('title','書誌','bibliography','','true',titleFields),
 context('copies','現物・配置','inventory','book_copies copy'+copyJoin,'copy.title_id=title.id AND copy.deleted_at IS NULL',[...copyFields,...storageFields]),
 context('branchCopies','指定拠点の冊数','inventory','branches count_branch','count_branch.deleted_at IS NULL',[
  {code:'selection',label:{ja:'拠点',en:'Branch'},type:'choice',maxLength:500,expression:'count_branch.id::text',source:'derived.branchCopies.selection',reference:{table:'branches',key:'id',name:'name'}},
  {code:'copyCount',label:{ja:'現物冊数（指定拠点）',en:'Copy count in selected branch'},type:'number',maxLength:500,expression:'(SELECT count(*) FROM book_copies counted_copy JOIN storage counted_storage ON counted_storage.id=counted_copy.storage_id AND counted_storage.deleted_at IS NULL JOIN rooms counted_room ON counted_room.id=counted_storage.room_id AND counted_room.deleted_at IS NULL WHERE counted_copy.title_id=title.id AND counted_copy.deleted_at IS NULL AND counted_storage.branch_id=count_branch.id)',source:'derived.branchCopies.copyCount'}
 ]),
 context('loans','現在の貸出','circulation','book_loans loan JOIN book_copies copy ON copy.id=loan.copy_id AND copy.deleted_at IS NULL'+copyJoin+' JOIN employees borrower ON borrower.id=loan.employee_id AND borrower.deleted_at IS NULL','copy.title_id=title.id AND loan.deleted_at IS NULL AND loan.returned_on IS NULL',[...fields('BookLoan','loan','loanCode|貸出番号|string|40;loanedOn|貸出日|date;dueOn|返却期限|date'+timestamps),...prefix(fields('Employee','borrower','employeeCode|社員番号|string|64;firstName|名|string|128;lastName|姓'),'borrower','借用者')],{operation:'books.read',policy:'loans',branch:'location.branch_id'}),
 context('reservations','有効な予約（本人）','circulation','book_reservations reservation JOIN branches branch ON branch.id=reservation.branch_id AND branch.deleted_at IS NULL',"reservation.title_id=title.id AND reservation.deleted_at IS NULL AND reservation.status IN ('waiting','held')",reservationFields,{operation:'books.read',policy:'reservations'}),
 context('purchases','未完了の購入依頼','purchases','book_purchase_requests purchase'+purchaseJoin,"purchase.title_id=title.id AND purchase.deleted_at IS NULL AND purchase.status IN ('pending','approved','ordered')",[...purchaseFields,...prefix(branchFields('purchase_branch'),'branch','拠点')],{operation:'books.purchases.read',policy:'purchases'})
];


function virtual(context:SearchContext,code:string,ja:string,type:SearchField['type'],expression:string,choices?:string[]) {
 context.fields.push({code,label:{en:english(code),ja},type,maxLength:500,expression,source:'derived.'+context.code+'.'+code,...(choices?{choices}:{})});
}
const referenceDate="(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date";
const serviceEnd=`LEAST(COALESCE(employee.retired_at,${referenceDate}),${referenceDate})`;
const completedMonths=(end:string,start:string)=>`GREATEST(0,(EXTRACT(YEAR FROM ${end})::int-EXTRACT(YEAR FROM ${start})::int)*12+EXTRACT(MONTH FROM ${end})::int-EXTRACT(MONTH FROM ${start})::int-CASE WHEN EXTRACT(DAY FROM ${end})<EXTRACT(DAY FROM ${start}) THEN 1 ELSE 0 END)`;
virtual(employeeSearchContexts[0],'age','年齢（満年）','number',`(${completedMonths(referenceDate,'employee.birth_date')})/12`);
virtual(employeeSearchContexts[0],'serviceMonths','勤続期間（月）','number',completedMonths(serviceEnd,'employee.hired_at'));
virtual(employeeSearchContexts[0],'employmentStatus','在籍状況','choice',`CASE WHEN employee.retired_at <= ${referenceDate} THEN 'retired' ELSE 'current' END`,['current','retired']);
const participation=employeeSearchContexts.find(ctx=>ctx.code==='participations')!;
virtual(participation,'status','参画状態','choice',`CASE WHEN record.starts_on > ${referenceDate} THEN 'planned' WHEN record.ends_on < ${referenceDate} THEN 'ended' ELSE 'active' END`,['planned','active','ended']);
virtual(participation,'remainingDays','終了までの日数','number',`record.ends_on - ${referenceDate}`);
virtual(employeeSearchContexts.find(ctx=>ctx.code==='loans')!,'overdue','返却期限超過','boolean',`loan.due_on < ${referenceDate}`);
virtual(bookSearchContexts[0],'hasCover','カバーの有無','boolean','title.cover_image IS NOT NULL');
virtual(bookSearchContexts[0],'copyCount','現物冊数（全拠点）','number','(SELECT count(*) FROM book_copies copy WHERE copy.title_id=title.id AND copy.deleted_at IS NULL)');
virtual(bookSearchContexts[0],'rentable','貸出可能（全拠点）','boolean',bookRentableSql().sql);
virtual(bookSearchContexts.find(ctx=>ctx.code==='copies')!,'rentableInBranch','貸出可能（この現物の拠点）','boolean',bookRentableSql('title','location.branch_id').sql);
const settings=employeeSearchContexts.find(ctx=>ctx.code==='settings')!;
// The current settings API permits the selection as a whole; offer each member, not arbitrary JSON paths.
virtual(settings,'analyticsReferenceDate','分析基準日','date',"(settings.analytics_selection->>'referenceDate')::date");
settings.fields.at(-1)!.source='EmployeeSettings.analyticsSelection';
for(const [key,ja] of [['age','年齢'],['gender','性別'],['trend','推移'],['turnover','離職率']])for(const [bound,boundJa] of [['fromMonth','開始月'],['toMonth','終了月']]){virtual(settings,`analytics.${key}.${bound}`,`分析：${ja}・${boundJa}`,'string',`settings.analytics_selection->'charts'->'${key}'->>'${bound}'`);settings.fields.at(-1)!.source='EmployeeSettings.analyticsSelection';}
for(const ctx of employeeSearchContexts.filter(ctx=>['branch','employmentType','group','departments','positions'].includes(ctx.code))){ctx.operation='masters.read';ctx.branch='employee.branch_id';}
employeeSearchContexts.find(ctx=>ctx.code==='roles')!.operation='roles.read';
const refs:Record<string,[string,string,string,string,string?]>={
 branch:['branches','branch','id','name'],employmentType:['employment_types','employment_type','id','name'],group:['employee_groups','employee_group','id','name'],
 departments:['employment_departments','department','id','name'],positions:['employment_positions','position','id','name'],teams:['teams','team','id','name'],roles:['roles','role','id','name'],
 skills:['skills','skill','id','name'],participations:['projects','project','code','name'],calendar:['work_calendars','calendar','id','name'],
 managedBranches:['branches','branch','id','name'],deputyManagedBranches:['branches','branch','id','name']
};
for(const ctx of employeeSearchContexts){const ref=refs[ctx.code];if(!ref)continue;const [table,alias,key,name]=ref;virtual(ctx,'selection','選択','choice',`${alias}.${key}::text`);ctx.fields.at(-1)!.reference={table,key,name};}

export const contextsFor = (target: SearchTarget) => target === 'employees' ? employeeSearchContexts : bookSearchContexts;
export function operationScope(user: AuthenticatedUser, operation: string) {
 // Related read operations must not inherit the saved-filter mutation operation.
 return requiredBranchScope({...user,activeOperation:undefined},operation);
}
export function contextScope(context: SearchContext, user: AuthenticatedUser, target: SearchTarget): Prisma.Sql {
 const constraints: Prisma.Sql[] = [];
 if (context.operation) {
  const scope = operationScope(user,context.operation);
  if (scope !== null) {
   if (!context.branch) throwApiError(403,'SEARCH_FIELD_FORBIDDEN','Search field is not permitted.');
   constraints.push(Prisma.sql`${Prisma.raw(context.branch)}=${scope}`);
  }
 }
 if (['deviceSoftware','deviceInstallations'].includes(context.code)) {
  const scope = operationScope(user,'assets.read');
  if(scope!==null) constraints.push(Prisma.sql`location.branch_id=${scope}`);
 }
 if (context.private) constraints.push(Prisma.sql`employee.id=${user.id}`);
 if (context.policy==='loans') {
  const borrower = target==='employees' ? Prisma.sql`employee.id` : Prisma.sql`loan.employee_id`;
  if (user.permissionOperations.includes('books.manage')) { /* all branch loan records */ }
  else if(user.ownBranchPermissionOperations.includes('books.manage')) constraints.push(Prisma.sql`(${borrower}=${user.id} OR location.branch_id=${user.branchId})`);
  else constraints.push(Prisma.sql`${borrower}=${user.id}`);
 }
 if (context.policy==='reservations') constraints.push(Prisma.sql`reservation.employee_id=${user.id}`);
 if (context.policy==='purchases') constraints.push(Prisma.sql`(purchase.employee_id=${user.id} OR (${user.permissionOperations.includes('books.purchases.manage')} AND (purchase_branch.manager_employee_id=${user.id} OR purchase_branch.deputy_manager_employee_id=${user.id})))`);
 return constraints.length ? Prisma.sql`(${Prisma.join(constraints,' AND ')})` : Prisma.sql`true`;
}

export function operatorsFor(field: Pick<SearchField,'type'>): string[] {
 const base = ['eq','ne','set','unset'];
 if(field.type==='string') return [...base,'contains','notContains'];
 if(field.type==='choice') return [...base,'in','notIn'];
 if(field.type==='boolean') return ['eq'];
 return [...base,'gt','gte','lt','lte','between',...(field.type==='date'||field.type==='datetime'?['relative']:[])];
}
export function searchFieldDefinitions(target: SearchTarget,user: AuthenticatedUser) {
 return contextsFor(target).filter(ctx=>{
  if(ctx.operation&&!user.permissionOperations.includes(ctx.operation)&&!user.ownBranchPermissionOperations.includes(ctx.operation))return false;
  if(['deviceSoftware','deviceInstallations'].includes(ctx.code)&&!user.permissionOperations.includes('assets.read')&&!user.ownBranchPermissionOperations.includes('assets.read'))return false;
  return !ctx.operation || user.permissionOperations.includes(ctx.operation) || Boolean(ctx.branch);
 }).map(ctx=>({code:ctx.code,label:ctx.label,category:ctx.category,related:Boolean(ctx.from),private:ctx.private??false,scope:ctx.policy??(ctx.operation&&user.ownBranchPermissionOperations.includes(ctx.operation)&&!user.permissionOperations.includes(ctx.operation)?'own_branch':'visible'),fields:ctx.fields.filter(field=>!field.operation||user.permissionOperations.includes(field.operation)||Boolean(ctx.branch)&&user.ownBranchPermissionOperations.includes(field.operation)).map(({expression,source,operation,reference,...field})=>({...field,operators:operatorsFor(field)}))}));
}
