import type { SearchContext, SearchField } from './search-registry';

const field = (code: string, en: string, ja: string, type: SearchField['type'], expression: string, source: string, maxLength = 255): SearchField => ({ code, label: { en, ja }, type, expression, source, maxLength });
const reference = (code: string, en: string, ja: string, expression: string, source: string, table: string, name = 'name'): SearchField => ({ ...field(code, en, ja, 'choice', expression, source), reference: { table, key: 'id', name } });
const assignee = (expression: string) => `(SELECT ${expression} FROM it_asset_assignments current_assignment JOIN employees current_employee ON current_employee.id=current_assignment.employee_id WHERE current_assignment.asset_id=asset.id AND current_assignment.returned_at IS NULL AND current_assignment.deleted_at IS NULL ORDER BY current_assignment.assigned_at DESC,current_assignment.id DESC LIMIT 1)`;

export const assetSearchContexts: SearchContext[] = [
	{ code: 'asset', label: { en: 'IT asset', ja: 'IT資産' }, category: 'basic', from: '', link: 'true', fields: [
		reference('type','Asset type','種別','asset.type_id::text','ItAsset.typeId','it_asset_types'),
		reference('branch','Branch','拠点','(SELECT branch_id::text FROM storage WHERE id=asset.storage_id)','ItAsset.storageId','branches'),
		field('assetTag','Asset tag','資産番号','string','asset.asset_tag','ItAsset.assetTag',64),
		field('modelNumber','Model number','型番','string','asset.model_number','ItAsset.modelNumber'),
		field('serialNumber','Serial number','シリアル番号','string','asset.serial_number','ItAsset.serialNumber'),
		reference('status','Status','状態','asset.status_id::text','ItAsset.statusId','it_asset_statuses'),
		field('purchasedOn','Purchase date','購入日','date','asset.purchased_on','ItAsset.purchasedOn'),
		field('disposalOn','Disposal date','廃棄日','date','asset.disposal_on','ItAsset.disposalOn'),
		field('notes','Notes','備考','string','asset.notes','ItAsset.notes',5000),
		reference('manufacturer','Manufacturer','メーカー','asset.manufacturer_id::text','ItAsset.manufacturerId','manufacturers'),
		reference('cpu','CPU','CPU','asset.cpu_type_id::text','ItAsset.cpuTypeId','cpu_types'),
		reference('operatingSystem','Operating system','OS','asset.operating_system_id::text','ItAsset.operatingSystemId','operating_systems',"concat_ws(' ',product,version,edition,architecture)"),
		field('ramGb','RAM (GB)','RAM (GB)','number','asset.ram_gb','ItAsset.ramGb'),
		reference('room','Room','部屋','(SELECT room_id::text FROM storage WHERE id=asset.storage_id AND deleted_at IS NULL)','ItAsset.storageId','rooms'),
		reference('storage','Storage','保管場所','asset.storage_id::text','ItAsset.storageId','storage'),
		field('assigneeName','Current assignee','現在の使用者名','string',assignee("concat_ws(' ',current_employee.first_name,current_employee.middle_name,current_employee.last_name)||' / '||concat_ws(' ',current_employee.last_name,current_employee.middle_name,current_employee.first_name)"),'ItAssetAssignment.employeeId',768),
		field('assigneeCode','Assignee employee code','使用者の社員番号','string',assignee('current_employee.employee_code'),'ItAssetAssignment.employeeId',64),
		field('assignedAt','Assigned at','現在の割当日時','datetime',assignee('current_assignment.assigned_at'),'ItAssetAssignment.assignedAt'),
		field('hostname','Hostname','ホスト名','string','asset.hostname','ItAsset.hostname',253),
		field('createdAt','Created at','作成日時','datetime','asset.created_at','ItAsset.createdAt'),
		field('updatedAt','Updated at','更新日時','datetime','asset.updated_at','ItAsset.updatedAt')
	] },
	{ code: 'ipAddresses', label: { en: 'IP addresses', ja: 'IPアドレス' }, category: 'network', from: 'it_asset_ip_addresses address', link: 'address.asset_id=asset.id AND address.deleted_at IS NULL', fields: [
		field('ipAddress','IP address','IPアドレス','string','address.ip_address','ItAssetIpAddress.ipAddress',45),
		field('slot','Slot','スロット','number','address.slot','ItAssetIpAddress.slot')
	] }
];
